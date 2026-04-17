import { desc, gte, lt } from 'drizzle-orm';
import { getDb } from './db/client';
import { type Measurement, alerts, measurements } from './db/schema';

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
  const m = db.delete(measurements).where(lt(measurements.timestamp, cutoff)).run();
  db.delete(alerts).where(lt(alerts.timestamp, cutoff)).run();
  return m.changes;
}

export function purgeByRetention(retentionDays: number, now: Date = new Date()): number {
  return purgeMeasurementsOlderThan(cutoffForRetentionDays(retentionDays, now));
}
