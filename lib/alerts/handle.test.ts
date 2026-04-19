import { Database } from 'bun:sqlite';
import { beforeEach, describe, expect, it, mock } from 'bun:test';
import { drizzle } from 'drizzle-orm/bun-sqlite';
import * as schema from '../db/schema';
import { alerts, measurements } from '../db/schema';
import { handleAlertsForMeasurement } from './handle';
import { setAlertRules } from './rules';

mock.module('./destinations', () => ({
  buildDestinations: () => [{ name: 'webhook', send: async () => ({ ok: true }) }],
  configuredNames: () => ({
    webhook: true,
    ntfy: false,
    discord: false,
    slack: false,
    smtp: false,
  }),
}));
mock.module('../ws/broadcast', () => ({ broadcastAlert: mock() }));

let sqlite: Database;
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
      error TEXT, server_locations TEXT,
      user_location TEXT, user_ip TEXT,
      jitter_ms REAL, packet_loss_pct REAL, user_isp TEXT
    );
    CREATE TABLE alerts (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      timestamp INTEGER NOT NULL DEFAULT (unixepoch() * 1000),
      kind TEXT NOT NULL, event TEXT NOT NULL,
      measurement_id INTEGER, threshold REAL, observed REAL,
      delivery_status TEXT
    );
    CREATE TABLE settings (
      key TEXT PRIMARY KEY, value TEXT NOT NULL, updated_at INTEGER NOT NULL
    );
  `);
  globalThis.__speedtestDb = { sqlite, db };
});

describe('handleAlertsForMeasurement', () => {
  it('skips when alerts are disabled', async () => {
    await handleAlertsForMeasurement({
      id: 1,
      timestamp: new Date(),
      status: 'success',
      downloadMbps: 50,
      uploadMbps: null,
      latencyUnloadedMs: null,
      latencyLoadedMs: null,
      bufferBloatMs: null,
      error: null,
      serverLocations: null,
      userLocation: null,
      userIp: null,
      jitterMs: null,
      packetLossPct: null,
      userIsp: null,
    });
    const db = drizzle(sqlite, { schema });
    expect(db.select().from(alerts).all()).toEqual([]);
  });

  it('inserts an alerts row and updates delivery_status for a transition', async () => {
    setAlertRules({
      enabled: true,
      thresholds: { downloadMbps: 100, uploadMbps: null, latencyMs: null, bufferBloatMs: null },
      destinations: { webhook: true, ntfy: false, discord: false, slack: false, smtp: false },
    });
    const db = drizzle(sqlite, { schema });
    const inserted = db
      .insert(measurements)
      .values({ status: 'success', downloadMbps: 50, timestamp: new Date(1) })
      .returning()
      .get();

    await handleAlertsForMeasurement(inserted);

    // The dispatch is fire-and-forget inside handle; wait for microtask queue
    await new Promise((r) => setTimeout(r, 10));

    const rows = db.select().from(alerts).all();
    expect(rows).toHaveLength(1);
    expect(rows[0].kind).toBe('download_below');
    expect(rows[0].event).toBe('fired');
    expect(rows[0].deliveryStatus).toMatchObject({ webhook: { ok: true } });
  });
});
