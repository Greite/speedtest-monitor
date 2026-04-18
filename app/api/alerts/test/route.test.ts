import { afterAll, describe, expect, it, mock } from 'bun:test';

// Capture the real destinations module BEFORE mocking, so we can restore the
// process-global module registry after this file's tests complete. bun:test's
// mock.module is not file-scoped (unlike vitest's vi.mock), so without this
// the mock leaks into sibling test files (e.g. alerts/rules/route.test.ts,
// alerts/handle.test.ts).
const realDestinations = { ...(await import('@/lib/alerts/destinations')) };

mock.module('@/lib/alerts/destinations', () => ({
  buildDestinations: () => [
    { name: 'webhook', send: async () => ({ ok: true }) },
    { name: 'ntfy', send: async () => ({ ok: false, error: 'boom' }) },
  ],
  configuredNames: () => ({ webhook: true, ntfy: true, discord: false, slack: false, smtp: false }),
}));

const { POST } = await import('./route');

afterAll(() => {
  mock.module('@/lib/alerts/destinations', () => realDestinations);
});

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
