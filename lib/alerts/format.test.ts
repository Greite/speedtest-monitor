import { describe, expect, it } from 'bun:test';
import { formatMessage } from './format';

describe('formatMessage', () => {
  it('fired download_below title + body', () => {
    const { title, body } = formatMessage({
      transition: {
        kind: 'download_below',
        event: 'fired',
        observed: 50,
        threshold: 100,
      },
      timestamp: Date.UTC(2026, 3, 17, 14, 32, 15),
    });
    expect(title).toBe('Speedtest: Download dropped below 100 Mbps');
    expect(body).toContain('Observed 50 Mbps');
    expect(body).toContain('threshold 100 Mbps');
  });

  it('resolved latency_above title', () => {
    const { title } = formatMessage({
      transition: {
        kind: 'latency_above',
        event: 'resolved',
        observed: 25,
        threshold: 100,
      },
      timestamp: 0,
    });
    expect(title).toBe('Speedtest: Latency recovered');
  });

  it('failure_streak fired uses count in title', () => {
    const { title } = formatMessage({
      transition: {
        kind: 'failure_streak',
        event: 'fired',
        observed: 3,
        threshold: 3,
      },
      timestamp: 0,
    });
    expect(title).toBe('Speedtest: 3 consecutive measurement failures');
  });
});
