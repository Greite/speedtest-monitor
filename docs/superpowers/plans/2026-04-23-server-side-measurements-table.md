# Server-side measurements table - Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make sort, filter and pagination on the measurements history table operate against the entire DB instead of only the rows currently loaded client-side.

**Architecture:**
- Introduce a dedicated paginated endpoint `GET /api/measurements/table` that accepts sort, filter and pagination params and returns `{ rows, totalCount }`.
- Add a pure query-building helper (`lib/measurements-query.ts`) validated with zod, and a server-side lister `listMeasurementsPaged(query)` in `lib/measurements.ts`.
- Rewrite `HistoryTable` in manual mode (`manualSorting` + `manualFiltering` + `manualPagination`) fed by a new hook `useTableMeasurements` that fetches the new endpoint on state change and refetches when a new live measurement arrives.
- The global `range` picker keeps driving chart + KPI via `useLiveMeasurements`; it no longer constrains the table. The table's own `timestamp` column filter is the way to narrow by time.

**Tech Stack:** TypeScript 6, Drizzle ORM 0.45 (better-sqlite3), Next.js 16 (route handlers), React 19, @tanstack/react-table 8, zod 4, bun:test, bun:sqlite.

**Design note:** decoupling the table from the global `range` selector is a deliberate UX change, matching the user's request to filter/sort against all DB rows. If a range-scoped view is wanted later, it can be reintroduced as a preset of the timestamp filter.

---

## File Structure

**Created:**
- `lib/measurements-query.ts` - zod schema + parser turning `URLSearchParams` into a typed `TableQuery` with defaults
- `lib/measurements-query.test.ts` - parser tests
- `app/api/measurements/table/route.ts` - paginated endpoint
- `app/api/measurements/table/route.test.ts` - endpoint tests
- `components/use-table-measurements.ts` - client hook (fetch, state, refetch-on-live)

**Modified:**
- `lib/measurements.ts` - add `listMeasurementsPaged(query)` returning `{ rows, totalCount }`
- `lib/measurements.test.ts` - tests for `listMeasurementsPaged`
- `components/history-table.tsx` - switch to manual mode; drop `measurements` prop; use new hook; pagination driven by server totals
- `components/dashboard.tsx` - stop passing `measurements` to `HistoryTable`; pass a refresh-signal prop (latest id)
- `components/table-filters.tsx` - unchanged behaviour; only verify it still works against manual columns

---

## Task 1: Zod schema and parser for table query params

**Files:**
- Create: `lib/measurements-query.ts`
- Create: `lib/measurements-query.test.ts`

- [ ] **Step 1: Write failing tests**

Create `lib/measurements-query.test.ts`:

```ts
import { describe, expect, it } from 'bun:test';
import { parseTableQuery } from './measurements-query';

function qs(obj: Record<string, string>): URLSearchParams {
  return new URLSearchParams(obj);
}

describe('parseTableQuery', () => {
  it('applies defaults when no params are provided', () => {
    const q = parseTableQuery(qs({}));
    expect(q).toEqual({
      page: 1,
      pageSize: 25,
      sort: 'timestamp',
      sortDir: 'desc',
      filters: {},
    });
  });

  it('parses page and pageSize within bounds', () => {
    const q = parseTableQuery(qs({ page: '3', pageSize: '50' }));
    expect(q.page).toBe(3);
    expect(q.pageSize).toBe(50);
  });

  it('clamps pageSize to allowed values', () => {
    expect(() => parseTableQuery(qs({ pageSize: '9999' }))).toThrow();
  });

  it('rejects invalid sort columns', () => {
    expect(() => parseTableQuery(qs({ sort: 'drop_table' }))).toThrow();
  });

  it('parses numeric range filters', () => {
    const q = parseTableQuery(
      qs({ downloadMin: '100', downloadMax: '500', latencyMin: '10' }),
    );
    expect(q.filters.download).toEqual({ min: 100, max: 500 });
    expect(q.filters.latency).toEqual({ min: 10 });
  });

  it('parses timestamp range (ms epoch)', () => {
    const q = parseTableQuery(qs({ timeFrom: '1700000000000', timeTo: '1800000000000' }));
    expect(q.filters.time).toEqual({ from: 1700000000000, to: 1800000000000 });
  });

  it('parses server contains and trims it', () => {
    const q = parseTableQuery(qs({ server: '  Paris  ' }));
    expect(q.filters.server).toBe('Paris');
  });

  it('parses comma-separated status list and deduplicates', () => {
    const q = parseTableQuery(qs({ status: 'success,error,success' }));
    expect(q.filters.status).toEqual(['success', 'error']);
  });

  it('rejects unknown status values', () => {
    expect(() => parseTableQuery(qs({ status: 'nope' }))).toThrow();
  });

  it('ignores empty string filters rather than treating them as constraints', () => {
    const q = parseTableQuery(qs({ server: '', status: '' }));
    expect(q.filters.server).toBeUndefined();
    expect(q.filters.status).toBeUndefined();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
bun test lib/measurements-query.test.ts
```

