import type { Measurement } from '../db/schema';
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
