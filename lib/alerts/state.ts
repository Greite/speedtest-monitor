import { desc, eq } from 'drizzle-orm';
import { getDb } from '../db/client';
import { alerts } from '../db/schema';
import { ALL_KINDS, type AlertKind, type AlertState } from './types';

export function readAlertState(): AlertState {
  const db = getDb();
  const state = Object.fromEntries(
    ALL_KINDS.map((k): [AlertKind, 'OK' | 'ALERTING'] => [k, 'OK']),
  ) as AlertState;

  for (const kind of ALL_KINDS) {
    const last = db
      .select({ event: alerts.event })
      .from(alerts)
      .where(eq(alerts.kind, kind))
      .orderBy(desc(alerts.timestamp))
      .limit(1)
      .get();
    if (last?.event === 'fired') state[kind] = 'ALERTING';
  }

  return state;
}
