export function formatMbps(value: number | null | undefined): string {
  if (value == null) return '—';
  if (value >= 1000) return `${(value / 1000).toFixed(1)} Gbps`;
  return `${value.toFixed(value >= 100 ? 0 : 1)} Mbps`;
}

export function formatMs(value: number | null | undefined): string {
  if (value == null) return '—';
  return `${value.toFixed(0)} ms`;
}

function asDate(value: number | string | Date): Date {
  if (value instanceof Date) return value;
  return new Date(value);
}

export function formatDateTime(timestamp: number | string | Date): string {
  return asDate(timestamp).toLocaleString();
}

export function formatTime(timestamp: number | string | Date): string {
  return asDate(timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

export type LatencyLevel = 'ok' | 'warn' | 'bad';

export function latencyLevel(loadedMs: number | null | undefined): LatencyLevel {
  if (loadedMs == null) return 'warn';
  if (loadedMs < 60) return 'ok';
  if (loadedMs < 150) return 'warn';
  return 'bad';
}