Expected: FAIL with `Cannot find module './measurements-query'`.

- [ ] **Step 3: Implement parser**

Create `lib/measurements-query.ts`:

```ts
import { z } from 'zod';

export const SORT_COLUMNS = [
  'timestamp',
  'downloadMbps',
  'uploadMbps',
  'latencyLoadedMs',
  'status',
] as const;

export type SortColumn = (typeof SORT_COLUMNS)[number];

export const PAGE_SIZES = [10, 25, 50, 100] as const;
export type PageSize = (typeof PAGE_SIZES)[number];

export const STATUSES = ['success', 'error', 'timeout'] as const;
export type StatusValue = (typeof STATUSES)[number];

export type NumericRange = { min?: number; max?: number };
export type TimeRange = { from?: number; to?: number };

export type TableFilters = {
  time?: TimeRange;
  download?: NumericRange;
  upload?: NumericRange;
  latency?: NumericRange;
  server?: string;
  status?: StatusValue[];
};

export type TableQuery = {
  page: number;
  pageSize: PageSize;
  sort: SortColumn;
  sortDir: 'asc' | 'desc';
  filters: TableFilters;
};

const numericRangeSchema = z
  .object({ min: z.number().finite().optional(), max: z.number().finite().optional() })
  .refine((v) => v.min !== undefined || v.max !== undefined, { message: 'empty range' });

const timeRangeSchema = z
  .object({ from: z.number().int().nonnegative().optional(), to: z.number().int().nonnegative().optional() })
  .refine((v) => v.from !== undefined || v.to !== undefined, { message: 'empty range' });

function readNumber(params: URLSearchParams, key: string): number | undefined {
  const raw = params.get(key);
  if (raw == null || raw === '') return undefined;
  const n = Number(raw);
  return Number.isFinite(n) ? n : undefined;
}

function readNumericRange(params: URLSearchParams, base: string): NumericRange | undefined {
  const min = readNumber(params, `${base}Min`);
  const max = readNumber(params, `${base}Max`);
  if (min === undefined && max === undefined) return undefined;
  const parsed = numericRangeSchema.parse({ min, max });
  return parsed;
}

function readTimeRange(params: URLSearchParams): TimeRange | undefined {
  const from = readNumber(params, 'timeFrom');
  const to = readNumber(params, 'timeTo');
  if (from === undefined && to === undefined) return undefined;
  return timeRangeSchema.parse({ from, to });
}

function readStatuses(params: URLSearchParams): StatusValue[] | undefined {
  const raw = params.get('status');
  if (raw == null || raw === '') return undefined;
  const parts = raw.split(',').map((s) => s.trim()).filter(Boolean);
  if (parts.length === 0) return undefined;
  const validated = z.array(z.enum(STATUSES)).parse(parts);
  return [...new Set(validated)];
}

function readServer(params: URLSearchParams): string | undefined {
  const raw = params.get('server');
  if (raw == null) return undefined;
  const trimmed = raw.trim();
  return trimmed === '' ? undefined : trimmed;
}

const pageSchema = z.coerce.number().int().min(1).default(1);
const pageSizeSchema = z
  .union([z.literal('10'), z.literal('25'), z.literal('50'), z.literal('100')])
  .transform((v) => Number(v) as PageSize);
const sortSchema = z.enum(SORT_COLUMNS).default('timestamp');
const sortDirSchema = z.enum(['asc', 'desc']).default('desc');

export function parseTableQuery(params: URLSearchParams): TableQuery {
  const page = pageSchema.parse(params.get('page') ?? undefined);
  const pageSize = params.get('pageSize')
    ? pageSizeSchema.parse(params.get('pageSize'))
    : (25 as PageSize);
  const sort = sortSchema.parse(params.get('sort') ?? undefined);
  const sortDir = sortDirSchema.parse(params.get('sortDir') ?? undefined);

  const filters: TableFilters = {};
  const time = readTimeRange(params);
  if (time) filters.time = time;
  const download = readNumericRange(params, 'download');
  if (download) filters.download = download;
  const upload = readNumericRange(params, 'upload');
  if (upload) filters.upload = upload;
  const latency = readNumericRange(params, 'latency');
  if (latency) filters.latency = latency;
  const server = readServer(params);
  if (server) filters.server = server;
  const status = readStatuses(params);
  if (status) filters.status = status;

  return { page, pageSize, sort, sortDir, filters };
}
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
bun test lib/measurements-query.test.ts
```

Expected: all tests pass.

- [ ] **Step 5: Typecheck**

```bash
bun run typecheck
```

Expected: exits 0.

- [ ] **Step 6: Commit**

```bash
git add lib/measurements-query.ts lib/measurements-query.test.ts
git commit -m "feat(measurements): add parseTableQuery for server-side table params"
```

---

## Task 2: `listMeasurementsPaged` in `lib/measurements.ts`

**Files:**
- Modify: `lib/measurements.ts`
- Modify: `lib/measurements.test.ts`

