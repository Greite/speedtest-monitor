# Server info display - Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Persist fast.com server locations, client geolocation, and client IP per measurement, and surface them in the history table (new column) and history chart (custom tooltip).

**Architecture:** Three nullable columns added to `measurements`. Runner forwards fields from `fast --json` output. `MeasurementDto` + `toMeasurementDto` extended so API and WebSocket carry the fields. Table gets a "Server" column; chart gets a custom tooltip renderer.

**Tech Stack:** TypeScript 6, Drizzle ORM 0.45 (better-sqlite3), Next.js 16, React 19, recharts 3, Vitest 4.

**Spec:** `docs/superpowers/specs/2026-04-17-server-info-display-design.md`

---

## File Structure

**Modified:**
- `lib/db/schema.ts` - add 3 nullable columns to `measurements`
- `lib/fastcli/runner.ts` - extend `FastCliJson`, forward new fields to insert
- `lib/types.ts` - extend `MeasurementDto` and `toMeasurementDto`
- `components/history-table.tsx` - add "Server" column
- `components/history-chart.tsx` - feed extra fields into chart data and render a custom tooltip

**Created:**
- `drizzle/0001_*.sql` - auto-generated migration (filename depends on drizzle-kit)
- `drizzle/meta/0001_snapshot.json` - auto-generated
- `drizzle/meta/_journal.json` - updated by drizzle-kit
- `lib/types.test.ts` - TDD test for `toMeasurementDto`

---

## Task 1: Add columns to schema and generate migration

**Files:**
- Modify: `lib/db/schema.ts`
- Create (auto): `drizzle/0001_*.sql`, `drizzle/meta/0001_snapshot.json`

- [ ] **Step 1: Extend `measurements` table schema**

Edit `lib/db/schema.ts`. Add three columns to the `measurements` table definition, after `error`:

```ts
import { sql } from 'drizzle-orm';
import { integer, real, sqliteTable, text } from 'drizzle-orm/sqlite-core';

export const measurements = sqliteTable('measurements', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  timestamp: integer('timestamp', { mode: 'timestamp_ms' })
    .notNull()
    .default(sql`(unixepoch() * 1000)`),
  downloadMbps: real('download_mbps'),
  uploadMbps: real('upload_mbps'),
  latencyUnloadedMs: real('latency_unloaded_ms'),
  latencyLoadedMs: real('latency_loaded_ms'),
  bufferBloatMs: real('buffer_bloat_ms'),
  status: text('status', { enum: ['success', 'error', 'timeout'] }).notNull(),
  error: text('error'),
  serverLocations: text('server_locations', { mode: 'json' }).$type<string[]>(),
  userLocation: text('user_location'),
  userIp: text('user_ip'),
});
```

Leave `settings` table unchanged. Keep the existing exports at the bottom of the file.

- [ ] **Step 2: Generate migration**

Run:
```bash
bun run db:generate
```

Expected: drizzle-kit creates `drizzle/0001_<adjective>_<noun>.sql` and updates `drizzle/meta/_journal.json` + a new `drizzle/meta/0001_snapshot.json`.

- [ ] **Step 3: Inspect generated SQL**

Open the newly created `drizzle/0001_*.sql`. It should contain three `ALTER TABLE measurements ADD COLUMN ...` statements for `server_locations`, `user_location`, `user_ip`. All three should be nullable (no `NOT NULL`). Example of what to expect:

```sql
ALTER TABLE `measurements` ADD `server_locations` text;--> statement-breakpoint
ALTER TABLE `measurements` ADD `user_location` text;--> statement-breakpoint
ALTER TABLE `measurements` ADD `user_ip` text;
```

If drizzle-kit generated anything else (dropping the table, recreating, etc.), stop and investigate - do not proceed.

- [ ] **Step 4: Typecheck**

Run:
```bash
bun run typecheck
```

Expected: exits 0.

- [ ] **Step 5: Commit**

```bash
git add lib/db/schema.ts drizzle/
git commit -m "feat(db): add server_locations, user_location, user_ip to measurements"
```

---

## Task 2: Extend runner to capture new fields

**Files:**
- Modify: `lib/fastcli/runner.ts`

- [ ] **Step 1: Extend `FastCliJson` and forward fields**

Edit `lib/fastcli/runner.ts`. Replace the `FastCliJson` type and the success branch of `runMeasurement` as follows.

Replace the type definition (around line 11):

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

In the success branch of `runMeasurement` (the first `insertMeasurement({...})` call, around lines 55-67), add the three fields and coerce `userLocation`/`userIp` empty strings to `null`:

