# Bun Runtime Migration - Phase 1 Design Spec

Date: 2026-04-18
Status: approved - ready for implementation plan

## Goal

Unify the dev and prod runtime on Bun. Replace `better-sqlite3` with
`bun:sqlite`, drop vitest in favour of `bun:test`, and run the prod
container on `oven/bun:1-slim`. `ws` and `@node-rs/argon2` stay (phases
2 and 3 handle those separately).

## Why

- One runtime everywhere eliminates the Bun-vs-Node friction (the
  `bunfig.toml` block on `bun test` exists exactly because of this
  split).
- `better-sqlite3` is a native N-API module that needs a C toolchain to
  build from source; `bun:sqlite` is built into Bun. Drops
  `better-sqlite3`, `@types/better-sqlite3`, `python3`, `make`, and
  `g++` from the build.
- `bun:test` is the project's canonical test runner once the runtime is
  Bun: same-process, no separate Node binary, `bun test --watch` works
  out of the box.
- Image gets a touch smaller and simpler (no `node` binary, only `bun`).

## Scope

In-scope (Phase 1):
- SQLite driver swap: `better-sqlite3` + `drizzle-orm/better-sqlite3`
  -> `bun:sqlite` + `drizzle-orm/bun-sqlite`. Same schema, same data
  format.
- Test runner swap: `vitest` -> `bun:test`. Thirty test files migrated
  in seven incremental batches.
- Dockerfile: every stage on `oven/bun:1-slim`. Drops `python3`,
  `make`, `g++` install from `deps` and `runtime-deps`. Runner `CMD`
  switches from `node dist/server.js` to `bun dist/server.js`.
- `bunfig.toml` + `scripts/block-bun-test.ts` deleted (the block only
  existed to keep users off `bun test` while `better-sqlite3` was in
  play).
- `tsconfig.json` picks up `@types/bun`.
- README Stack + Development sections updated.

Out of scope (separate phases):
- `ws` -> `Bun.serve` websocket rewrite (Phase 2).
- `@node-rs/argon2` -> `Bun.password` (Phase 3).
- Any runtime feature work (measurements, alerts, auth, etc.).

## Architecture

Runtime stack after Phase 1:

| Concern | Before | After |
|---|---|---|
| Dev runtime | Bun 1.3 (tsx-under-Bun) | Bun 1.x |
| Prod runtime | Node 24 | Bun 1.x |
| SQLite driver | `better-sqlite3` (N-API) | `bun:sqlite` (built-in) |
| Drizzle adapter | `drizzle-orm/better-sqlite3` | `drizzle-orm/bun-sqlite` |
| WebSocket | `ws` npm package | `ws` npm package (same) |
| Password hashing | `@node-rs/argon2` | `@node-rs/argon2` (same) |
| Test runner | vitest | bun:test |

### `lib/db/client.ts`

```ts
import { mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import { Database } from 'bun:sqlite';
import { drizzle } from 'drizzle-orm/bun-sqlite';
import * as schema from './schema';

declare global {
  var __fastcomDb: { sqlite: Database; db: ReturnType<typeof drizzle> } | undefined;
}

function openDatabase() {
  const path = getDbPath();
  mkdirSync(dirname(path), { recursive: true });
  const sqlite = new Database(path, { create: true });
  sqlite.exec('PRAGMA journal_mode = WAL');
  sqlite.exec('PRAGMA foreign_keys = ON');
  sqlite.exec('PRAGMA synchronous = NORMAL');
  const db = drizzle(sqlite, { schema });
  return { sqlite, db };
}
```

Differences worth calling out:
- `new Database(path, { create: true })` - `bun:sqlite` does not create
  the file by default; must pass `{ create: true }` for the prod path.
  `:memory:` does not need it.
- `.pragma(stmt)` does not exist on `bun:sqlite`; replaced with
  `.exec('PRAGMA ...')`. Drizzle does not call these itself.
- `Database` is the class directly (no `Database.Database` namespace).
- `.close()`, `.prepare()`, `.run()`, `.exec()`, `.query()` - compatible.
  Drizzle masks all of this.

