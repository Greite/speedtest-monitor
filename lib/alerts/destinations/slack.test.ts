import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { AlertPayload } from '../types';
import { createSlackDestination } from './slack';

const payload: AlertPayload = {
  event: 'fired',
  kind: 'download_below',
  title: 'Fastcom: X',
  body: 'body',
  observed: 1,
  threshold: 2,
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

describe('destinations/slack', () => {
  it('posts text fallback + header + body blocks', async () => {
    fetchMock.mockResolvedValueOnce(new Response('ok', { status: 200 }));
    const d = createSlackDestination({ url: 'https://s' });
    await d.send(payload);
    const body = JSON.parse(fetchMock.mock.calls[0][1].body as string);
    expect(body.text).toBe('Fastcom: X');
    expect(body.blocks[0].type).toBe('header');
    expect(body.blocks[0].text.text).toBe('Fastcom: X');
    expect(body.blocks[1].type).toBe('section');
    expect(body.blocks[1].text.text).toContain('body');
  });
});
