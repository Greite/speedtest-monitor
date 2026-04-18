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

// Deterministic locale + timezone so SSR and client hydrate identically.
// Without explicit values the server uses the container TZ / Intl default
// while the browser uses its own -> React hydration mismatch.
// `NEXT_PUBLIC_*` env vars are inlined at build time in Next.js so server
// and client share the exact same string.
const LOCALE = process.env.NEXT_PUBLIC_LOCALE ?? 'fr-FR';
const TIMEZONE = process.env.NEXT_PUBLIC_TIMEZONE ?? 'Europe/Paris';

const DATE_TIME_FMT = new Intl.DateTimeFormat(LOCALE, {
  dateStyle: 'short',
  timeStyle: 'medium',
  timeZone: TIMEZONE,
});

const TIME_FMT = new Intl.DateTimeFormat(LOCALE, {
  hour: '2-digit',
  minute: '2-digit',
  timeZone: TIMEZONE,
});

export function formatDateTime(timestamp: number | string | Date): string {
  return DATE_TIME_FMT.format(asDate(timestamp));
}

export function formatTime(timestamp: number | string | Date): string {
  return TIME_FMT.format(asDate(timestamp));
}

export type LatencyLevel = 'ok' | 'warn' | 'bad';

export function latencyLevel(loadedMs: number | null | undefined): LatencyLevel {
  if (loadedMs == null) return 'warn';
  if (loadedMs < 60) return 'ok';
  if (loadedMs < 150) return 'warn';
  return 'bad';
}
