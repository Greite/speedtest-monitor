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
      deliveryStatus: row.deliveryStatus ?? {},
    },
  });
}
