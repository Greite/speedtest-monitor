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
  serverLocations: string[] | null;
  userLocation: string | null;
  userIp: string | null;
  jitterMs: number | null;
  packetLossPct: number | null;
  userIsp: string | null;
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
    serverLocations: row.serverLocations ?? null,
    userLocation: row.userLocation ?? null,
    userIp: row.userIp ?? null,
    jitterMs: row.jitterMs,
    packetLossPct: row.packetLossPct,
    userIsp: row.userIsp,
  };
}

export type WsEventDto =
  | { type: 'measurement'; payload: MeasurementDto }
  | { type: 'running'; payload: { startedAt: number } }
  | { type: 'settings_updated'; payload: { intervalMinutes: number } };
