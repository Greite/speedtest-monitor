import Database from 'better-sqlite3';
import { drizzle } from 'drizzle-orm/better-sqlite3';
import { beforeEach, describe, expect, it } from 'vitest';
import * as schema from '../db/schema';
import { measurements } from '../db/schema';
import { computeFailureStreak } from './streak';

let sqlite: Database.Database;
beforeEach(() => {
  sqlite = new Database(':memory:');
  const db = drizzle(sqlite, { schema });
  sqlite.exec(`
    CREATE TABLE measurements (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      timestamp INTEGER NOT NULL,
      download_mbps REAL, upload_mbps REAL,
      latency_unloaded_ms REAL, latency_loaded_ms REAL,
      buffer_bloat_ms REAL,
      status TEXT NOT NULL,
      error TEXT,
      server_locations TEXT,
      user_location TEXT, user_ip TEXT,
      jitter_ms REAL, packet_loss_pct REAL, user_isp TEXT
    );
  `);
  globalThis.__fastcomDb = { sqlite, db };
});

const insert = (status: 'success' | 'error' | 'timeout', ts: number) => {
  const db = drizzle(sqlite, { schema });
  db.insert(measurements)
    .values({ status, timestamp: new Date(ts) })
    .run();
};

describe('alerts/streak', () => {
  it('returns 0 when no measurements exist', () => {
    expect(computeFailureStreak()).toBe(0);
  });

  it('returns 0 when most recent is success', () => {
    insert('error', 1000);
    insert('success', 2000);
    expect(computeFailureStreak()).toBe(0);
  });

  it('counts consecutive failures ending at most recent', () => {
    insert('success', 1000);
    insert('error', 2000);
    insert('timeout', 3000);
    insert('error', 4000);
    expect(computeFailureStreak()).toBe(3);
  });

  it('stops counting at the first success going back in time', () => {
    insert('error', 1000);
    insert('success', 2000);
    insert('error', 3000);
    insert('error', 4000);
    expect(computeFailureStreak()).toBe(2);
  });
});
