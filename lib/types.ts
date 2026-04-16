import type { Measurement } from './db/schema';

export type MeasurementDto = {
  id: number;
  timestamp: number;
  downloadMbps: number | null;
  uploadMbps: number | null;
  latencyUnloadedMs: number | null;
  latencyLoadedMs: number | null;
  bufferBloatMs: number | null;
  status: 'success' | 'error' | 'timeout';
  error: string | null;
};

export function toMeasurementDto(row: Measurement): MeasurementDto {
  return {
    id: row.id,
    timestamp: row.timestamp.getTime(),
    downloadMbps: row.downloadMbps,
    uploadMbps: row.uploadMbps,
    latencyUnloadedMs: row.latencyUnloadedMs,
    latencyLoadedMs: row.latencyLoadedMs,
    bufferBloatMs: row.bufferBloatMs,
    status: row.status,
    error: row.error,
  };
}

export type WsEventDto =
  | { type: 'measurement'; payload: MeasurementDto }
  | { type: 'running'; payload: { startedAt: number } }
  | { type: 'settings_updated'; payload: { intervalMinutes: number } };