- [ ] **Step 1: Write failing tests**

Append to `lib/measurements.test.ts`:

```ts
import { listMeasurementsPaged } from './measurements';
import { measurements as measurementsTable } from './db/schema';

describe('listMeasurementsPaged', () => {
  let sqlite: Database;
  beforeEach(() => {
    sqlite = new Database(':memory:');
    const db = drizzle(sqlite, { schema });
    sqlite.exec(`
      CREATE TABLE measurements (
        id INTEGER PRIMARY KEY AUTOINCREMENT, timestamp INTEGER NOT NULL,
        download_mbps REAL, upload_mbps REAL,
        latency_unloaded_ms REAL, latency_loaded_ms REAL, buffer_bloat_ms REAL,
        status TEXT NOT NULL, error TEXT, server_locations TEXT,
        user_location TEXT, user_ip TEXT, jitter_ms REAL,
        packet_loss_pct REAL, user_isp TEXT
      );
    `);
    globalThis.__speedtestDb = { sqlite, db };

    const base = Date.UTC(2026, 0, 1);
    const rows = [
      { timestamp: new Date(base + 1000), downloadMbps: 50, uploadMbps: 10, latencyLoadedMs: 30, status: 'success' as const, serverLocations: ['Paris'] },
      { timestamp: new Date(base + 2000), downloadMbps: 200, uploadMbps: 20, latencyLoadedMs: 15, status: 'success' as const, serverLocations: ['London'] },
      { timestamp: new Date(base + 3000), downloadMbps: 500, uploadMbps: 40, latencyLoadedMs: 80, status: 'timeout' as const, serverLocations: ['Berlin'] },
      { timestamp: new Date(base + 4000), downloadMbps: null, uploadMbps: null, latencyLoadedMs: null, status: 'error' as const, serverLocations: null },
    ];
    for (const r of rows) db.insert(measurementsTable).values(r).run();
  });

  it('returns rows sorted desc by timestamp and totalCount by default', () => {
    const r = listMeasurementsPaged({
      page: 1, pageSize: 25, sort: 'timestamp', sortDir: 'desc', filters: {},
    });
    expect(r.totalCount).toBe(4);
    expect(r.rows).toHaveLength(4);
    expect(r.rows[0].status).toBe('error');
  });

  it('paginates correctly', () => {
    const p1 = listMeasurementsPaged({
      page: 1, pageSize: 2, sort: 'timestamp', sortDir: 'asc', filters: {},
    });
    const p2 = listMeasurementsPaged({
      page: 2, pageSize: 2, sort: 'timestamp', sortDir: 'asc', filters: {},
    });
    expect(p1.rows).toHaveLength(2);
    expect(p2.rows).toHaveLength(2);
    expect(p1.rows[0].downloadMbps).toBe(50);
    expect(p2.rows[0].downloadMbps).toBe(500);
  });

  it('sorts by downloadMbps asc with NULLs last', () => {
    const r = listMeasurementsPaged({
      page: 1, pageSize: 25, sort: 'downloadMbps', sortDir: 'asc', filters: {},
    });
    expect(r.rows.map((x) => x.downloadMbps)).toEqual([50, 200, 500, null]);
  });

  it('filters by numeric range', () => {
    const r = listMeasurementsPaged({
      page: 1, pageSize: 25, sort: 'timestamp', sortDir: 'desc',
      filters: { download: { min: 100, max: 400 } },
    });
    expect(r.totalCount).toBe(1);
    expect(r.rows[0].downloadMbps).toBe(200);
  });

  it('filters by time range', () => {
    const base = Date.UTC(2026, 0, 1);
    const r = listMeasurementsPaged({
      page: 1, pageSize: 25, sort: 'timestamp', sortDir: 'asc',
      filters: { time: { from: base + 1500, to: base + 3500 } },
    });
    expect(r.totalCount).toBe(2);
    expect(r.rows.map((x) => x.downloadMbps)).toEqual([200, 500]);
  });

  it('filters by status list', () => {
    const r = listMeasurementsPaged({
      page: 1, pageSize: 25, sort: 'timestamp', sortDir: 'desc',
      filters: { status: ['success'] },
    });
    expect(r.totalCount).toBe(2);
  });

  it('filters by server contains (case-insensitive)', () => {
    const r = listMeasurementsPaged({
      page: 1, pageSize: 25, sort: 'timestamp', sortDir: 'desc',
      filters: { server: 'par' },
    });
    expect(r.totalCount).toBe(1);
    expect(r.rows[0].serverLocations).toEqual(['Paris']);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
bun test lib/measurements.test.ts
```

Expected: FAIL with `listMeasurementsPaged is not a function`.

- [ ] **Step 3: Implement `listMeasurementsPaged`**

Edit `lib/measurements.ts`. Add the imports and function at the bottom:

