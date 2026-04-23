import { Database } from 'bun:sqlite';
import { beforeEach, describe, expect, it } from 'bun:test';
import { drizzle } from 'drizzle-orm/bun-sqlite';
import * as schema from './db/schema';
import { alerts, measurements as measurementsTable } from './db/schema';
import {
  cutoffForRetentionDays,
  isRange,
  listMeasurementsPaged,
  purgeByRetention,
} from './measurements';

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
    globalThis.__speedtestDb = { sqlite, db };
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
      {
        timestamp: new Date(base + 1000),
        downloadMbps: 50,
        uploadMbps: 10,
        latencyLoadedMs: 30,
        status: 'success' as const,
        serverLocations: ['Paris'],
      },
      {
        timestamp: new Date(base + 2000),
        downloadMbps: 200,
        uploadMbps: 20,
        latencyLoadedMs: 15,
        status: 'success' as const,
        serverLocations: ['London'],
      },
      {
        timestamp: new Date(base + 3000),
        downloadMbps: 500,
        uploadMbps: 40,
        latencyLoadedMs: 80,
        status: 'timeout' as const,
        serverLocations: ['Berlin'],
      },
      {
        timestamp: new Date(base + 4000),
        downloadMbps: null,
        uploadMbps: null,
        latencyLoadedMs: null,
        status: 'error' as const,
        serverLocations: null,
      },
    ];
    for (const r of rows) db.insert(measurementsTable).values(r).run();
  });

  it('returns rows sorted desc by timestamp and totalCount by default', () => {
    const r = listMeasurementsPaged({
      page: 1,
      pageSize: 25,
      sort: 'timestamp',
      sortDir: 'desc',
      filters: {},
    });
    expect(r.totalCount).toBe(4);
    expect(r.rows).toHaveLength(4);
    expect(r.rows[0].status).toBe('error');
  });

  it('paginates correctly', () => {
    const p1 = listMeasurementsPaged({
      page: 1,
      pageSize: 2,
      sort: 'timestamp',
      sortDir: 'asc',
      filters: {},
    });
    const p2 = listMeasurementsPaged({
      page: 2,
      pageSize: 2,
      sort: 'timestamp',
      sortDir: 'asc',
      filters: {},
    });
    expect(p1.rows).toHaveLength(2);
    expect(p2.rows).toHaveLength(2);
    expect(p1.rows[0].downloadMbps).toBe(50);
    expect(p2.rows[0].downloadMbps).toBe(500);
  });

  it('sorts by downloadMbps asc with NULLs last', () => {
    const r = listMeasurementsPaged({
      page: 1,
      pageSize: 25,
      sort: 'downloadMbps',
      sortDir: 'asc',
      filters: {},
    });
    expect(r.rows.map((x) => x.downloadMbps)).toEqual([50, 200, 500, null]);
  });

  it('filters by numeric range', () => {
    const r = listMeasurementsPaged({
      page: 1,
      pageSize: 25,
      sort: 'timestamp',
      sortDir: 'desc',
      filters: { download: { min: 100, max: 400 } },
    });
    expect(r.totalCount).toBe(1);
    expect(r.rows[0].downloadMbps).toBe(200);
  });

  it('filters by time range', () => {
    const base = Date.UTC(2026, 0, 1);
    const r = listMeasurementsPaged({
      page: 1,
      pageSize: 25,
      sort: 'timestamp',
      sortDir: 'asc',
      filters: { time: { from: base + 1500, to: base + 3500 } },
    });
    expect(r.totalCount).toBe(2);
    expect(r.rows.map((x) => x.downloadMbps)).toEqual([200, 500]);
  });

  it('filters by status list', () => {
    const r = listMeasurementsPaged({
      page: 1,
      pageSize: 25,
      sort: 'timestamp',
      sortDir: 'desc',
      filters: { status: ['success'] },
    });
    expect(r.totalCount).toBe(2);
  });

  it('filters by server contains (case-insensitive)', () => {
    const r = listMeasurementsPaged({
      page: 1,
      pageSize: 25,
      sort: 'timestamp',
      sortDir: 'desc',
      filters: { server: 'par' },
    });
    expect(r.totalCount).toBe(1);
    expect(r.rows[0].serverLocations).toEqual(['Paris']);
  });
});