### `lib/db/migrate.ts`

Only the migrator import changes:

```ts
// before
import { migrate } from 'drizzle-orm/better-sqlite3/migrator';
// after
import { migrate } from 'drizzle-orm/bun-sqlite/migrator';
```

### `drizzle.config.ts`

If the `driver` / `dialect` fields reference better-sqlite3, they move
to the bun-sqlite equivalent. `dialect: 'sqlite'` keeps working (drizzle
uses the file driver for generating migrations; bun-sqlite and
better-sqlite3 share the same SQL dialect target).

### Test fixtures

Every test that currently does:

```ts
import Database from 'better-sqlite3';
import { drizzle } from 'drizzle-orm/better-sqlite3';

const sqlite = new Database(':memory:');
const db = drizzle(sqlite, { schema });
globalThis.__fastcomDb = { sqlite, db };
```

becomes:

```ts
import { Database } from 'bun:sqlite';
import { drizzle } from 'drizzle-orm/bun-sqlite';

const sqlite = new Database(':memory:');
const db = drizzle(sqlite, { schema });
globalThis.__fastcomDb = { sqlite, db };
```

No other semantic change - the fixtures already work with in-memory DBs
the same way on both drivers.

## Tests: vitest -> bun:test migration

### API mapping

```
vitest                          bun:test
-------------------------------------------------------
import ... from 'vitest'        import ... from 'bun:test'
vi.fn()                         mock()
vi.fn(fn)                       mock(fn)
fn.mockResolvedValue(x)         same API (compatible)
fn.mockRejectedValue(e)         same API
fn.mockImplementation(impl)     same API
fn.mockReset()                  same API
fn.mockReturnValueOnce(x)       same API
fn.mock.calls[i][j]             same API
vi.mock('./foo', factory)       mock.module('./foo', factory)
vi.spyOn(obj, 'method')         spyOn(obj, 'method')
vi.restoreAllMocks()            mock.restore() (or rely on beforeEach)
vi.useFakeTimers()              jest.useFakeTimers()
vi.advanceTimersByTime(ms)      jest.advanceTimersByTime(ms)
vi.useRealTimers()              jest.useRealTimers()
expect(*).toBe/toEqual/...      identical
await expect(p).rejects.toThrow identical
```

`jest` is re-exported from `bun:test` (Bun provides the Jest-compat
namespace) - `import { jest } from 'bun:test'` gives access to
`useFakeTimers`, `advanceTimersByTime`, and `useRealTimers`.

### Hoisting caveat

`vi.mock(path, factory)` is hoisted to the top of the file by vitest's
transformer. `bun:test`'s `mock.module(path, factory)` is *not*
hoisted - the call must execute before anything imports the mocked
module. Our existing pattern already handles this with dynamic imports:

```ts
mock.module('./destinations', () => ({ ... }));
const { handleAlertsForMeasurement } = await import('./handle');
```

All files that use `vi.mock` already follow this pattern thanks to a
prior refactor (see grep `await import(` in tests). No restructuring is
needed.

### Conversion batches

Tests are migrated in seven batches. Each batch runs `bun test` on its
own scope; the suite is committed green before moving on.

| Batch | Files | Theme |
|---|---|---|
| B1 | `lib/format.test.ts`, `lib/scheduler/cron-expr.test.ts`, `lib/alerts/evaluate.test.ts`, `lib/alerts/format.test.ts`, `lib/auth/config.test.ts`, `lib/auth/hash.test.ts`, `lib/alerts/config.test.ts` | pure, no DB, no mocks |
| B2 | `lib/types.test.ts`, `lib/measurements.test.ts`, `lib/auth/users.test.ts`, `lib/auth/bootstrap.test.ts`, `lib/alerts/rules.test.ts`, `lib/alerts/state.test.ts`, `lib/alerts/streak.test.ts` | DB fixtures (:memory:) |
| B3 | `lib/alerts/destinations/webhook.test.ts`, `ntfy`, `discord`, `slack`, `smtp`, `lib/alerts/dispatch.test.ts`, `lib/alerts/handle.test.ts` | fetch mocks, mock.module |
| B4 | `lib/measurement/cloudflare.test.ts`, `lib/measurement/runner.test.ts` | measurement engine |
| B5 | `lib/auth/providers.test.ts` | providers |
| B6 | `app/api/users/route.test.ts`, `app/api/users/[id]/route.test.ts`, `app/api/users/[id]/reset-password/route.test.ts`, `app/api/auth/setup/route.test.ts`, `app/api/account/password/route.test.ts` | API routes: users + auth |
| B7 | `app/api/alerts/rules/route.test.ts`, `app/api/alerts/test/route.test.ts`, `app/api/settings/settings-schema.test.ts` | API routes: alerts + settings |

