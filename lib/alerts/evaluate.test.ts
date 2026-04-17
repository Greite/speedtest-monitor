import { describe, expect, it } from 'vitest';
import type { Measurement } from '../db/schema';
import { evaluateAlerts } from './evaluate';
import { DEFAULT_RULES, type AlertRules, type AlertState } from './types';

const base: Measurement = {
  id: 1,
  timestamp: new Date(0),
  downloadMbps: 200,
  uploadMbps: 100,
  latencyUnloadedMs: 20,
  latencyLoadedMs: 30,
  bufferBloatMs: 10,
  status: 'success',
  error: null,
  serverLocations: null,
  userLocation: null,
  userIp: null,
};

const stateAllOK: AlertState = {
  download_below: 'OK',
  upload_below: 'OK',
  latency_above: 'OK',
  bufferbloat_above: 'OK',
  failure_streak: 'OK',
};

const rules = (overrides: Partial<AlertRules> = {}): AlertRules => ({
  ...DEFAULT_RULES,
  ...overrides,
  enabled: true,
  thresholds: { ...DEFAULT_RULES.thresholds, ...(overrides.thresholds ?? {}) },
});

describe('evaluateAlerts', () => {
  it('fires download_below when download crosses threshold', () => {
    const out = evaluateAlerts({
      measurement: { ...base, downloadMbps: 50 },
      streakCount: 0,
      currentState: stateAllOK,
      rules: rules({ thresholds: { ...DEFAULT_RULES.thresholds, downloadMbps: 100 } }),
    });
    expect(out).toEqual([
      { kind: 'download_below', event: 'fired', observed: 50, threshold: 100 },
    ]);
  });

  it('resolves download_below when download recovers above threshold', () => {
    const out = evaluateAlerts({
      measurement: { ...base, downloadMbps: 150 },
      streakCount: 0,
      currentState: { ...stateAllOK, download_below: 'ALERTING' },
      rules: rules({ thresholds: { ...DEFAULT_RULES.thresholds, downloadMbps: 100 } }),
    });
    expect(out).toEqual([
      { kind: 'download_below', event: 'resolved', observed: 150, threshold: 100 },
    ]);
  });

  it('does not fire when threshold is null', () => {
    expect(
      evaluateAlerts({
        measurement: { ...base, downloadMbps: 1 },
        streakCount: 0,
        currentState: stateAllOK,
        rules: rules(),
      }),
    ).toEqual([]);
  });

  it('failure_streak fires when count reaches threshold', () => {
    const out = evaluateAlerts({
      measurement: { ...base, status: 'error' },
      streakCount: 3,
      currentState: stateAllOK,
      rules: rules({ failureStreak: 3 }),
    });
    expect(out).toEqual([
      { kind: 'failure_streak', event: 'fired', observed: 3, threshold: 3 },
    ]);
  });

  it('failure_streak resolves on first success after ALERTING', () => {
    const out = evaluateAlerts({
      measurement: base,
      streakCount: 0,
      currentState: { ...stateAllOK, failure_streak: 'ALERTING' },
      rules: rules({ failureStreak: 3 }),
    });
    expect(out).toEqual([
      { kind: 'failure_streak', event: 'resolved', observed: 0, threshold: 3 },
    ]);
  });

  it('does not evaluate threshold conditions on non-success measurements', () => {
    const out = evaluateAlerts({
      measurement: { ...base, status: 'error', downloadMbps: null },
      streakCount: 1,
      currentState: { ...stateAllOK, download_below: 'ALERTING' },
      rules: rules({
        thresholds: { ...DEFAULT_RULES.thresholds, downloadMbps: 100 },
        failureStreak: 3,
      }),
    });
    expect(out.filter((t) => t.kind === 'download_below')).toEqual([]);
  });

  it('returns empty when rules.enabled=false', () => {
    expect(
      evaluateAlerts({
        measurement: { ...base, downloadMbps: 1 },
        streakCount: 0,
        currentState: stateAllOK,
        rules: { ...rules(), enabled: false },
      }),
    ).toEqual([]);
  });

  it('latency_above fires and bufferbloat_above is independent', () => {
    const out = evaluateAlerts({
      measurement: { ...base, latencyUnloadedMs: 200, bufferBloatMs: 5 },
      streakCount: 0,
      currentState: stateAllOK,
      rules: rules({
        thresholds: {
          ...DEFAULT_RULES.thresholds,
          latencyMs: 100,
          bufferBloatMs: 100,
        },
      }),
    });
    expect(out).toEqual([
      { kind: 'latency_above', event: 'fired', observed: 200, threshold: 100 },
    ]);
  });
});
