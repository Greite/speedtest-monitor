import { afterEach, beforeEach, describe, expect, it } from 'bun:test';
import { loadAlertConfig } from './config';

const ENV_KEYS = [
  'SPEEDTEST_WEBHOOK_URL',
  'SPEEDTEST_WEBHOOK_HEADERS',
  'SPEEDTEST_NTFY_URL',
  'SPEEDTEST_NTFY_TOKEN',
  'SPEEDTEST_DISCORD_WEBHOOK',
  'SPEEDTEST_SLACK_WEBHOOK',
  'SPEEDTEST_SMTP_HOST',
  'SPEEDTEST_SMTP_PORT',
  'SPEEDTEST_SMTP_SECURE',
  'SPEEDTEST_SMTP_USER',
  'SPEEDTEST_SMTP_PASS',
  'SPEEDTEST_SMTP_FROM',
  'SPEEDTEST_SMTP_TO',
  'SPEEDTEST_PUBLIC_URL',
];

beforeEach(() => {
  for (const k of ENV_KEYS) delete process.env[k];
});
afterEach(() => {
  for (const k of ENV_KEYS) delete process.env[k];
});

describe('alerts/config', () => {
  it('marks all destinations unconfigured when no env is set', () => {
    const c = loadAlertConfig();
    expect(c.webhook).toBeNull();
    expect(c.ntfy).toBeNull();
    expect(c.discord).toBeNull();
    expect(c.slack).toBeNull();
    expect(c.smtp).toBeNull();
  });

  it('parses webhook url + headers JSON', () => {
    process.env.SPEEDTEST_WEBHOOK_URL = 'https://hook.example/x';
    process.env.SPEEDTEST_WEBHOOK_HEADERS = '{"Authorization":"Bearer abc"}';
    const c = loadAlertConfig();
    expect(c.webhook).toEqual({
      url: 'https://hook.example/x',
      headers: { Authorization: 'Bearer abc' },
    });
  });

  it('treats invalid webhook headers JSON as unconfigured headers', () => {
    process.env.SPEEDTEST_WEBHOOK_URL = 'https://hook.example/x';
    process.env.SPEEDTEST_WEBHOOK_HEADERS = '{bad json';
    const c = loadAlertConfig();
    expect(c.webhook).toEqual({ url: 'https://hook.example/x', headers: {} });
  });

  it('parses ntfy url + token', () => {
    process.env.SPEEDTEST_NTFY_URL = 'https://ntfy.sh/topic';
    process.env.SPEEDTEST_NTFY_TOKEN = 'tk_1';
    expect(loadAlertConfig().ntfy).toEqual({
      url: 'https://ntfy.sh/topic',
      token: 'tk_1',
    });
  });

  it('derives smtp secure=true when port=465', () => {
    process.env.SPEEDTEST_SMTP_HOST = 'smtp.example';
    process.env.SPEEDTEST_SMTP_PORT = '465';
    process.env.SPEEDTEST_SMTP_FROM = 'a@b';
    process.env.SPEEDTEST_SMTP_TO = 'c@d';
    expect(loadAlertConfig().smtp?.secure).toBe(true);
  });

  it('derives smtp secure=false for other ports unless overridden', () => {
    process.env.SPEEDTEST_SMTP_HOST = 'smtp.example';
    process.env.SPEEDTEST_SMTP_PORT = '587';
    process.env.SPEEDTEST_SMTP_FROM = 'a@b';
    process.env.SPEEDTEST_SMTP_TO = 'c@d';
    expect(loadAlertConfig().smtp?.secure).toBe(false);
    process.env.SPEEDTEST_SMTP_SECURE = 'true';
    expect(loadAlertConfig().smtp?.secure).toBe(true);
  });

  it('parses comma-separated SMTP_TO', () => {
    process.env.SPEEDTEST_SMTP_HOST = 'smtp.example';
    process.env.SPEEDTEST_SMTP_FROM = 'a@b';
    process.env.SPEEDTEST_SMTP_TO = 'c@d, e@f';
    expect(loadAlertConfig().smtp?.to).toEqual(['c@d', 'e@f']);
  });
});
