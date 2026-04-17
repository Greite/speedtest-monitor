import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { AlertPayload } from '../types';
import { createNtfyDestination } from './ntfy';

const basePayload: AlertPayload = {
  event: 'fired',
  kind: 'download_below',
  title: 'Fastcom: Download dropped below 100 Mbps',
  body: 'body',
  observed: 50,
  threshold: 100,
  timestamp: 0,
  measurementId: 1,
  alertId: 7,
};

const fetchMock = vi.fn();
beforeEach(() => {
  fetchMock.mockReset();
  globalThis.fetch = fetchMock as never;
});
afterEach(() => vi.restoreAllMocks());

describe('destinations/ntfy', () => {
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
