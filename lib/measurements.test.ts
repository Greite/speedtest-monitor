import { describe, expect, it } from 'vitest';
import { cutoffForRetentionDays, isRange } from './measurements';

describe('isRange', () => {
  it('accepts the documented ranges', () => {
    for (const r of ['1h', '6h', '24h', '7d', '30d']) {
      expect(isRange(r)).toBe(true);
    }
  });

  it('rejects unknown values', () => {
    expect(isRange('1m')).toBe(false);
    expect(isRange('')).toBe(false);
    expect(isRange('24H')).toBe(false);
    expect(isRange('365d')).toBe(false);
  });
});

describe('cutoffForRetentionDays', () => {
  const now = new Date('2026-04-17T12:00:00Z');

  it('returns now minus N days', () => {
    expect(cutoffForRetentionDays(1, now).toISOString()).toBe('2026-04-16T12:00:00.000Z');
    expect(cutoffForRetentionDays(30, now).toISOString()).toBe('2026-03-18T12:00:00.000Z');
    expect(cutoffForRetentionDays(90, now).toISOString()).toBe('2026-01-17T12:00:00.000Z');
  });

  it('returns now for retention=0 (boundary - callers validate range)', () => {
    expect(cutoffForRetentionDays(0, now).getTime()).toBe(now.getTime());
  });
});
