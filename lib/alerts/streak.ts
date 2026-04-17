import { desc } from 'drizzle-orm';
import { getDb } from '../db/client';
import { measurements } from '../db/schema';

const LOOKBACK = 100;

export function computeFailureStreak(): number {
  const db = getDb();
  const rows = db
    .select({ status: measurements.status })
    .from(measurements)
    .orderBy(desc(measurements.timestamp))
    .limit(LOOKBACK)
    .all();

  let streak = 0;
  for (const row of rows) {
    if (row.status === 'success') break;
    streak++;
  }
  return streak;
}
