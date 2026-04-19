// lib/measurement/runner.test.ts
import { Database } from 'bun:sqlite';
import { afterAll, beforeEach, describe, expect, it, mock } from 'bun:test';
import { drizzle } from 'drizzle-orm/bun-sqlite';
import * as schema from '../db/schema';
import type { EngineResult } from './types';

const engineMock = mock<() => Promise<EngineResult>>();

// Capture real modules BEFORE mocking so we can restore the process-global
// module registry after this file's tests complete. bun:test's mock.module is
// not file-scoped (unlike vitest's vi.mock), so without the afterAll restore,
// the mocks leak into sibling test files (e.g. lib/alerts/handle.test.ts).
const realCloudflare = { ...(await import('./cloudflare')) };
const realBroadcast = { ...(await import('../ws/broadcast')) };
const realHandle = { ...(await import('../alerts/handle')) };

mock.module('./cloudflare', () => ({
  runCloudflareSpeedTest: () => engineMock(),
}));
mock.module('../ws/broadcast', () => ({
  broadcastMeasurement: mock(),
  broadcastRunning: mock(),
}));
mock.module('../alerts/handle', () => ({
  handleAlertsForMeasurement: mock(),
}));

afterAll(() => {
  mock.module('./cloudflare', () => realCloudflare);
  mock.module('../ws/broadcast', () => realBroadcast);
  mock.module('../alerts/handle', () => realHandle);
});

const { runMeasurement, runMeasurementSafe, MeasurementBusyError, isMeasurementRunning } =
  await import('./runner');

const fullResult: EngineResult = {
  downloadMbps: 300,
  uploadMbps: 80,
  latencyUnloadedMs: 10,
  latencyLoadedMs: 50,
  bufferBloatMs: 40,
  jitterMs: 2,
  packetLossPct: 0,
  userLocation: 'Paris, FR',
  userIp: '82.66.1.2',
  userIsp: 'Free SAS',
  serverLocations: ['CDG'],
};

let sqlite: Database;
beforeEach(() => {
  engineMock.mockReset();
  delete (globalThis as { __speedtestRunning?: boolean }).__speedtestRunning;
  sqlite = new Database(':memory:');
  const db = drizzle(sqlite, { schema });
  sqlite.exec(`
    CREATE TABLE measurements (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      timestamp INTEGER NOT NULL DEFAULT (unixepoch() * 1000),
      download_mbps REAL, upload_mbps REAL,
      latency_unloaded_ms REAL, latency_loaded_ms REAL,
      buffer_bloat_ms REAL,
      status TEXT NOT NULL, error TEXT,
      server_locations TEXT,
      user_location TEXT, user_ip TEXT,
      jitter_ms REAL, packet_loss_pct REAL, user_isp TEXT
    );
  `);
  globalThis.__speedtestDb = { sqlite, db };
});

describe('runMeasurement', () => {
  it('inserts a success row with all fields when the engine returns complete data', async () => {
    engineMock.mockResolvedValueOnce(fullResult);
    const row = await runMeasurement();
    expect(row.status).toBe('success');
    expect(row.downloadMbps).toBe(300);
    expect(row.uploadMbps).toBe(80);
    expect(row.jitterMs).toBe(2);
    expect(row.userIsp).toBe('Free SAS');
    expect(row.serverLocations).toEqual(['CDG']);
  });

  it('stores status="error" when upload is missing (partial results)', async () => {
    engineMock.mockResolvedValueOnce({ ...fullResult, uploadMbps: null });
    const row = await runMeasurement();
    expect(row.status).toBe('error');
    expect(row.error).toMatch(/incomplete/);
  });

  it('stores status="timeout" when the engine rejects with "timed out"', async () => {
    engineMock.mockRejectedValueOnce(new Error('timed out after 60s'));
    const row = await runMeasurement();
    expect(row.status).toBe('timeout');
  });

  it('stores status="error" on generic engine failure', async () => {
    engineMock.mockRejectedValueOnce(new Error('fetch failed'));
    const row = await runMeasurement();
    expect(row.status).toBe('error');
    expect(row.error).toContain('fetch failed');
  });

  it('throws MeasurementBusyError when another run is in flight', async () => {
    globalThis.__speedtestRunning = true;
    await expect(runMeasurement()).rejects.toBeInstanceOf(MeasurementBusyError);
    expect(isMeasurementRunning()).toBe(true);
  });

  it('runMeasurementSafe returns null instead of throwing busy', async () => {
    globalThis.__speedtestRunning = true;
    expect(await runMeasurementSafe()).toBeNull();
  });
});
