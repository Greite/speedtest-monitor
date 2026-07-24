import { afterEach, beforeEach, describe, expect, it, mock } from 'bun:test';

import type { AlertPayload } from './types';

// createSmtpDestination pulls in nodemailer at module load time, and this file
// imports everything from the same destinations module, so the mock has to be
// registered before the first `await import('./destinations')` below.
const sendMailMock = mock();
mock.module('nodemailer', () => ({
  default: { createTransport: () => ({ sendMail: sendMailMock }) },
  createTransport: () => ({ sendMail: sendMailMock }),
}));

const {
  createWebhookDestination,
  createNtfyDestination,
  createDiscordDestination,
  createSlackDestination,
  createSmtpDestination,
} = await import('./destinations');

const fetchMock = mock();
beforeEach(() => {
  fetchMock.mockReset();
  globalThis.fetch = fetchMock as never;
});
afterEach(() => mock.restore());

describe('destinations/webhook', () => {
  const payload: AlertPayload = {
    event: 'fired',
    kind: 'download_below',
    title: 't',
    body: 'b',
    observed: 50,
    threshold: 100,
    timestamp: 0,
    measurementId: 1,
    alertId: 7,
  };

  it('POSTs the payload as JSON to the configured URL with merged headers', async () => {
    fetchMock.mockResolvedValueOnce(new Response('', { status: 200 }));
    const dest = createWebhookDestination({
      url: 'https://h/x',
      headers: { Authorization: 'Bearer k' },
    });
    const result = await dest.send(payload);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe('https://h/x');
    expect(init.method).toBe('POST');
    expect(init.headers).toMatchObject({
      'Content-Type': 'application/json',
      Authorization: 'Bearer k',
    });
    expect(JSON.parse(init.body as string)).toEqual(payload);
    expect(result).toEqual({ ok: true, httpStatus: 200 });
  });

  it('returns ok:false on non-2xx', async () => {
    fetchMock.mockResolvedValueOnce(new Response('oops', { status: 500 }));
    const dest = createWebhookDestination({ url: 'https://h/x', headers: {} });
    expect(await dest.send(payload)).toEqual({
      ok: false,
      httpStatus: 500,
      error: 'HTTP 500',
    });
  });

  it('returns ok:false when fetch rejects', async () => {
    fetchMock.mockRejectedValueOnce(new Error('boom'));
    const dest = createWebhookDestination({ url: 'https://h/x', headers: {} });
    expect(await dest.send(payload)).toEqual({ ok: false, error: 'boom' });
  });
});

describe('destinations/ntfy', () => {
  const basePayload: AlertPayload = {
    event: 'fired',
    kind: 'download_below',
    title: 'Speedtest: Download dropped below 100 Mbps',
    body: 'body',
    observed: 50,
    threshold: 100,
    timestamp: 0,
    measurementId: 1,
    alertId: 7,
  };

  it('sets X-Title/Priority/Tags for fired + includes Bearer when token set', async () => {
    fetchMock.mockResolvedValueOnce(new Response('', { status: 200 }));
    const d = createNtfyDestination({ url: 'https://n/t', token: 'tk' });
    await d.send(basePayload);
    const init = fetchMock.mock.calls[0][1];
    expect(init.method).toBe('POST');
    expect(init.headers).toMatchObject({
      'X-Title': basePayload.title,
      'X-Priority': 'urgent',
      'X-Tags': 'warning,rotating_light',
      Authorization: 'Bearer tk',
    });
    expect(init.body).toBe(basePayload.body);
  });

  it('uses default priority + check tag for resolved', async () => {
    fetchMock.mockResolvedValueOnce(new Response('', { status: 200 }));
    const d = createNtfyDestination({ url: 'https://n/t' });
    await d.send({ ...basePayload, event: 'resolved' });
    const headers = fetchMock.mock.calls[0][1].headers;
    expect(headers['X-Priority']).toBe('default');
    expect(headers['X-Tags']).toBe('white_check_mark');
    expect(headers.Authorization).toBeUndefined();
  });
});

