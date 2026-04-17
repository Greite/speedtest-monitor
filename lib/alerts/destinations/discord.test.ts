import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { AlertPayload } from '../types';
import { createDiscordDestination } from './discord';

const payload: AlertPayload = {
  event: 'fired', kind: 'download_below',
  title: 'Fastcom: X', body: 'body',
  observed: 1, threshold: 2, timestamp: 1_000_000,
  measurementId: 1, alertId: 7,
};

const fetchMock = vi.fn();
beforeEach(() => {
  fetchMock.mockReset();
  globalThis.fetch = fetchMock as never;
});
afterEach(() => vi.restoreAllMocks());

describe('destinations/discord', () => {
  it('POSTs an embed with red color for fired', async () => {
    fetchMock.mockResolvedValueOnce(new Response(null, { status: 204 }));
    const d = createDiscordDestination({ url: 'https://d' });
    await d.send(payload);
    const body = JSON.parse(fetchMock.mock.calls[0][1].body as string);
    expect(body.embeds[0].color).toBe(15548997);
    expect(body.embeds[0].title).toBe('Fastcom: X');
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