```ts
const row = insertMeasurement({
  downloadMbps: result.downloadSpeed ?? null,
  uploadMbps: result.uploadSpeed ?? null,
  latencyUnloadedMs: result.latency ?? null,
  latencyLoadedMs:
    typeof result.latency === 'number' && typeof result.bufferBloat === 'number'
      ? result.latency + result.bufferBloat
      : null,
  bufferBloatMs: result.bufferBloat ?? null,
  status: 'success',
  error: null,
  serverLocations: result.serverLocations?.length ? result.serverLocations : null,
  userLocation: result.userLocation ? result.userLocation : null,
  userIp: result.userIp ? result.userIp : null,
});
```

In the error branch (around lines 73-81), add the three fields as `null`:

```ts
const row = insertMeasurement({
  downloadMbps: null,
  uploadMbps: null,
  latencyUnloadedMs: null,
  latencyLoadedMs: null,
  bufferBloatMs: null,
  status: isTimeout ? 'timeout' : 'error',
  error: message.slice(0, 500),
  serverLocations: null,
  userLocation: null,
  userIp: null,
});
```

Do not touch `spawnFastCli` - `fast --json` already emits these fields unconditionally (verified in `node_modules/fast-cli/distribution/ui.js:63-77`).

- [ ] **Step 2: Typecheck**

Run:
```bash
bun run typecheck
```

Expected: exits 0. If it complains about `insertMeasurement` signature, the Drizzle `$inferInsert` type should already include the new fields via the schema change from Task 1. If it still errors, confirm Task 1 was committed and the TypeScript server is seeing fresh types.

- [ ] **Step 3: Lint**

Run:
```bash
bun run lint
```

Expected: exits 0.

- [ ] **Step 4: Commit**

```bash
git add lib/fastcli/runner.ts
git commit -m "feat(runner): capture serverLocations/userLocation/userIp from fast-cli"
```

---

## Task 3: Extend DTO and propagate to API/WS (TDD)

**Files:**
- Create: `lib/types.test.ts`
- Modify: `lib/types.ts`

- [ ] **Step 1: Write the failing test**

Create `lib/types.test.ts` with this content:

```ts
import { describe, expect, it } from 'vitest';
import type { Measurement } from './db/schema';
import { toMeasurementDto } from './types';

function baseRow(overrides: Partial<Measurement> = {}): Measurement {
  return {
    id: 1,
    timestamp: new Date('2026-04-17T12:00:00Z'),
    downloadMbps: 100,
    uploadMbps: 50,
    latencyUnloadedMs: 10,
    latencyLoadedMs: 20,
    bufferBloatMs: 10,
    status: 'success',
    error: null,
    serverLocations: null,
    userLocation: null,
    userIp: null,
    ...overrides,
  };
}

describe('toMeasurementDto', () => {
  it('carries serverLocations, userLocation, userIp when present', () => {
    const dto = toMeasurementDto(
      baseRow({
        serverLocations: ['Paris', 'Frankfurt'],
        userLocation: 'Paris, France',
        userIp: '81.0.0.1',
      }),
    );
    expect(dto.serverLocations).toEqual(['Paris', 'Frankfurt']);
    expect(dto.userLocation).toBe('Paris, France');
    expect(dto.userIp).toBe('81.0.0.1');
  });

  it('passes nulls through when fields are missing', () => {
    const dto = toMeasurementDto(baseRow());
    expect(dto.serverLocations).toBeNull();
    expect(dto.userLocation).toBeNull();
    expect(dto.userIp).toBeNull();
  });

  it('converts timestamp to epoch millis', () => {
    const dto = toMeasurementDto(baseRow());
    expect(dto.timestamp).toBe(new Date('2026-04-17T12:00:00Z').getTime());
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run:
```bash
bun run test -- lib/types.test.ts
```

Expected: FAIL. Errors like `Property 'serverLocations' is missing in type 'MeasurementDto'` or test assertions failing because the fields are `undefined` on the DTO.

- [ ] **Step 3: Extend `MeasurementDto` and `toMeasurementDto`**

Edit `lib/types.ts`. Replace the entire file with:

```ts
import type { Measurement } from './db/schema';

export type MeasurementDto = {
  id: number;
  timestamp: number;
  downloadMbps: number | null;
  uploadMbps: number | null;
  latencyUnloadedMs: number | null;
  latencyLoadedMs: number | null;
  bufferBloatMs: number | null;
  status: 'success' | 'error' | 'timeout';
  error: string | null;
  serverLocations: string[] | null;
  userLocation: string | null;
  userIp: string | null;
};