describe('destinations/discord', () => {
  const payload: AlertPayload = {
    event: 'fired',
    kind: 'download_below',
    title: 'Speedtest: X',
    body: 'body',
    observed: 1,
    threshold: 2,
    timestamp: 1_000_000,
    measurementId: 1,
    alertId: 7,
  };

  it('POSTs an embed with red color for fired', async () => {
    fetchMock.mockResolvedValueOnce(new Response(null, { status: 204 }));
    const d = createDiscordDestination({ url: 'https://d' });
    await d.send(payload);
    const body = JSON.parse(fetchMock.mock.calls[0][1].body as string);
    expect(body.embeds[0].color).toBe(15548997);
    expect(body.embeds[0].title).toBe('Speedtest: X');
    expect(body.embeds[0].description).toBe('body');
    expect(body.embeds[0].timestamp).toBe(new Date(1_000_000).toISOString());
  });

  it('uses green color for resolved', async () => {
    fetchMock.mockResolvedValueOnce(new Response(null, { status: 204 }));
    const d = createDiscordDestination({ url: 'https://d' });
    await d.send({ ...payload, event: 'resolved' });
    const body = JSON.parse(fetchMock.mock.calls[0][1].body as string);
    expect(body.embeds[0].color).toBe(5763719);
  });
});

describe('destinations/slack', () => {
  const payload: AlertPayload = {
    event: 'fired',
    kind: 'download_below',
    title: 'Speedtest: X',
    body: 'body',
    observed: 1,
    threshold: 2,
    timestamp: 0,
    measurementId: 1,
    alertId: 7,
  };

  it('posts text fallback + header + body blocks', async () => {
    fetchMock.mockResolvedValueOnce(new Response('ok', { status: 200 }));
    const d = createSlackDestination({ url: 'https://s' });
    await d.send(payload);
    const body = JSON.parse(fetchMock.mock.calls[0][1].body as string);
    expect(body.text).toBe('Speedtest: X');
    expect(body.blocks[0].type).toBe('header');
    expect(body.blocks[0].text.text).toBe('Speedtest: X');
    expect(body.blocks[1].type).toBe('section');
    expect(body.blocks[1].text.text).toContain('body');
  });
});

describe('destinations/smtp', () => {
  const payload: AlertPayload = {
    event: 'fired',
    kind: 'download_below',
    title: 't',
    body: 'b',
    observed: 1,
    threshold: 2,
    timestamp: 0,
    measurementId: 1,
    alertId: 7,
  };

  it('sends mail with expected subject/from/to/text/html and dashboard link', async () => {
    sendMailMock.mockReset();
    sendMailMock.mockResolvedValue({ messageId: 'x' });
    const d = createSmtpDestination(
      {
        host: 'smtp',
        port: 587,
        secure: false,
        user: 'u',
        pass: 'p',
        from: 'Speedtest <a@b>',
        to: ['c@d', 'e@f'],
      },
      'https://dash',
    );
    const result = await d.send(payload);
    expect(result.ok).toBe(true);
    expect(sendMailMock).toHaveBeenCalledTimes(1);
    const opts = sendMailMock.mock.calls[0][0];
    expect(opts.subject).toBe('[Speedtest] t');
    expect(opts.from).toBe('Speedtest <a@b>');
    expect(opts.to).toBe('c@d, e@f');
    expect(opts.text).toContain('b');
    expect(opts.text).toContain('https://dash');
    expect(typeof opts.html).toBe('string');
    expect(opts.html).toContain('Speedtest Monitor');
    expect(opts.html).toContain('https://dash');
  });

  it('returns ok:false when sendMail throws', async () => {
    sendMailMock.mockReset();
    sendMailMock.mockRejectedValue(new Error('SMTP fail'));
    const d = createSmtpDestination({ host: 'h', port: 25, secure: false, from: 'a@b', to: ['c@d'] }, null);
    expect(await d.send(payload)).toEqual({ ok: false, error: 'SMTP fail' });
  });
});
