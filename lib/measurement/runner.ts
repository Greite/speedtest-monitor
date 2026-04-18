// lib/measurement/runner.ts
import { handleAlertsForMeasurement } from '../alerts/handle';
import { getDb } from '../db/client';
import { type Measurement, measurements } from '../db/schema';
import { broadcastMeasurement, broadcastRunning } from '../ws/broadcast';
import { runCloudflareSpeedTest } from './cloudflare';

declare global {
  // eslint-disable-next-line no-var
  var __fastcomRunning: boolean | undefined;
}

export class MeasurementBusyError extends Error {
  constructor() {
    super('measurement already running');
    this.name = 'MeasurementBusyError';
  }
}

function insertMeasurement(
  row: Omit<Measurement, 'id' | 'timestamp'> & { timestamp?: Date },
): Measurement {
  const db = getDb();
  return db
    .insert(measurements)
    .values({ ...row, timestamp: row.timestamp ?? new Date() })
    .returning()
    .get();
}

export async function runMeasurement(): Promise<Measurement> {
  if (globalThis.__fastcomRunning) throw new MeasurementBusyError();
  globalThis.__fastcomRunning = true;
  const startedAt = Date.now();
  broadcastRunning(startedAt);

  try {
    const result = await runCloudflareSpeedTest();
    if (result.downloadMbps === null || result.uploadMbps === null) {
      throw new Error(
        `incomplete results: download=${result.downloadMbps} upload=${result.uploadMbps}`,
      );
    }
    const row = insertMeasurement({
      downloadMbps: result.downloadMbps,
      uploadMbps: result.uploadMbps,
      latencyUnloadedMs: result.latencyUnloadedMs,
      latencyLoadedMs: result.latencyLoadedMs,
      bufferBloatMs: result.bufferBloatMs,
      jitterMs: result.jitterMs,
      packetLossPct: result.packetLossPct,
      status: 'success',
      error: null,
      serverLocations: result.serverLocations,
      userLocation: result.userLocation,
      userIp: result.userIp,
      userIsp: result.userIsp,
    });
    broadcastMeasurement(row);
    void handleAlertsForMeasurement(row);
    return row;
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    const isTimeout = message.toLowerCase().includes('timed out');
    const row = insertMeasurement({
      downloadMbps: null,
      uploadMbps: null,
      latencyUnloadedMs: null,
      latencyLoadedMs: null,
      bufferBloatMs: null,
      jitterMs: null,
      packetLossPct: null,
      status: isTimeout ? 'timeout' : 'error',
      error: message.slice(0, 500),
      serverLocations: null,
      userLocation: null,
      userIp: null,
      userIsp: null,
    });
    broadcastMeasurement(row);
    void handleAlertsForMeasurement(row);
    return row;
  } finally {
    globalThis.__fastcomRunning = false;
  }
}

export async function runMeasurementSafe(): Promise<Measurement | null> {
  try {
    return await runMeasurement();
  } catch (err) {
    if (err instanceof MeasurementBusyError) return null;
    throw err;
  }
}

export function isMeasurementRunning(): boolean {
  return Boolean(globalThis.__fastcomRunning);
}