```ts
import { and, asc, desc, gte, inArray, like, lt, lte, sql } from 'drizzle-orm';
import { getDb } from './db/client';
import { alerts, type Measurement, measurements } from './db/schema';
import type { TableQuery, SortColumn } from './measurements-query';

// ... keep existing isRange / listMeasurements / purge helpers ...

const SORT_MAP: Record<SortColumn, typeof measurements.timestamp> = {
  timestamp: measurements.timestamp,
  downloadMbps: measurements.downloadMbps,
  uploadMbps: measurements.uploadMbps,
  latencyLoadedMs: measurements.latencyLoadedMs,
  status: measurements.status,
};

export function listMeasurementsPaged(query: TableQuery): {
  rows: Measurement[];
  totalCount: number;
} {
  const db = getDb();
  const conds = [] as ReturnType<typeof gte>[];
  const f = query.filters;

  if (f.time?.from != null) conds.push(gte(measurements.timestamp, new Date(f.time.from)));
  if (f.time?.to != null) conds.push(lte(measurements.timestamp, new Date(f.time.to)));

  if (f.download?.min != null) conds.push(gte(measurements.downloadMbps, f.download.min));
  if (f.download?.max != null) conds.push(lte(measurements.downloadMbps, f.download.max));
  if (f.upload?.min != null) conds.push(gte(measurements.uploadMbps, f.upload.min));
  if (f.upload?.max != null) conds.push(lte(measurements.uploadMbps, f.upload.max));
  if (f.latency?.min != null) conds.push(gte(measurements.latencyLoadedMs, f.latency.min));
  if (f.latency?.max != null) conds.push(lte(measurements.latencyLoadedMs, f.latency.max));

  if (f.status && f.status.length > 0) conds.push(inArray(measurements.status, f.status));
  if (f.server) {
    conds.push(like(sql`lower(${measurements.serverLocations})`, `%${f.server.toLowerCase()}%`));
  }

  const where = conds.length > 0 ? and(...conds) : undefined;

  const sortCol = SORT_MAP[query.sort];
  // NULL ordering: put NULLs last regardless of direction (matches current UI sortUndefined: 'last').
  const orderClauses = [
    sql`case when ${sortCol} is null then 1 else 0 end`,
    query.sortDir === 'asc' ? asc(sortCol) : desc(sortCol),
  ];

  const countRow = db
    .select({ n: sql<number>`count(*)` })
    .from(measurements)
    .where(where)
    .get() as { n: number } | undefined;
  const totalCount = countRow?.n ?? 0;

  const rows = db
    .select()
    .from(measurements)
    .where(where)
    .orderBy(...orderClauses)
    .limit(query.pageSize)
    .offset((query.page - 1) * query.pageSize)
    .all();

  return { rows, totalCount };
}
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
bun test lib/measurements.test.ts
```

Expected: all new tests pass; existing tests still pass.

- [ ] **Step 5: Typecheck**

```bash
bun run typecheck
```

Expected: exits 0.

- [ ] **Step 6: Commit**

```bash
git add lib/measurements.ts lib/measurements.test.ts
git commit -m "feat(measurements): add listMeasurementsPaged with filters and sort"
```

---

## Task 3: API endpoint `GET /api/measurements/table`

**Files:**
- Create: `app/api/measurements/table/route.ts`
- Create: `app/api/measurements/table/route.test.ts`

- [ ] **Step 1: Write failing tests**

Create `app/api/measurements/table/route.test.ts`:

```ts
import { Database } from 'bun:sqlite';
import { beforeEach, describe, expect, it } from 'bun:test';
import { drizzle } from 'drizzle-orm/bun-sqlite';
import * as schema from '@/lib/db/schema';
import { measurements } from '@/lib/db/schema';

const { GET } = await import('./route');

beforeEach(() => {
  const sqlite = new Database(':memory:');
  const db = drizzle(sqlite, { schema });
  sqlite.exec(`
    CREATE TABLE measurements (
      id INTEGER PRIMARY KEY AUTOINCREMENT, timestamp INTEGER NOT NULL,
      download_mbps REAL, upload_mbps REAL,
      latency_unloaded_ms REAL, latency_loaded_ms REAL, buffer_bloat_ms REAL,
      status TEXT NOT NULL, error TEXT, server_locations TEXT,
      user_location TEXT, user_ip TEXT, jitter_ms REAL,
      packet_loss_pct REAL, user_isp TEXT
    );
  `);
  globalThis.__speedtestDb = { sqlite, db };

  const base = Date.UTC(2026, 0, 1);
  for (let i = 0; i < 30; i++) {
    db.insert(measurements).values({
      timestamp: new Date(base + i * 1000),
      downloadMbps: i * 10,
      uploadMbps: i,
      latencyLoadedMs: 100 - i,
      status: 'success',
      serverLocations: ['Paris'],
    }).run();
  }
});

describe('GET /api/measurements/table', () => {
  it('returns default page with totalCount', async () => {
    const res = await GET(new Request('http://x/api/measurements/table'));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.totalCount).toBe(30);
    expect(body.measurements).toHaveLength(25);
    expect(body.page).toBe(1);
    expect(body.pageSize).toBe(25);
  });

  it('respects page and pageSize', async () => {
    const res = await GET(
      new Request('http://x/api/measurements/table?page=2&pageSize=10'),
    );
    const body = await res.json();
    expect(body.page).toBe(2);
    expect(body.pageSize).toBe(10);
    expect(body.measurements).toHaveLength(10);
  });

  it('filters and paginates together', async () => {
    const res = await GET(
      new Request('http://x/api/measurements/table?downloadMin=200&pageSize=10'),
    );
    const body = await res.json();
    expect(body.totalCount).toBe(10); // i=20..29
    expect(body.measurements).toHaveLength(10);
  });

  it('returns 400 on invalid sort column', async () => {
    const res = await GET(new Request('http://x/api/measurements/table?sort=drop'));
    expect(res.status).toBe(400);
  });

  it('returns 400 on invalid pageSize', async () => {
    const res = await GET(
      new Request('http://x/api/measurements/table?pageSize=7'),
    );
    expect(res.status).toBe(400);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
bun test app/api/measurements/table/route.test.ts
```

