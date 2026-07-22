export type DisplayConfig = { locale: string; timeZone: string };

export const DEFAULT_LOCALE = 'en-US';
export const DEFAULT_TIMEZONE = 'UTC';

declare global {
  interface Window {
    __SPEEDTEST_CONFIG__?: DisplayConfig;
  }
}

function validLocale(value: string | undefined): string {
  if (!value) {
    return DEFAULT_LOCALE;
  }
  try {
    void Intl.DateTimeFormat.supportedLocalesOf(value);
    return value;
  } catch {
    // biome-ignore lint/suspicious/noConsole: operator-facing config warning for self-hosted deployments
    console.warn(`[config] invalid SPEEDTEST_LOCALE "${value}", falling back to ${DEFAULT_LOCALE}`);
    return DEFAULT_LOCALE;
  }
}

function validTimeZone(value: string | undefined): string {
  if (!value) {
    return DEFAULT_TIMEZONE;
  }
  try {
    void new Intl.DateTimeFormat(DEFAULT_LOCALE, { timeZone: value });
    return value;
  } catch {
    // biome-ignore lint/suspicious/noConsole: operator-facing config warning for self-hosted deployments
    console.warn(`[config] invalid SPEEDTEST_TIMEZONE "${value}", falling back to ${DEFAULT_TIMEZONE}`);
    return DEFAULT_TIMEZONE;
  }
}

// Server: read env at request time (no NEXT_PUBLIC_ prefix, so Next.js never
// inlines the values at build time - the published Docker image is built
// without them). Client: read the config the root layout injects before
// hydration, so SSR and client always format with identical values.
export function resolveDisplayConfig(): DisplayConfig {
  if (typeof window !== 'undefined' && window.__SPEEDTEST_CONFIG__) {
    return window.__SPEEDTEST_CONFIG__;
  }
  return {
    locale: validLocale(process.env.SPEEDTEST_LOCALE),
    timeZone: validTimeZone(process.env.SPEEDTEST_TIMEZONE),
  };
}
