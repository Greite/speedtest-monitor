import { and, asc, desc, gte, inArray, like, lt, lte, sql } from 'drizzle-orm';
import { getDb } from './db/client';
import { alerts, type Measurement, measurements } from './db/schema';
import type { SortColumn, TableQuery } from './measurements-query';

export type Range = '1h' | '6h' | '24h' | '7d' | '30d';

const RANGE_MS: Record<Range, number> = {
  '1h': 60 * 60 * 1000,
  '6h': 6 * 60 * 60 * 1000,
  '24h': 24 * 60 * 60 * 1000,
  '7d': 7 * 24 * 60 * 60 * 1000,
  '30d': 30 * 24 * 60 * 60 * 1000,
};

export function isRange(value: string): value is Range {
  return value in RANGE_MS;
}

export function listMeasurements(range: Range): Measurement[] {
  const db = getDb();
  const since = new Date(Date.now() - RANGE_MS[range]);
  return db
    .select()
    .from(measurements)
    .where(gte(measurements.timestamp, since))
    .orderBy(desc(measurements.timestamp))
    .all();
}

export function cutoffForRetentionDays(retentionDays: number, now: Date = new Date()): Date {
  return new Date(now.getTime() - retentionDays * 24 * 60 * 60 * 1000);
}

export function purgeMeasurementsOlderThan(cutoff: Date): number {
  const db = getDb();
  const m = db.delete(measurements).where(lt(measurements.timestamp, cutoff)).run() as unknown as {
    changes: number;
  };
  db.delete(alerts).where(lt(alerts.timestamp, cutoff)).run();
  return m.changes;
}

export function purgeByRetention(retentionDays: number, now: Date = new Date()): number {
  return purgeMeasurementsOlderThan(cutoffForRetentionDays(retentionDays, now));
}

const SORT_MAP = {
  timestamp: measurements.timestamp,
  downloadMbps: measurements.downloadMbps,
  uploadMbps: measurements.uploadMbps,
  latencyLoadedMs: measurements.latencyLoadedMs,
  status: measurements.status,
} as const satisfies Record<SortColumn, unknown>;

export function listMeasurementsPaged(query: TableQuery): {
  rows: Measurement[];
  totalCount: number;
} {
  const db = getDb();
  const f = query.filters;
  const conds = [];

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
  const nullsLast = sql`case when ${sortCol} is null then 1 else 0 end`;
  const orderClauses = [nullsLast, query.sortDir === 'asc' ? asc(sortCol) : desc(sortCol)];

  const countRow = db.select({ n: sql<number>`count(*)` }).from(measurements).where(where).get() as
    | { n: number }
    | undefined;
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
