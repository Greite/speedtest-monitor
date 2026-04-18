import { afterEach, beforeEach, describe, expect, it, mock } from 'bun:test';
import type { AlertPayload } from '../types';
import { createWebhookDestination } from './webhook';

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

const fetchMock = mock();
beforeEach(() => {
  fetchMock.mockReset();
  globalThis.fetch = fetchMock as never;
});
afterEach(() => mock.restore());

describe('destinations/webhook', () => {
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
