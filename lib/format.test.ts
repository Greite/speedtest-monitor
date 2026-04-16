import { describe, expect, it } from 'vitest';
import { formatMbps, formatMs, formatTime, latencyLevel } from './format';

describe('formatMbps', () => {
  it('renders em-dash for null/undefined', () => {
    expect(formatMbps(null)).toBe('—');
    expect(formatMbps(undefined)).toBe('—');
  });

  it('shows one decimal under 100 Mbps', () => {
    expect(formatMbps(45.678)).toBe('45.7 Mbps');
    expect(formatMbps(99.9)).toBe('99.9 Mbps');
  });

  it('drops decimals between 100 and 999 Mbps', () => {
    expect(formatMbps(150.7)).toBe('151 Mbps');
    expect(formatMbps(999.4)).toBe('999 Mbps');
  });

  it('switches to Gbps at or above 1000', () => {
    expect(formatMbps(1000)).toBe('1.0 Gbps');
    expect(formatMbps(1234)).toBe('1.2 Gbps');
  });
});

describe('formatMs', () => {
  it('renders em-dash for null/undefined', () => {
    expect(formatMs(null)).toBe('—');
    expect(formatMs(undefined)).toBe('—');
  });

  it('rounds to integer ms', () => {
    expect(formatMs(12.4)).toBe('12 ms');
    expect(formatMs(12.7)).toBe('13 ms');
  });
});

describe('latencyLevel', () => {
  it('defaults to warn when loaded latency is unknown', () => {
    expect(latencyLevel(null)).toBe('warn');
    expect(latencyLevel(undefined)).toBe('warn');
  });

  it('classifies green under 60 ms', () => {
    expect(latencyLevel(10)).toBe('ok');
    expect(latencyLevel(59.9)).toBe('ok');
  });

  it('classifies warn between 60 and 149 ms', () => {
    expect(latencyLevel(60)).toBe('warn');
    expect(latencyLevel(149)).toBe('warn');
  });

  it('classifies bad at 150 ms or higher', () => {
    expect(latencyLevel(150)).toBe('bad');
    expect(latencyLevel(1200)).toBe('bad');
  });
});

describe('formatTime', () => {
  it('returns a locale time string for a given timestamp', () => {
    const ts = new Date('2024-06-15T14:30:00Z').getTime();
    const out = formatTime(ts);
    expect(out).toMatch(/\d{2}:\d{2}/);
  });
});
