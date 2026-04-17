import { describe, expect, it, vi } from 'vitest';
import { POST } from './route';

vi.mock('@/lib/alerts/destinations', () => ({
  buildDestinations: () => [
    { name: 'webhook', send: async () => ({ ok: true }) },
    { name: 'ntfy', send: async () => ({ ok: false, error: 'boom' }) },
  ],
  configuredNames: () => ({ webhook: true, ntfy: true, discord: false, slack: false, smtp: false }),
}));

describe('POST /api/alerts/test', () => {
  it('dispatches to all configured when no body', async () => {
    const res = await POST(new Request('http://x/api/alerts/test', { method: 'POST' }));
    const body = await res.json();
    expect(body.results.webhook.ok).toBe(true);
    expect(body.results.ntfy.ok).toBe(false);
  });

  it('dispatches only to the chosen destination', async () => {
    const res = await POST(
      new Request('http://x/api/alerts/test', {
        method: 'POST',
        body: JSON.stringify({ destination: 'webhook' }),
      }),
    );
    const body = await res.json();
    expect(Object.keys(body.results)).toEqual(['webhook']);
  });
});