Seven commits (one per batch).

### `package.json` scripts

```
"test": "bun test"
"test:watch": "bun test --watch"
```

Dev dependencies:
- Remove: `vitest`
- Remove: `better-sqlite3`, `@types/better-sqlite3`
- Add: `@types/bun` (dev)

## Dockerfile

### ARG

```
ARG BUN_IMAGE=oven/bun:1-slim
```

No `NODE_IMAGE` ARG (obsolete).

### All four stages

All `FROM` lines use `${BUN_IMAGE}`. The `deps`, `builder`, and
`runtime-deps` stages no longer `apt-get install python3 make g++` -
those were only there to compile `better-sqlite3` from source; every
remaining native module (`@node-rs/argon2`, `sharp`/`@img/sharp-libvips-*`)
ships prebuilds for `linux-x64` and `linux-arm64`.

### `runtime-deps`

`bun add` list drops `better-sqlite3@^12.9.0`. The pruning logic that
targets `node_modules/better-sqlite3/prebuilds` no longer matches
anything - not harmful, but simplify by removing the block.

### `runner`

```
FROM ${BUN_IMAGE} AS runner
WORKDIR /app
ENV NODE_ENV=production \
    NEXT_TELEMETRY_DISABLED=1 \
    HOSTNAME=0.0.0.0 \
    PORT=3000 \
    FASTCOM_DB_PATH=/data/fastcom.db \
    FASTCOM_INTERVAL_MINUTES=15

RUN apt-get update \
 && apt-get install -y --no-install-recommends \
      ca-certificates dumb-init \
 && rm -rf /var/lib/apt/lists/* \
 && rm -rf \
      /usr/share/doc/* \
      /usr/share/man/* \
      /usr/share/info/* \
      /usr/share/locale/* \
      /var/cache/apt/archives/* \
 && groupadd --system --gid 1001 nodejs \
 && useradd  --system --uid 1001 --gid nodejs --create-home --home /home/nodejs nodejs \
 && mkdir -p /data \
 && chown nodejs:nodejs /data /app

# COPY lines unchanged (from builder standalone + runtime-deps node_modules)

USER nodejs
EXPOSE 3000
HEALTHCHECK --interval=30s --timeout=5s --start-period=30s --retries=3 \
  CMD bun -e "fetch('http://127.0.0.1:3000/api/settings').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"

ENTRYPOINT ["dumb-init", "--"]
CMD ["bun", "dist/server.js"]
```

Two small changes from the current file:
- `HEALTHCHECK` uses `bun -e` instead of `node -e`.
- `CMD` invokes `bun dist/server.js`.

### Expected outcome

- Image size: ~400 MB today -> target ~300-380 MB. Savings come from
  dropping `node` (replaced by `bun`, comparable footprint) plus the
  cleaner pruning. No massive win here - the point is cohesion, not
  bytes.
- Build speed: faster. No native compilation of `better-sqlite3`, no
  need to install `python3 make g++`.

## server.ts

Unchanged. Uses `node:http` + `next` + `ws`, all of which run natively
on Bun. Phase 2 will rewrite this file against `Bun.serve`.

## Backwards compat

- SQLite file format is byte-identical between `better-sqlite3` and
  `bun:sqlite`. Existing `fastcom.db` files mount and load unchanged.
- WAL mode stays enabled; Bun respects it.
- API, WebSocket, and env-var surface are unchanged.
- No Drizzle migration added.

