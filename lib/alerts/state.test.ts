import { Database } from 'bun:sqlite';
import { beforeEach, describe, expect, it } from 'bun:test';
import { drizzle } from 'drizzle-orm/bun-sqlite';
import * as schema from '../db/schema';
import { alerts } from '../db/schema';
import { readAlertState } from './state';
import { ALL_KINDS } from './types';

let sqlite: Database;
beforeEach(() => {
  sqlite = new Database(':memory:');
  const db = drizzle(sqlite, { schema });
  sqlite.exec(`
    CREATE TABLE alerts (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      timestamp INTEGER NOT NULL DEFAULT (unixepoch() * 1000),
      kind TEXT NOT NULL,
      event TEXT NOT NULL,
      measurement_id INTEGER,
      threshold REAL,
      observed REAL,
      delivery_status TEXT
    );
    CREATE INDEX alerts_kind_timestamp_idx ON alerts(kind, timestamp);
  `);
  globalThis.__speedtestDb = { sqlite, db };
});

describe('alerts/state', () => {
  it('returns OK for all kinds when no alerts exist', () => {
    const state = readAlertState();
    for (const k of ALL_KINDS) expect(state[k]).toBe('OK');
  });

  it('returns ALERTING for a kind whose last event is fired', () => {
    const db = drizzle(sqlite, { schema });
    db.insert(alerts)
      .values({ kind: 'download_below', event: 'fired', timestamp: new Date(1000) })
      .run();
    expect(readAlertState()['download_below']).toBe('ALERTING');
  });

  it('returns OK when last event is resolved', () => {
    const db = drizzle(sqlite, { schema });
    db.insert(alerts)
      .values({ kind: 'download_below', event: 'fired', timestamp: new Date(1000) })
      .run();
    db.insert(alerts)
      .values({ kind: 'download_below', event: 'resolved', timestamp: new Date(2000) })
      .run();
    expect(readAlertState()['download_below']).toBe('OK');
  });
});