Expected: FAIL with `Cannot find module './route'`.

- [ ] **Step 3: Implement the route**

Create `app/api/measurements/table/route.ts`:

```ts
import { NextResponse } from 'next/server';
import { listMeasurementsPaged } from '@/lib/measurements';
import { parseTableQuery } from '@/lib/measurements-query';
import { toMeasurementDto } from '@/lib/types';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export function GET(req: Request) {
  const url = new URL(req.url);
  let query;
  try {
    query = parseTableQuery(url.searchParams);
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'invalid query' },
      { status: 400 },
    );
  }
  const { rows, totalCount } = listMeasurementsPaged(query);
  return NextResponse.json({
    page: query.page,
    pageSize: query.pageSize,
    sort: query.sort,
    sortDir: query.sortDir,
    totalCount,
    measurements: rows.map(toMeasurementDto),
  });
}
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
bun test app/api/measurements/table/route.test.ts
```

Expected: all pass.

- [ ] **Step 5: Typecheck + lint**

```bash
bun run typecheck && bun run lint
```

Expected: both exit 0.

- [ ] **Step 6: Commit**

```bash
git add app/api/measurements/table/
git commit -m "feat(api): add paginated /api/measurements/table endpoint"
```

---

## Task 4: Client hook `useTableMeasurements`

**Files:**
- Create: `components/use-table-measurements.ts`

- [ ] **Step 1: Implement the hook**

Create `components/use-table-measurements.ts`:

```ts
'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import type { MeasurementDto } from '@/lib/types';
import type { TableQuery } from '@/lib/measurements-query';

export type TableResponse = {
  page: number;
  pageSize: number;
  totalCount: number;
  measurements: MeasurementDto[];
};

function toSearchParams(q: TableQuery): URLSearchParams {
  const p = new URLSearchParams();
  p.set('page', String(q.page));
  p.set('pageSize', String(q.pageSize));
  p.set('sort', q.sort);
  p.set('sortDir', q.sortDir);
  const f = q.filters;
  if (f.time?.from != null) p.set('timeFrom', String(f.time.from));
  if (f.time?.to != null) p.set('timeTo', String(f.time.to));
  if (f.download?.min != null) p.set('downloadMin', String(f.download.min));
  if (f.download?.max != null) p.set('downloadMax', String(f.download.max));
  if (f.upload?.min != null) p.set('uploadMin', String(f.upload.min));
  if (f.upload?.max != null) p.set('uploadMax', String(f.upload.max));
  if (f.latency?.min != null) p.set('latencyMin', String(f.latency.min));
  if (f.latency?.max != null) p.set('latencyMax', String(f.latency.max));
  if (f.server) p.set('server', f.server);
  if (f.status && f.status.length > 0) p.set('status', f.status.join(','));
  return p;
}

export function useTableMeasurements(query: TableQuery, refreshSignal: number | string | null) {
  const [data, setData] = useState<TableResponse>({
    page: query.page,
    pageSize: query.pageSize,
    totalCount: 0,
    measurements: [],
  });
  const [loading, setLoading] = useState(false);
  const reqIdRef = useRef(0);

  const fetchPage = useCallback(async () => {
    const reqId = ++reqIdRef.current;
    setLoading(true);
    try {
      const res = await fetch(`/api/measurements/table?${toSearchParams(query).toString()}`, {
        cache: 'no-store',
      });
      if (!res.ok) return;
      const body = (await res.json()) as TableResponse;
      if (reqId !== reqIdRef.current) return; // stale response
      setData(body);
    } finally {
      if (reqId === reqIdRef.current) setLoading(false);
    }
  }, [query]);

  useEffect(() => {
    fetchPage();
  }, [fetchPage]);

  useEffect(() => {
    // Refetch when a new live measurement arrives.
    if (refreshSignal == null) return;
    fetchPage();
  }, [refreshSignal, fetchPage]);

  return { ...data, loading, refetch: fetchPage };
}
```

