import { Database } from 'bun:sqlite';
import { beforeEach, describe, expect, it } from 'bun:test';
import { drizzle } from 'drizzle-orm/bun-sqlite';
import * as schema from './db/schema';
import { alerts } from './db/schema';
import { cutoffForRetentionDays, isRange, purgeByRetention } from './measurements';

describe('isRange', () => {
  it('accepts the documented ranges', () => {
    for (const r of ['1h', '6h', '24h', '7d', '30d']) {
      expect(isRange(r)).toBe(true);
    }
  });

  it('rejects unknown values', () => {
    expect(isRange('1m')).toBe(false);
    expect(isRange('')).toBe(false);
    expect(isRange('24H')).toBe(false);
    expect(isRange('365d')).toBe(false);
  });
});

describe('cutoffForRetentionDays', () => {
  const now = new Date('2026-04-17T12:00:00Z');

  it('returns now minus N days', () => {
    expect(cutoffForRetentionDays(1, now).toISOString()).toBe('2026-04-16T12:00:00.000Z');
    expect(cutoffForRetentionDays(30, now).toISOString()).toBe('2026-03-18T12:00:00.000Z');
    expect(cutoffForRetentionDays(90, now).toISOString()).toBe('2026-01-17T12:00:00.000Z');
  });

  it('returns now for retention=0 (boundary - callers validate range)', () => {
    expect(cutoffForRetentionDays(0, now).getTime()).toBe(now.getTime());
  });
});

describe('purgeByRetention extended to alerts', () => {
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
        user_location TEXT, user_ip TEXT
      );
      CREATE TABLE alerts (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        timestamp INTEGER NOT NULL, kind TEXT NOT NULL, event TEXT NOT NULL,
        measurement_id INTEGER, threshold REAL, observed REAL, delivery_status TEXT
      );
    `);
    globalThis.__fastcomDb = { sqlite, db };
  });

  it('purges old alerts too', () => {
    const db = drizzle(sqlite, { schema });
    const old = new Date(Date.now() - 10 * 24 * 60 * 60 * 1000);
    db.insert(alerts).values({ kind: 'download_below', event: 'fired', timestamp: old }).run();
    db.insert(alerts)
      .values({ kind: 'download_below', event: 'resolved', timestamp: new Date() })
      .run();
    purgeByRetention(5);
    const rows = db.select().from(alerts).all();
    expect(rows).toHaveLength(1);
    expect(rows[0].event).toBe('resolved');
  });
});
