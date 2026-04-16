import { desc, gte } from 'drizzle-orm';
import { getDb } from './db/client';
import { type Measurement, measurements } from './db/schema';

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