- [ ] **Step 2: Typecheck**

```bash
bun run typecheck
```

Expected: exits 0.

- [ ] **Step 3: Commit**

```bash
git add components/use-table-measurements.ts
git commit -m "feat(ui): add useTableMeasurements hook for paginated server-side table"
```

---

## Task 5: Switch `HistoryTable` to manual mode

**Files:**
- Modify: `components/history-table.tsx`

- [ ] **Step 1: Rewrite the component**

Replace the entire contents of `components/history-table.tsx` with:

```tsx
'use client';

import {
  type ColumnDef,
  type ColumnFiltersState,
  flexRender,
  getCoreRowModel,
  type PaginationState,
  type SortingState,
  useReactTable,
} from '@tanstack/react-table';
import { ArrowDown, ArrowUp, ArrowUpDown, ChevronLeft, ChevronRight } from 'lucide-react';
import { useMemo, useState } from 'react';
import type { NumericRange, StatusValue, TimeRange } from '@/components/table-filters';
import { TableFilters } from '@/components/table-filters';
import { useTableMeasurements } from '@/components/use-table-measurements';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Table,
  TableBody,
  TableCaption,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import {
  formatDateTime,
  formatMbps,
  formatMs,
  type LatencyLevel,
  latencyLevel,
} from '@/lib/format';
import type {
  PageSize,
  SortColumn,
  TableFilters as TableFiltersType,
} from '@/lib/measurements-query';
import type { MeasurementDto } from '@/lib/types';
import { cn } from '@/lib/utils';

const levelColor: Record<LatencyLevel, string> = {
  ok: 'bg-latency-ok',
  warn: 'bg-latency-warn',
  bad: 'bg-latency-bad',
};

function statusBadge(status: MeasurementDto['status']) {
  if (status === 'success') return <Badge variant="secondary">OK</Badge>;
  if (status === 'timeout') return <Badge variant="outline">Timeout</Badge>;
  return <Badge variant="destructive">Error</Badge>;
}

const columns: ColumnDef<MeasurementDto>[] = [
  {
    id: 'timestamp',
    accessorKey: 'timestamp',
    header: 'Time',
    cell: ({ row }) => formatDateTime(row.original.timestamp),
    enableSorting: true,
  },
  {
    id: 'download',
    accessorKey: 'downloadMbps',
    header: 'Download',
    cell: ({ row }) => (
      <span className="text-speed-down">{formatMbps(row.original.downloadMbps)}</span>
    ),
    enableSorting: true,
  },
  {
    id: 'upload',
    accessorKey: 'uploadMbps',
    header: 'Upload',
    cell: ({ row }) => (
      <span className="text-speed-up">{formatMbps(row.original.uploadMbps)}</span>
    ),
    enableSorting: true,
  },
  {
    id: 'latency',
    accessorKey: 'latencyLoadedMs',
    header: 'Latency (u/l)',
    cell: ({ row }) => (
      <span className="inline-flex items-center gap-2">
        <span
          className={cn(
            'inline-block size-2 rounded-full',
            levelColor[latencyLevel(row.original.latencyLoadedMs)],
          )}
          aria-hidden
        />
        {formatMs(row.original.latencyUnloadedMs)} / {formatMs(row.original.latencyLoadedMs)}
      </span>
    ),
    enableSorting: true,
  },
  {
    id: 'server',
    accessorFn: (row) => row.serverLocations?.join(' | ') ?? '',
    header: 'Server',
    cell: ({ row }) => (
      <span className="text-xs text-muted-foreground">
        {row.original.serverLocations?.join(' | ') ?? '-'}
      </span>
    ),
    enableSorting: false,
  },
  {
    id: 'status',
    accessorKey: 'status',
    header: 'Status',
    cell: ({ row }) => statusBadge(row.original.status),
    enableSorting: true,
  },
];

const PAGE_SIZES: PageSize[] = [10, 25, 50, 100];

const COLUMN_TO_SORT: Record<string, SortColumn> = {
  timestamp: 'timestamp',
  download: 'downloadMbps',
  upload: 'uploadMbps',
  latency: 'latencyLoadedMs',
  status: 'status',
};

function buildFiltersFromState(columnFilters: ColumnFiltersState): TableFiltersType {
  const out: TableFiltersType = {};
  for (const f of columnFilters) {
    if (f.id === 'timestamp') {
      const v = f.value as TimeRange;
      if (v.from != null || v.to != null) out.time = { from: v.from, to: v.to };
    } else if (f.id === 'download') {
      const v = f.value as NumericRange;
      if (v.min != null || v.max != null) out.download = { min: v.min, max: v.max };
    } else if (f.id === 'upload') {
      const v = f.value as NumericRange;
      if (v.min != null || v.max != null) out.upload = { min: v.min, max: v.max };
    } else if (f.id === 'latency') {
      const v = f.value as NumericRange;
      if (v.min != null || v.max != null) out.latency = { min: v.min, max: v.max };
    } else if (f.id === 'server') {
      const v = f.value as string;
      if (v) out.server = v;
    } else if (f.id === 'status') {
      const v = f.value as StatusValue[];
      if (v.length > 0) out.status = v;
    }
  }
  return out;
}

export function HistoryTable({ refreshSignal }: { refreshSignal: number | null }) {
  const [sorting, setSorting] = useState<SortingState>([{ id: 'timestamp', desc: true }]);
  const [columnFilters, setColumnFilters] = useState<ColumnFiltersState>([]);
  const [pagination, setPagination] = useState<PaginationState>({ pageIndex: 0, pageSize: 25 });

  const query = useMemo(() => {
    const s = sorting[0];
    const sortId = s?.id ?? 'timestamp';
    const sort: SortColumn = COLUMN_TO_SORT[sortId] ?? 'timestamp';
    return {
      page: pagination.pageIndex + 1,
      pageSize: pagination.pageSize as PageSize,
      sort,
      sortDir: s?.desc ? ('desc' as const) : ('asc' as const),
      filters: buildFiltersFromState(columnFilters),
    };
  }, [sorting, columnFilters, pagination]);

  const { measurements, totalCount, loading } = useTableMeasurements(query, refreshSignal);

  const pageCount = Math.max(1, Math.ceil(totalCount / pagination.pageSize));

  const table = useReactTable({
    data: measurements,
    columns,
    state: { sorting, columnFilters, pagination },
    manualSorting: true,
    manualFiltering: true,
    manualPagination: true,
    pageCount,
    onSortingChange: (updater) => {
      setSorting(updater);
      setPagination((p) => ({ ...p, pageIndex: 0 }));
    },
    onColumnFiltersChange: (updater) => {
      setColumnFilters(updater);
      setPagination((p) => ({ ...p, pageIndex: 0 }));
    },
    onPaginationChange: setPagination,
    getCoreRowModel: getCoreRowModel(),
  });

  const rows = table.getRowModel().rows;
  const pageIndex = pagination.pageIndex;
  const pageSize = pagination.pageSize;
  const firstRow = totalCount === 0 ? 0 : pageIndex * pageSize + 1;
  const lastRow = Math.min(totalCount, (pageIndex + 1) * pageSize);

  return (
    <Card>
      <CardHeader>
        <CardTitle as="h2" className="text-base">
          Recent measurements
        </CardTitle>
      </CardHeader>
      <CardContent>
        <TableFilters table={table} />
        <Table>
          <TableCaption className="sr-only">
            Recent speedtest measurements, sortable and filterable.
          </TableCaption>
          <TableHeader>
            {table.getHeaderGroups().map((headerGroup) => (
              <TableRow key={headerGroup.id}>
                {headerGroup.headers.map((header) => {
                  const sortDir = header.column.getIsSorted();
                  const ariaSort =
                    sortDir === 'asc' ? 'ascending' : sortDir === 'desc' ? 'descending' : 'none';
                  const canSort = header.column.getCanSort();
                  return (
                    <TableHead key={header.id} aria-sort={ariaSort}>
                      {canSort ? (
                        <button
                          type="button"
                          onClick={header.column.getToggleSortingHandler()}
                          className="inline-flex items-center gap-1 text-left font-medium text-muted-foreground transition-colors hover:text-foreground"
                        >
                          {flexRender(header.column.columnDef.header, header.getContext())}
                          {sortDir === 'asc' ? (
                            <ArrowUp className="size-3" aria-hidden />
                          ) : sortDir === 'desc' ? (
                            <ArrowDown className="size-3" aria-hidden />
                          ) : (
                            <ArrowUpDown className="size-3 opacity-40" aria-hidden />
                          )}
                        </button>
                      ) : (
                        <span className="font-medium text-muted-foreground">
                          {flexRender(header.column.columnDef.header, header.getContext())}
                        </span>
                      )}
                    </TableHead>
                  );
                })}
              </TableRow>
            ))}
          </TableHeader>
          <TableBody>
            {rows.length === 0 ? (
              <TableRow>
                <TableCell
                  colSpan={columns.length}
                  className="py-6 text-center text-muted-foreground"
                >
                  {loading ? 'Loading...' : totalCount === 0 ? 'No measurements.' : 'No rows match filters.'}
                </TableCell>
              </TableRow>
            ) : (
              rows.map((row) => (
                <TableRow key={row.id} className="tabular-nums">
                  {row.getVisibleCells().map((cell) => (
                    <TableCell key={cell.id}>
                      {flexRender(cell.column.columnDef.cell, cell.getContext())}
                    </TableCell>
                  ))}
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
        <div
          className="mt-4 flex flex-col gap-2 text-xs text-muted-foreground sm:flex-row sm:items-center sm:justify-between"
          aria-live="polite"
          aria-atomic="true"
        >
          <div>
            {totalCount === 0 ? 'No rows' : `Showing ${firstRow}-${lastRow} of ${totalCount}`}
          </div>
          <div className="flex items-center gap-4">
            <div className="flex items-center gap-2">
              <span>Rows per page</span>
              <Select
                value={String(pageSize)}
                onValueChange={(v) => table.setPageSize(Number(v))}
              >
                <SelectTrigger
                  size="sm"
                  className="h-7 w-[72px] text-xs"
                  aria-label="Rows per page"
                >
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {PAGE_SIZES.map((n) => (
                    <SelectItem key={n} value={String(n)}>
                      {n}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="flex items-center gap-2">
              <span>
                Page {totalCount === 0 ? 0 : pageIndex + 1} of {pageCount}
              </span>
              <Button
                variant="outline"
                size="icon-sm"
                onClick={() => table.previousPage()}
                disabled={!table.getCanPreviousPage()}
                aria-label="Previous page"
                className="md:size-7"
              >
                <ChevronLeft />
              </Button>
              <Button
                variant="outline"
                size="icon-sm"
                onClick={() => table.nextPage()}
                disabled={!table.getCanNextPage()}
                aria-label="Next page"
                className="md:size-7"
              >
                <ChevronRight />
              </Button>
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
```

