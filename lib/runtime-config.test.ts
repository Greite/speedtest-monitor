import { afterEach, describe, expect, it } from 'bun:test';

import { DEFAULT_LOCALE, DEFAULT_TIMEZONE, resolveDisplayConfig } from './runtime-config';

const ORIGINAL_LOCALE = process.env.SPEEDTEST_LOCALE;
const ORIGINAL_TIMEZONE = process.env.SPEEDTEST_TIMEZONE;

function restoreEnv(): void {
  if (ORIGINAL_LOCALE === undefined) {
    delete process.env.SPEEDTEST_LOCALE;
  } else {
    process.env.SPEEDTEST_LOCALE = ORIGINAL_LOCALE;
  }
  if (ORIGINAL_TIMEZONE === undefined) {
    delete process.env.SPEEDTEST_TIMEZONE;
  } else {
    process.env.SPEEDTEST_TIMEZONE = ORIGINAL_TIMEZONE;
  }
}

describe('resolveDisplayConfig', () => {
  afterEach(restoreEnv);

  it('defaults to en-US / UTC when env vars are unset', () => {
    delete process.env.SPEEDTEST_LOCALE;
    delete process.env.SPEEDTEST_TIMEZONE;
    expect(resolveDisplayConfig()).toEqual({ locale: DEFAULT_LOCALE, timeZone: DEFAULT_TIMEZONE });
  });

  it('uses configured values when valid', () => {
    process.env.SPEEDTEST_LOCALE = 'fr-FR';
    process.env.SPEEDTEST_TIMEZONE = 'Europe/Paris';
    expect(resolveDisplayConfig()).toEqual({ locale: 'fr-FR', timeZone: 'Europe/Paris' });
  });

  it('falls back to defaults on invalid values', () => {
    process.env.SPEEDTEST_LOCALE = 'not a locale!';
    process.env.SPEEDTEST_TIMEZONE = 'Mars/Olympus';
    expect(resolveDisplayConfig()).toEqual({ locale: DEFAULT_LOCALE, timeZone: DEFAULT_TIMEZONE });
  });
});
