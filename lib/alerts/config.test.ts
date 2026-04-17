import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { loadAlertConfig } from './config';

const ENV_KEYS = [
  'FASTCOM_WEBHOOK_URL', 'FASTCOM_WEBHOOK_HEADERS',
  'FASTCOM_NTFY_URL', 'FASTCOM_NTFY_TOKEN',
  'FASTCOM_DISCORD_WEBHOOK', 'FASTCOM_SLACK_WEBHOOK',
  'FASTCOM_SMTP_HOST', 'FASTCOM_SMTP_PORT', 'FASTCOM_SMTP_SECURE',
  'FASTCOM_SMTP_USER', 'FASTCOM_SMTP_PASS',
  'FASTCOM_SMTP_FROM', 'FASTCOM_SMTP_TO',
  'FASTCOM_PUBLIC_URL',
];

beforeEach(() => ENV_KEYS.forEach((k) => delete process.env[k]));
afterEach(() => ENV_KEYS.forEach((k) => delete process.env[k]));

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
    process.env.FASTCOM_WEBHOOK_URL = 'https://hook.example/x';
    process.env.FASTCOM_WEBHOOK_HEADERS = '{"Authorization":"Bearer abc"}';
    const c = loadAlertConfig();
    expect(c.webhook).toEqual({
      url: 'https://hook.example/x',
      headers: { Authorization: 'Bearer abc' },
    });
  });

  it('treats invalid webhook headers JSON as unconfigured headers', () => {
    process.env.FASTCOM_WEBHOOK_URL = 'https://hook.example/x';
    process.env.FASTCOM_WEBHOOK_HEADERS = '{bad json';
    const c = loadAlertConfig();
    expect(c.webhook).toEqual({ url: 'https://hook.example/x', headers: {} });
  });

  it('parses ntfy url + token', () => {
    process.env.FASTCOM_NTFY_URL = 'https://ntfy.sh/topic';
    process.env.FASTCOM_NTFY_TOKEN = 'tk_1';
    expect(loadAlertConfig().ntfy).toEqual({
      url: 'https://ntfy.sh/topic',
      token: 'tk_1',
    });
  });

  it('derives smtp secure=true when port=465', () => {
    process.env.FASTCOM_SMTP_HOST = 'smtp.example';
    process.env.FASTCOM_SMTP_PORT = '465';
    process.env.FASTCOM_SMTP_FROM = 'a@b';
    process.env.FASTCOM_SMTP_TO = 'c@d';
    expect(loadAlertConfig().smtp?.secure).toBe(true);
  });

  it('derives smtp secure=false for other ports unless overridden', () => {
    process.env.FASTCOM_SMTP_HOST = 'smtp.example';
    process.env.FASTCOM_SMTP_PORT = '587';
    process.env.FASTCOM_SMTP_FROM = 'a@b';
    process.env.FASTCOM_SMTP_TO = 'c@d';
    expect(loadAlertConfig().smtp?.secure).toBe(false);
    process.env.FASTCOM_SMTP_SECURE = 'true';
    expect(loadAlertConfig().smtp?.secure).toBe(true);
  });

  it('parses comma-separated SMTP_TO', () => {
    process.env.FASTCOM_SMTP_HOST = 'smtp.example';
    process.env.FASTCOM_SMTP_FROM = 'a@b';
    process.env.FASTCOM_SMTP_TO = 'c@d, e@f';
    expect(loadAlertConfig().smtp?.to).toEqual(['c@d', 'e@f']);
  });
});