- [ ] **Step 2: Typecheck**

```bash
bun run typecheck
```

Expected: exits 0.

- [ ] **Step 3: Lint**

```bash
bun run lint
```

Expected: exits 0.

- [ ] **Step 4: Commit**

```bash
git add components/history-table.tsx
git commit -m "refactor(ui): switch HistoryTable to server-side sort/filter/paginate"
```

---

## Task 6: Wire up in `Dashboard` and remove table prop

**Files:**
- Modify: `components/dashboard.tsx`

- [ ] **Step 1: Update Dashboard**

Edit `components/dashboard.tsx`. Replace the `<HistoryTable measurements={measurements} />` line and add a refresh signal derived from the latest live measurement id:

```tsx
// In Dashboard(), after destructuring { measurements, running } from useLiveMeasurements:
const refreshSignal = measurements[0]?.id ?? null;

// In the returned JSX, replace <HistoryTable measurements={measurements} /> with:
<HistoryTable refreshSignal={refreshSignal} />
```

Full updated return block:

```tsx
return (
  <div className="flex flex-col gap-6">
    <div className="flex items-center justify-between">
      <h1 className="text-lg font-semibold tracking-tight sm:text-xl">Overview</h1>
      <TimeRangePicker value={range} onChange={setRange} />
    </div>
    <KpiCards latest={latest} averages={averages} busy={running} />
    <HistoryChart measurements={measurements} />
    <HistoryTable refreshSignal={refreshSignal} />
  </div>
);
```

