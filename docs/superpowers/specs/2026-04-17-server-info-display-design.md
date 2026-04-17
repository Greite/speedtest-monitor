# Server info display - design

**Status:** draft
**Date:** 2026-04-17

## Context

The user asked to expose "server selection" in `/settings`. Investigation of `fast-cli` v5.2.0 (`node_modules/fast-cli/distribution/cli.js`, `api.js`) confirmed the CLI exposes no server-selection flag. fast.com (Netflix) auto-routes to servers based on the client's IP. However, `fast --json` already returns the server locations used, the client's geolocation, and the client's public IP. The agreed scope is therefore passive display of that metadata, not selection.

## Scope

Persist three additional fields per measurement and surface them in the history table and chart tooltip. Read-only, additive, no new user input.

Out of scope:
- Picking or restricting servers (not supported by fast-cli)
- Aggregations over server locations (e.g. "% runs from Paris")
- Backfilling historical rows (left NULL)

## Data

### Fields captured from `fast --json`

| Source key | Type | Example |
|---|---|---|
| `serverLocations` | `string[]` | `["Paris", "Frankfurt"]` |
| `userLocation` | `string` | `"Paris, France"` |
| `userIp` | `string` | `"81.x.x.x"` |

All three are already emitted in JSON mode unconditionally (`node_modules/fast-cli/distribution/ui.js:63-77`). The `--verbose` flag is not required.

### Schema change (`lib/db/schema.ts`)

Three nullable columns added to `measurements`:

```ts
serverLocations: text('server_locations', { mode: 'json' }).$type<string[]>(),
userLocation: text('user_location'),
userIp: text('user_ip'),
```

Drizzle stores `mode: 'json'` columns as serialized text in SQLite. Existing rows get `NULL` on migration. Error/timeout measurements keep `NULL` (no scrape succeeded).

Migration generated via `bun run db:generate` produces a new file in `drizzle/`.

## Runner (`lib/fastcli/runner.ts`)

Extend `FastCliJson`:

```ts
type FastCliJson = {
  downloadSpeed?: number;
  uploadSpeed?: number;
  latency?: number;
  bufferBloat?: number;
  serverLocations?: string[];
  userLocation?: string;
  userIp?: string;
};
```

`insertMeasurement` in the success path forwards the three values (coerced to `null` when absent). The error path inserts `null` for all three, unchanged in structure, just three more `null` fields.

## API

- `GET /api/measurements?range=...`: payload shape follows `Measurement` via Drizzle's `$inferSelect`, so the three fields appear automatically. No route code change.
- `POST /api/measurements/run`: returns the inserted row, same shape propagation. No change.
- WebSocket `measurement` event: `broadcastMeasurement(row)` already serializes the full row; new fields ride along.
- `GET`/`PATCH /api/settings`: **unchanged**. No new settings key.

No Zod schema changes: the client only reads these fields.

## UI

### History table (`components/history-table.tsx`)

Append a "Server" column at the end. Cell renders `row.serverLocations?.join(' | ') ?? '-'`. Column gets `text-xs text-muted-foreground` to match the table's secondary-info styling.

### History chart (`components/history-chart.tsx`)

Custom tooltip on point hover. Three lines when data is present:

```
Server: Paris | Frankfurt
Client: Paris, France
IP: 81.x.x.x
```

Each line is skipped if its field is `null`/empty. On error/timeout points, the tooltip shows the existing status info only (no metadata section).

### KPI cards, settings page, dashboard

No changes.

## Tests

- `lib/measurements.test.ts`: extend the insertion/read test to cover the three new fields round-tripping through SQLite, including `null` cases.
- No new test file for `runner.ts`: coverage is adequate via measurements tests and the field plumbing is a straight pass-through.

## Migration & rollout

1. Code + schema change in a single PR.
2. `bun run db:generate` committed alongside (new file in `drizzle/`).
3. `migrate.ts` runs on container start; existing installs add NULL columns automatically.
4. Docker image rebuilds (no new system deps).

## Risks

- **SQLite JSON mode**: `text({ mode: 'json' })` requires Drizzle to serialize/deserialize. Verify reads return `string[]`, not `string`, in the table component. If Drizzle returns raw text, parse explicitly in `measurements.ts`.
- **Privacy**: `userIp` is stored in plain text and visible in the UI tooltip. Acceptable per user decision (self-hosted, single-user app). Document in README if the app ever gains auth.
- **fast-cli upstream changes**: if future versions drop these fields from JSON output, we silently store `null`, no runtime error.
