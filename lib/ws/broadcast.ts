import type { Alert, Measurement } from '../db/schema';
import { toMeasurementDto } from '../types';
import { broadcast } from './server';

export function broadcastMeasurement(row: Measurement) {
  broadcast({ type: 'measurement', payload: toMeasurementDto(row) });
}

export function broadcastRunning(startedAt: number) {
  broadcast({ type: 'running', payload: { startedAt } });
}

export function broadcastSettingsUpdated(intervalMinutes: number) {
  broadcast({ type: 'settings_updated', payload: { intervalMinutes } });
}

export function broadcastAlert(row: Alert) {
  const status = row.deliveryStatus ?? {};
  const scrubbed: Record<string, { ok: boolean; httpStatus?: number }> = {};
  for (const [name, entry] of Object.entries(status)) {
    scrubbed[name] = entry.httpStatus !== undefined ? { ok: entry.ok, httpStatus: entry.httpStatus } : { ok: entry.ok };
  }
  broadcast({
    type: 'alert',
    payload: {
      id: row.id,
      timestamp: row.timestamp.getTime(),
      kind: row.kind,
      event: row.event,
      measurementId: row.measurementId,
      threshold: row.threshold,
      observed: row.observed,
      deliveryStatus: scrubbed,
    },
  });
}