## Rollback

`git revert` the merge restores `better-sqlite3` + Node runtime. The
DB is still readable by better-sqlite3 (shared format).

## Risks and validation

| Risk | Validation |
|---|---|
| Bun + Next.js 16 edge case in prod build | `docker build` + container smoke test (healthcheck + manual measurement) as part of the final task |
| Timing-sensitive fake-timer tests break under `jest.useFakeTimers()` compat | Targeted re-run of `dispatch.test.ts` and `cloudflare.test.ts` in batch B3 / B4 |
| `drizzle-orm/bun-sqlite` adapter regression | Existing test suite covers all DB read/write paths; each B2-B7 batch green = coverage |
| `@node-rs/argon2` prebuild missing for Bun+Debian-slim combo | `bun add @node-rs/argon2@^2` in the runtime-deps stage is verified end-to-end by the auth tests (B5, B6) and the final Docker build |

## Deliverable

```
lib/db/client.ts                          (MODIFIED - bun:sqlite + adapter swap + create:true + .exec pragma)
lib/db/migrate.ts                         (MODIFIED - migrator import swap)
drizzle.config.ts                         (MODIFIED if driver-scoped)
server.ts                                 (UNCHANGED)

lib/format.test.ts                        (MODIFIED - B1)
lib/scheduler/cron-expr.test.ts           (MODIFIED - B1)
lib/alerts/evaluate.test.ts               (MODIFIED - B1)
lib/alerts/format.test.ts                 (MODIFIED - B1)
lib/auth/config.test.ts                   (MODIFIED - B1)
lib/auth/hash.test.ts                     (MODIFIED - B1)
lib/alerts/config.test.ts                 (MODIFIED - B1)

lib/types.test.ts                         (MODIFIED - B2)
lib/measurements.test.ts                  (MODIFIED - B2)
lib/auth/users.test.ts                    (MODIFIED - B2)
lib/auth/bootstrap.test.ts                (MODIFIED - B2)
lib/alerts/rules.test.ts                  (MODIFIED - B2)
lib/alerts/state.test.ts                  (MODIFIED - B2)
lib/alerts/streak.test.ts                 (MODIFIED - B2)

lib/alerts/destinations/webhook.test.ts   (MODIFIED - B3)
lib/alerts/destinations/ntfy.test.ts      (MODIFIED - B3)
lib/alerts/destinations/discord.test.ts   (MODIFIED - B3)
lib/alerts/destinations/slack.test.ts     (MODIFIED - B3)
lib/alerts/destinations/smtp.test.ts      (MODIFIED - B3)
lib/alerts/dispatch.test.ts               (MODIFIED - B3 - fake timers)
lib/alerts/handle.test.ts                 (MODIFIED - B3)

lib/measurement/cloudflare.test.ts        (MODIFIED - B4 - fake timers, already gone - stays absent)
lib/measurement/runner.test.ts            (MODIFIED - B4)

lib/auth/providers.test.ts                (MODIFIED - B5)

app/api/users/route.test.ts               (MODIFIED - B6)
app/api/users/[id]/route.test.ts          (MODIFIED - B6)
app/api/users/[id]/reset-password/route.test.ts (MODIFIED - B6)
app/api/auth/setup/route.test.ts          (MODIFIED - B6)
app/api/account/password/route.test.ts    (MODIFIED - B6)

app/api/alerts/rules/route.test.ts        (MODIFIED - B7)
app/api/alerts/test/route.test.ts         (MODIFIED - B7)
app/api/settings/settings-schema.test.ts  (MODIFIED - B7)

Dockerfile                                (MODIFIED - all stages bun:1-slim + CMD bun + healthcheck bun -e + drop python3/make/g++)
package.json                              (MODIFIED - scripts + deps)
bun.lock                                  (MODIFIED - deps)
tsconfig.json                             (MODIFIED - @types/bun)
bunfig.toml                               (DELETED)
scripts/block-bun-test.ts                 (DELETED)
README.md                                 (MODIFIED - Stack + Development)
```

## Open questions

None at design time.
