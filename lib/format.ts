import { resolveDisplayConfig } from './runtime-config';

export function formatMbps(value: number | null | undefined): string {
  if (value == null) {
    return '—';
  }
  if (value >= 1000) {
    return `${(value / 1000).toFixed(1)} Gbps`;
  }
  return `${value.toFixed(value >= 100 ? 0 : 1)} Mbps`;
}

export function formatMs(value: number | null | undefined): string {
  if (value == null) {
    return '—';
  }
  return `${value.toFixed(0)} ms`;
}

function asDate(value: number | string | Date): Date {
  if (value instanceof Date) {
    return value;
  }
  return new Date(value);
}

// Formatters are created lazily so locale/timezone are resolved at runtime:
// on the server from SPEEDTEST_LOCALE / SPEEDTEST_TIMEZONE, on the client
// from the config the root layout injects before hydration. Both sides see
// the same values, so SSR and client hydrate identically.
type Formatters = {
  dateTime: Intl.DateTimeFormat;
  time: Intl.DateTimeFormat;
  shortDate: Intl.DateTimeFormat;
  relative: Intl.RelativeTimeFormat;
};

let cached: Formatters | null = null;

function formatters(): Formatters {
  if (cached === null) {
    const { locale, timeZone } = resolveDisplayConfig();
    cached = {
      dateTime: new Intl.DateTimeFormat(locale, { dateStyle: 'short', timeStyle: 'medium', timeZone }),
      time: new Intl.DateTimeFormat(locale, { hour: '2-digit', minute: '2-digit', timeZone }),
      shortDate: new Intl.DateTimeFormat(locale, { day: '2-digit', month: '2-digit', timeZone }),
      relative: new Intl.RelativeTimeFormat(locale, { numeric: 'auto' }),
    };
  }
  return cached;
}

// Test-only: drop cached formatters so env changes take effect.
export function resetFormatCache(): void {
  cached = null;
}

export function formatDateTime(timestamp: number | string | Date): string {
  return formatters().dateTime.format(asDate(timestamp));
}

export function formatTime(timestamp: number | string | Date): string {
  return formatters().time.format(asDate(timestamp));
}

export function formatShortDate(timestamp: number | string | Date): string {
  return formatters().shortDate.format(asDate(timestamp));
}

export type LatencyLevel = 'ok' | 'warn' | 'bad';

export function latencyLevel(loadedMs: number | null | undefined): LatencyLevel {
  if (loadedMs == null) {
    return 'warn';
  }
  if (loadedMs < 60) {
    return 'ok';
  }
  if (loadedMs < 150) {
    return 'warn';
  }
  return 'bad';
}

export function formatRelativeTime(timestamp: number | string | Date, now: number = Date.now()): string {
  const then = asDate(timestamp).getTime();
  const diffSec = Math.round((then - now) / 1000);
  const abs = Math.abs(diffSec);
  if (abs < 45) {
    return formatters().relative.format(diffSec, 'second');
  }
  if (abs < 45 * 60) {
    return formatters().relative.format(Math.round(diffSec / 60), 'minute');
  }
  if (abs < 22 * 3600) {
    return formatters().relative.format(Math.round(diffSec / 3600), 'hour');
  }
  return formatters().relative.format(Math.round(diffSec / 86_400), 'day');
}

export type Delta = { sign: 'up' | 'down' | 'flat'; percent: number } | null;

export function computeDelta(current: number | null | undefined, average: number | null | undefined): Delta {
  if (current == null || average == null || average === 0) {
    return null;
  }
  const percent = ((current - average) / average) * 100;
  if (Math.abs(percent) < 2) {
    return { sign: 'flat', percent: 0 };
  }
  return { sign: percent > 0 ? 'up' : 'down', percent: Math.abs(percent) };
}
