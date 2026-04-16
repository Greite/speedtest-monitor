import { describe, expect, it } from 'vitest';
import { isRange } from './measurements';

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