- [ ] **Step 2: Typecheck**

```bash
bun run typecheck
```

Expected: exits 0.

- [ ] **Step 3: Commit**

```bash
git add components/dashboard.tsx
git commit -m "refactor(ui): pass refresh signal instead of rows to HistoryTable"
```

---

## Task 7: Manual smoke test

**Files:** none (verification only)

- [ ] **Step 1: Start dev server**

```bash
bun run dev
```

Leaves the server running on the configured port.

- [ ] **Step 2: Open the app in a browser** and verify on the dashboard:
  1. The history table loads with 25 rows.
  2. Clicking the "Download" column header reorders rows by download speed; the top row is the max in the entire DB (open the DB with a SQL client or another tab running a manual query to cross-check at least the first row).
  3. Opening filters, setting "Download min" to a high value not present in the current 25 rows, confirms that rows with that minimum from anywhere in the DB appear.
  4. Pagination: with a DB of > pageSize rows, clicking "next" loads the next page from the server (network tab shows a request to `/api/measurements/table?page=2...`).
  5. Changing "Rows per page" triggers a new request; totalCount is unchanged; pageIndex resets to 0.
  6. The global time-range picker (top right) only affects chart + KPIs, not the table.
  7. When a new live measurement arrives (wait for a scheduled run or click the run button), the table refetches (visible in the network tab) and the new row appears on page 1 if sorted by timestamp desc.

- [ ] **Step 3: Stop dev server**

Kill the dev server.

- [ ] **Step 4: Run full test suite**

```bash
bun test
```

Expected: all tests pass.

- [ ] **Step 5: Lint + typecheck**

```bash
bun run lint && bun run typecheck
```

Expected: both exit 0.

- [ ] **Step 6: Final commit (if any tweaks were needed during smoke test)**

If the smoke test surfaced tweaks, commit them. Otherwise this task has no commit.

---

## Self-Review Notes

- **Spec coverage:** sort, filter, pagination on entire DB — all three addressed by Tasks 1-5. The global range picker is decoupled from the table (design note in header).
- **Placeholders:** none; every step shows concrete code or an exact command.
- **Type consistency:** `TableQuery`, `TableFilters`, `SortColumn`, `PageSize` are defined once in `lib/measurements-query.ts` and reused across the lister, route, hook, and component. `buildFiltersFromState` uses the same field names as the URL params.
- **Backward compat:** `/api/measurements?range=...` is untouched and continues feeding chart + KPIs via `useLiveMeasurements`.
