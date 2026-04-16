import { execa } from 'execa';
import { getDb } from '../db/client';
import { type Measurement, measurements } from '../db/schema';
import { broadcastMeasurement, broadcastRunning } from '../ws/broadcast';

declare global {
  // eslint-disable-next-line no-var
  var __fastcomRunning: boolean | undefined;
}

type FastCliJson = {
  downloadSpeed?: number;
  uploadSpeed?: number;
  latency?: number;
  bufferBloat?: number;
};

const RUN_TIMEOUT_MS = 180_000;

export class MeasurementBusyError extends Error {
  constructor() {
    super('measurement already running');
    this.name = 'MeasurementBusyError';
  }
}

async function spawnFastCli(): Promise<FastCliJson> {
  const { stdout } = await execa('fast', ['--upload', '--json'], {
    timeout: RUN_TIMEOUT_MS,
    preferLocal: true,
  });
  const parsed = JSON.parse(stdout) as FastCliJson;
  return parsed;
}

function insertMeasurement(
  row: Omit<Measurement, 'id' | 'timestamp'> & { timestamp?: Date },
): Measurement {
  const db = getDb();
  const inserted = db
    .insert(measurements)
    .values({ ...row, timestamp: row.timestamp ?? new Date() })
    .returning()
    .get();
  return inserted;
}

export async function runMeasurement(): Promise<Measurement> {
  if (globalThis.__fastcomRunning) throw new MeasurementBusyError();
  globalThis.__fastcomRunning = true;
  const startedAt = Date.now();
  broadcastRunning(startedAt);

  try {
    const result = await spawnFastCli();
    const row = insertMeasurement({
      downloadMbps: result.downloadSpeed ?? null,
      uploadMbps: result.uploadSpeed ?? null,
      latencyUnloadedMs: result.latency ?? null,
      latencyLoadedMs:
        typeof result.latency === 'number' && typeof result.bufferBloat === 'number'
          ? result.latency + result.bufferBloat
          : null,
      bufferBloatMs: result.bufferBloat ?? null,
      status: 'success',
      error: null,
    });
    broadcastMeasurement(row);
    return row;
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    const isTimeout = typeof message === 'string' && message.toLowerCase().includes('timed out');
    const row = insertMeasurement({
      downloadMbps: null,
      uploadMbps: null,
      latencyUnloadedMs: null,
      latencyLoadedMs: null,
      bufferBloatMs: null,
      status: isTimeout ? 'timeout' : 'error',
      error: message.slice(0, 500),
    });
    broadcastMeasurement(row);
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
