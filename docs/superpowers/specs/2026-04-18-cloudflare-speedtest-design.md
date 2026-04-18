# Replace fast-cli with Cloudflare Speed Test — Design Spec

Date: 2026-04-18
Status: approved — ready for implementation plan

## Goal

Replace the `fast-cli` (Puppeteer + Chromium) measurement engine with
Cloudflare's official `@cloudflare/speedtest` package. Ship a radically
smaller, faster Docker image with no browser dependency while preserving
the existing scheduler / DB / alerts / WebSocket flow.

## Why

- `fast-cli` drags `puppeteer-core` + the Debian `chromium` package into
  the runtime image (~690 MB Chromium + fonts + sandbox deps).
- The browser launch + fast.com page load dominates measurement time
  (~90 s per run).
- Cloudflare's speedtest engine runs in Node 18+ via HTTP only: no
  browser, no sandbox, no `/dev/shm` requirement.
- Methodology is equivalent for the user's mental model ("internet to
  nearby CDN edge") — just a different CDN.
- Free bonus: Cloudflare returns jitter, packet loss, and ISP / colo
  metadata we don't currently store.

## Scope

In-scope (v1):
- Single engine (Cloudflare). `fast-cli`, `puppeteer-core`,
  `.puppeteerrc.cjs`, and the Chromium Debian package are removed.
- Additive schema migration: three new nullable columns on
  `measurements` (`jitter_ms`, `packet_loss_pct`, `user_isp`).
- `MeasurementDto` / WebSocket payload extended with the new fields.
- Runner signature (`runMeasurement`, `runMeasurementSafe`,
  `MeasurementBusyError`) kept identical so the scheduler and API
  handlers don't change.
- Dockerfile `runner` stage: remove Chromium + font packages + all
  Chromium-specific purge steps + `PUPPETEER_*` env vars.
- Dockerfile `runtime-deps` stage: swap `fast-cli` for
  `@cloudflare/speedtest`.
- Timeout reduced from 180 s to 60 s.

Out of scope (v2+):
- Pluggable multi-engine support (`FASTCOM_ENGINE=cloudflare|…`).
- UI surfacing of the new fields (jitter / packet loss / ISP / colo);
  they are stored now and can be rendered in a follow-up without another
  migration.
- Renaming "Fastcom Monitor" brand / repo / env vars.
- Rewriting history (no attempt to re-measure past rows).

## Conditions / correctness

- Concurrency is gated by the existing `globalThis.__fastcomRunning`
  flag. Second callers get `MeasurementBusyError`.
- Status mapping after a run:
  - `success` iff both `downloadMbps` and `uploadMbps` are non-null
    numbers.
  - `timeout` iff the error message matches `/timed out/i`.
  - `error` otherwise.
- Partial results (e.g. upload leg fails mid-test) → the runner throws,
  caught by the runner's try/catch, stored as `error` with the truncated
  message. The row is still broadcast and fed to `handleAlertsForMeasurement`.

## Architecture

```
lib/measurement/
  types.ts              EngineResult { downloadMbps, uploadMbps, latencyUnloadedMs,
                                       latencyLoadedMs, bufferBloatMs, jitterMs,
                                       packetLossPct, userLocation, userIp, userIsp,
                                       coloCode }
  cloudflare.ts         runCloudflareSpeedTest() — wraps @cloudflare/speedtest
                        and maps its summary to EngineResult
  runner.ts             runMeasurement() / runMeasurementSafe() /
                        MeasurementBusyError / isMeasurementRunning
```

Integration points:
- `app/api/measurements/run/route.ts`: unchanged (imports `runMeasurement`
  from the new path after rename).
- `lib/scheduler/index.ts`: unchanged (imports `runMeasurementSafe` from
  the new path).
- `lib/ws/broadcast.ts`: unchanged.
- `lib/alerts/handle.ts`: unchanged (still called via `void
  handleAlertsForMeasurement(row)` from inside the runner).

The public runner contract — `Promise<Measurement>` on both success and
error paths — is preserved exactly, so no downstream code changes.

## Data model

Drizzle migration, additive only, on the existing `measurements` table:

```ts
// lib/db/schema.ts — ADDITIONS to the existing measurements definition
jitterMs: real('jitter_ms'),
packetLossPct: real('packet_loss_pct'),
userIsp: text('user_isp'),
```