export function toMeasurementDto(row: Measurement): MeasurementDto {
  return {
    id: row.id,
    timestamp: row.timestamp.getTime(),
    downloadMbps: row.downloadMbps,
    uploadMbps: row.uploadMbps,
    latencyUnloadedMs: row.latencyUnloadedMs,
    latencyLoadedMs: row.latencyLoadedMs,
    bufferBloatMs: row.bufferBloatMs,
    status: row.status,
    error: row.error,
    serverLocations: row.serverLocations ?? null,
    userLocation: row.userLocation ?? null,
    userIp: row.userIp ?? null,
  };
}

export type WsEventDto =
  | { type: 'measurement'; payload: MeasurementDto }
  | { type: 'running'; payload: { startedAt: number } }
  | { type: 'settings_updated'; payload: { intervalMinutes: number } };
```

- [ ] **Step 4: Run test to verify it passes**

Run:
```bash
bun run test -- lib/types.test.ts
```

Expected: PASS, 3 tests green.

- [ ] **Step 5: Full test run + typecheck + lint**

Run in sequence:
```bash
bun run test && bun run typecheck && bun run lint
```

Expected: all exit 0. If any existing test broke because `MeasurementDto` was constructed elsewhere with the old shape, update it to include `serverLocations: null, userLocation: null, userIp: null` in fixtures.

- [ ] **Step 6: Commit**

```bash
git add lib/types.ts lib/types.test.ts
git commit -m "feat(dto): expose serverLocations/userLocation/userIp in MeasurementDto"
```

---

## Task 4: Add "Server" column to history table

**Files:**
- Modify: `components/history-table.tsx`

- [ ] **Step 1: Add column header and cell**

Edit `components/history-table.tsx`. Two changes:

**(a)** In the `<TableHeader>` block, add a new `<TableHead>` after the existing `<TableHead>Status</TableHead>`:

```tsx
<TableHead>Server</TableHead>
```

**(b)** Update the empty-state `colSpan` from `5` to `6`:

```tsx
<TableCell colSpan={6} className="py-6 text-center text-muted-foreground">
  No measurements yet.
</TableCell>
```

**(c)** In the row mapping, add a new `<TableCell>` after the status cell:

```tsx
<TableCell className="text-xs text-muted-foreground">
  {m.serverLocations?.join(' | ') ?? '-'}
</TableCell>
```

The complete row block should read:

```tsx
<TableRow key={m.id} className="tabular-nums">
  <TableCell>{formatDateTime(m.timestamp)}</TableCell>
  <TableCell className="text-speed-down">{formatMbps(m.downloadMbps)}</TableCell>
  <TableCell className="text-speed-up">{formatMbps(m.uploadMbps)}</TableCell>
  <TableCell>
    <span className="inline-flex items-center gap-2">
      <span
        className={cn(
          'inline-block size-2 rounded-full',
          levelColor[latencyLevel(m.latencyLoadedMs)],
        )}
        aria-hidden
      />
      {formatMs(m.latencyUnloadedMs)} / {formatMs(m.latencyLoadedMs)}
    </span>
  </TableCell>
  <TableCell>{statusBadge(m.status)}</TableCell>
  <TableCell className="text-xs text-muted-foreground">
    {m.serverLocations?.join(' | ') ?? '-'}
  </TableCell>
</TableRow>
```

- [ ] **Step 2: Typecheck + lint**

Run:
```bash
bun run typecheck && bun run lint
```

Expected: exits 0.

- [ ] **Step 3: Commit**

```bash
git add components/history-table.tsx
git commit -m "feat(ui): add Server column to history table"
```

---

## Task 5: Custom tooltip in history chart

**Files:**
- Modify: `components/history-chart.tsx`

- [ ] **Step 1: Extend `Point` type and chart data with the three new fields**

Edit `components/history-chart.tsx`. Replace the `Point` type and the `data` useMemo so each point carries the metadata:

```ts
type Point = {
  t: number;
  label: string;
  download: number | null;
  upload: number | null;
  latency: number | null;
  serverLocations: string[] | null;
  userLocation: string | null;
  userIp: string | null;
};
```

Update the `data` memo:

```ts
const data = useMemo<Point[]>(() => {
  return [...measurements]
    .sort((a, b) => a.timestamp - b.timestamp)
    .map((m) => ({
      t: m.timestamp,
      label: formatTime(m.timestamp),
      download: m.downloadMbps,
      upload: m.uploadMbps,
      latency: m.latencyLoadedMs,
      serverLocations: m.serverLocations,
      userLocation: m.userLocation,
      userIp: m.userIp,
    }));
}, [measurements]);
```

- [ ] **Step 2: Add a custom tooltip renderer**

Still in `components/history-chart.tsx`, add a new `ChartTooltip` component at the bottom of the file, next to `Legend`:

```tsx
import type { TooltipProps } from 'recharts';

