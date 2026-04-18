import { describe, expect, it } from 'bun:test';
import type { Destination } from './destinations';
import { dispatchAlert } from './dispatch';
import type { AlertPayload, AlertRules, DestinationName } from './types';

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

const mk = (name: DestinationName, result: Promise<unknown>): Destination => ({
  name,
  send: () => result as never,
});

const rules: AlertRules = {
  enabled: true,
  thresholds: {
    downloadMbps: null,
    uploadMbps: null,
    latencyMs: null,
    bufferBloatMs: null,
  },
  failureStreak: null,
  destinations: {
    webhook: true,
    ntfy: true,
    discord: false,
    slack: true,
    smtp: false,
  },
};

describe('dispatchAlert', () => {
  it('dispatches only to enabled-in-rules destinations in parallel', async () => {
    const webhook = mk('webhook', Promise.resolve({ ok: true }));
    const ntfy = mk('ntfy', Promise.resolve({ ok: true }));
    const slack = mk('slack', Promise.resolve({ ok: true }));
    const result = await dispatchAlert({ payload, destinations: [webhook, ntfy, slack], rules });
    expect(result).toEqual({
      webhook: { ok: true },
      ntfy: { ok: true },
      slack: { ok: true },
    });
  });

  it('records one failure without affecting others', async () => {
    const webhook = mk('webhook', Promise.resolve({ ok: false, error: 'x' }));
    const ntfy = mk('ntfy', Promise.resolve({ ok: true }));
    const slack = mk('slack', Promise.resolve({ ok: true }));
    const result = await dispatchAlert({ payload, destinations: [webhook, ntfy, slack], rules });
    expect(result.webhook?.ok).toBe(false);
    expect(result.ntfy?.ok).toBe(true);
  });

  it('times out a slow destination', async () => {
    const slow = mk('webhook', new Promise(() => {}));
    const fast = mk('ntfy', Promise.resolve({ ok: true }));
    const result = await dispatchAlert({
      payload,
      destinations: [slow, fast],
      rules,
      timeoutMs: 50,
    });
    expect(result.webhook).toEqual({ ok: false, error: 'timeout' });
    expect(result.ntfy?.ok).toBe(true);
  });
});