Generated SQL (expected):

```sql
ALTER TABLE measurements ADD COLUMN jitter_ms REAL;
ALTER TABLE measurements ADD COLUMN packet_loss_pct REAL;
ALTER TABLE measurements ADD COLUMN user_isp TEXT;
```

All three are nullable. Historical rows produced by fast-cli stay `null`
for these columns forever — intended; the data did not exist.

`MeasurementDto` in `lib/types.ts` gets the same three fields as
`number | null` and `string | null`. `toMeasurementDto` forwards them.
The WebSocket `measurement` event payload picks them up automatically.

`HistoryTable` / `KpiCards` / `HistoryChart` do not need to render the
new fields for v1 (they continue to show the existing columns); the
fields are only persisted and broadcast.

## Cloudflare engine

### Library

`@cloudflare/speedtest@^1` — official package, Node 18+ compatible,
~70 KB, zero native deps.

### Measurement recipe

```ts
import Speedtest from '@cloudflare/speedtest';

const engine = new Speedtest({
  autoStart: false,
  measurements: [
    { type: 'latency', numPackets: 20 },
    { type: 'download',  bytes: 1e5,   count: 1 },   // warm-up
    { type: 'download',  bytes: 1e6,   count: 8 },
    { type: 'download',  bytes: 1e7,   count: 6 },
    { type: 'download',  bytes: 2.5e7, count: 4, bypassMinDuration: true },
    { type: 'upload',    bytes: 1e5,   count: 1 },
    { type: 'upload',    bytes: 1e6,   count: 8 },
    { type: 'upload',    bytes: 1e7,   count: 6 },
    { type: 'packetLoss', numPackets: 1000, responsesWaitTime: 3000 },
  ],
});
```

The engine exposes `onFinish(results)` and `onError(err)` callbacks. We
wrap it in a Promise with a 60 s timeout that calls `engine.pause()` and
rejects with `new Error('timed out')` so the existing runner
`/timed out/i` heuristic routes the row to `status: 'timeout'`.

### Summary mapping

```ts
downloadMbps      = summary.download / 1_000_000            // bps → Mbps, rounded upstream in UI formatters
uploadMbps        = summary.upload   / 1_000_000
latencyUnloadedMs = summary.latency                         // ms
latencyLoadedMs   = max(summary.downLoadedLatency, summary.upLoadedLatency)
bufferBloatMs     = max(latencyLoadedMs - latencyUnloadedMs, 0), Math.round
jitterMs          = summary.jitter
packetLossPct     = summary.packetLoss
```

### User info mapping

`results.getUserInfo()` returns the client + edge metadata. We map:

```ts
userLocation = [meta.city, meta.country].filter(Boolean).join(', ') || null
userIp       = meta.clientIp ?? null
userIsp      = meta.asOrganization ?? meta.isp ?? null
coloCode     = meta.colo ?? null    // e.g. "CDG", "LAX", "FRA"
serverLocations = coloCode ? [coloCode] : null
```