function ChartTooltip({ active, payload, label }: TooltipProps<number, string>) {
  if (!active || !payload?.length) return null;
  const point = payload[0]?.payload as Point | undefined;
  if (!point) return null;

  return (
    <div
      style={{
        background: 'var(--color-popover)',
        border: '1px solid var(--color-border)',
        borderRadius: 8,
        color: 'var(--color-popover-foreground)',
        fontSize: 12,
        padding: '8px 10px',
      }}
    >
      <div style={{ color: 'var(--color-muted-foreground)', marginBottom: 4 }}>{label}</div>
      {payload.map((entry) => (
        <div key={entry.dataKey} style={{ color: entry.color }}>
          {entry.name ?? entry.dataKey}: {entry.value}
        </div>
      ))}
      {(point.serverLocations || point.userLocation || point.userIp) && (
        <div
          style={{
            marginTop: 6,
            paddingTop: 6,
            borderTop: '1px solid var(--color-border)',
            color: 'var(--color-muted-foreground)',
          }}
        >
          {point.serverLocations?.length ? (
            <div>Server: {point.serverLocations.join(' | ')}</div>
          ) : null}
          {point.userLocation ? <div>Client: {point.userLocation}</div> : null}
          {point.userIp ? <div>IP: {point.userIp}</div> : null}
        </div>
      )}
    </div>
  );
}
```

Note: the import for `TooltipProps` goes at the top of the file. Consolidate it with the existing `recharts` import:

```ts
import {
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  type TooltipProps,
  XAxis,
  YAxis,
} from 'recharts';
```

- [ ] **Step 3: Wire the custom tooltip to `<Tooltip>`**

Replace the existing `<Tooltip contentStyle={...} labelStyle={...} />` with:

```tsx
<Tooltip content={<ChartTooltip />} />
```

Remove the old `contentStyle`/`labelStyle` inline props - our custom renderer owns the styling now.

- [ ] **Step 4: Typecheck + lint**

Run:
```bash
bun run typecheck && bun run lint
```

Expected: exits 0. If `TooltipProps<number, string>` generic args cause issues (recharts 3 type quirks), widen to `TooltipProps<any, any>` or fall back to destructuring `props: any` for the tooltip renderer signature only - keep the internal cast `payload[0]?.payload as Point | undefined` intact.

- [ ] **Step 5: Commit**

```bash
git add components/history-chart.tsx
git commit -m "feat(ui): render server/client info in history chart tooltip"
```

---

## Task 6: End-to-end manual verification

**Files:** none (verification only)

- [ ] **Step 1: Run the dev server**

```bash
bun run dev
```

Open http://localhost:3000 in a browser.

- [ ] **Step 2: Trigger a measurement**

In another terminal:
```bash
curl -X POST http://localhost:3000/api/measurements/run
```

Wait ~90 seconds for completion (watch the WS `running` → `measurement` events in the UI's live state).

- [ ] **Step 3: Verify the API response**

```bash
curl -s 'http://localhost:3000/api/measurements?range=1h' | jq '.measurements[0]'
```

Expected: the first object includes `serverLocations: ["..."]` (non-empty array), `userLocation: "..."` (non-empty string), `userIp: "..."` (non-empty string). If any are `null` on a successful run, fast-cli may have failed to scrape the DOM - retry once; if still null, flag for investigation.

- [ ] **Step 4: Verify the UI**

In the browser:
- History table shows a "Server" column, populated for the new row (e.g. `Paris | Frankfurt`). Older rows show `-`.
- Hover a point in the chart. Tooltip shows the speed values **and** a separator followed by `Server:`, `Client:`, `IP:` lines.
- Trigger a second measurement. Both rows appear, tooltip is correct for each.

- [ ] **Step 5: Check error path (optional, skip if not easily testable)**

Temporarily rename the `fast` binary path or disconnect the network to force an error measurement, then confirm the resulting row has `status: 'error'` and all three new fields are `null` in the DB and UI. Revert.

- [ ] **Step 6: Stop the dev server**

Ctrl+C the `bun run dev` process.

No commit for this task (verification only).

---

## Post-implementation

After all 6 tasks complete and are committed:

1. **Push the branch** (if on a feature branch) and open a PR.
2. **Consider README update**: the Configuration table and API section don't mention the new fields. A short addition in the API response shape paragraph would help users. Not strictly required for this feature to work.
3. **No Docker image changes**: no new runtime deps.