`coloCode` is stored both as `serverLocations[0]` (to preserve the
existing column's usage) and — intentionally — dropped from the DTO as
its own field. Keeping it in `serverLocations` avoids yet another
column and matches what the UI already shows. If a v2 wants a dedicated
"edge" column it can split later.

## Edge cases

1. **Offline / DNS failure.** `fetch` rejects within seconds → `onError`
   → Promise reject → caught by the runner → row inserted with
   `status: 'error'` and the message truncated to 500 chars.
2. **Partial success.** If the engine finishes but `downloadMbps` or
   `uploadMbps` is `null`, the runner throws
   `new Error('incomplete results: download=<X> upload=<Y>')` which is
   then stored as `status: 'error'`. Keeps the dashboard honest: we
   don't plot "success" for half-measurements.
3. **Slow connection.** 60 s timeout. Partial progress is discarded;
   we prefer a clean failure over half data.
4. **Concurrent trigger.** `MeasurementBusyError` thrown as today.
5. **Cloudflare colo changes between runs.** Expected; captured per-row
   in `serverLocations`.
6. **Scheduler + manual trigger collision.** Same concurrency flag
   protects both paths (existing behaviour preserved).

## Dockerfile changes

### `runtime-deps` stage

`bun add` list diff:
```
- fast-cli@^5.2.0
+ @cloudflare/speedtest@^1
```

Also audit whether `execa` is still used (it was only needed to spawn
`fast`). If `grep -rn "execa" lib/ app/` returns no hit post-refactor,
remove it from the list too.

### `runner` stage

- Remove from `apt-get install`: `chromium`, `fonts-liberation`.
- Remove all `PUPPETEER_*` env vars.
- Remove the entire Chromium-specific purge block (Vulkan validation
  layer, locales, icon/icons, `/usr/share/chromium` cleanup).
- Keep: `ca-certificates`, `dumb-init`, the `nodejs` user creation, the
  `mkdir /data && chown` step, the COPY --chown lines.

Expected result:
- Image size: ~1.13 GB → ~350–400 MB (down ~70 %).
- No need for `--shm-size`, `--cap-add`, or running the container
  `--privileged` (we never required these, but the reduction in attack
  surface is real).

## Testing

Colocated `.test.ts` files under `lib/measurement/`:

| File | Covers |
|---|---|
| `lib/measurement/cloudflare.test.ts` | Mock of `@cloudflare/speedtest` via `vi.mock`. Full summary → every field mapped correctly. Summary with `upload: undefined` → EngineResult with `uploadMbps: null`. `onError` path → Promise rejects. 60 s timeout → `engine.pause()` called and rejection with `timed out`. |
| `lib/measurement/runner.test.ts` | Mock `runCloudflareSpeedTest`. Happy path → row inserted with `status='success'`, measurement + alert broadcast. Partial results → `status='error'` with the incomplete-results message. Engine error → `status='error'`. Timeout text triggers `status='timeout'`. Concurrent invocation throws `MeasurementBusyError`. |

Existing tests not covered by this spec (`lib/fastcli/runner.test.ts`
does not exist today, so nothing to migrate). Scheduler and API tests
continue to pass unchanged.

## Migration & rollout

1. Drizzle: edit `lib/db/schema.ts`, run `bunx drizzle-kit generate`,
   inspect/commit the `drizzle/NNNN_*.sql`.
2. `bun install` — `@cloudflare/speedtest` added, `fast-cli` removed.
3. Rewrite `lib/fastcli/runner.ts` imports and file tree into
   `lib/measurement/`.
4. Update `app/api/measurements/run/route.ts` and `lib/scheduler/index.ts`
   imports to the new path.
5. Delete `lib/fastcli/` and `.puppeteerrc.cjs`.
6. Rewrite the `Dockerfile` (two stages).
7. README: replace "fast.com / fast-cli" mentions in the Stack section
   and the "End-to-end check" expected duration ("~90s" → "~20s").
   Add a short "Upgrading" note: data shape unchanged, three new
   nullable columns are added on first boot, measurements from before
   the upgrade keep the `Paris, FR / Saint Denis, FR` serverLocations
   while post-upgrade rows will read `CDG`/`FRA`/etc.

### Backwards compatibility

- Schema change is additive; migrations run cleanly on existing DBs.
- API / WS payloads gain three nullable fields; clients that only read
  the existing fields keep working.
- UX: speed numbers may differ slightly vs. fast.com runs (different
  CDN backends). Documented in the upgrade note.

### Rollback

- `git revert` the merge commit.
- Columns `jitter_ms`, `packet_loss_pct`, `user_isp` remain in the DB
  (harmless unused columns).
- Re-deploy the old image.

## Deliverable summary

```
lib/measurement/
  types.ts
  cloudflare.ts
  cloudflare.test.ts
  runner.ts
  runner.test.ts
lib/fastcli/                    (DELETED)
.puppeteerrc.cjs                (DELETED)
lib/db/schema.ts                (+ 3 columns on measurements)
lib/types.ts                    (+ 3 fields on MeasurementDto + mapping)
drizzle/NNNN_speedtest_engine.sql  (generated)
app/api/measurements/run/route.ts  (import path update)
lib/scheduler/index.ts          (import path update)
package.json                    (- fast-cli, - puppeteer-core if present,
                                 + @cloudflare/speedtest)
Dockerfile                      (runtime-deps: swap dep;
                                 runner: remove Chromium + PUPPETEER env
                                 + Chromium purge block)
README.md                       (Stack + E2E duration + Upgrade note)
```

## Open questions

None at design time.
