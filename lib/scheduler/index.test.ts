// lib/scheduler/index.test.ts
import { afterAll, afterEach, describe, expect, it, mock } from 'bun:test';

let minutes = 15;

// Capture the real module before mocking so it can be restored after this
// file's tests complete - mock.module leaks across sibling test files
// otherwise (see lib/measurement/runner.test.ts for the same pattern).
const realSettings = { ...(await import('../settings')) };

mock.module('../settings', () => ({
  getIntervalMinutes: () => minutes,
  getRetentionDays: () => 90,
}));

afterAll(() => {
  mock.module('../settings', () => realSettings);
});

const { alignedDelay, rescheduleFromSettings, stopScheduler } = await import('./index');

afterEach(() => {
  stopScheduler();
  minutes = 15;
});

describe('alignedDelay', () => {
  const MIN = 60_000;
  const HOUR = 60 * MIN;
  // Wall-clock time in Europe/Paris (UTC+2 in July), the timezone every case
  // below is aligned against.
  const at = (h: number, m: number) =>
    Date.parse(`2026-07-24T${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:00+02:00`);
  const paris = (nowMs: number, periodMs: number, offsetMs = 0) =>
    alignedDelay(nowMs, periodMs, offsetMs, 'Europe/Paris');

  it('waits until the next clock boundary instead of a full period', () => {
    // Booted at 16:50 - an hourly schedule must fire at 17:00, in 10 min.
    expect(paris(at(16, 50), HOUR)).toBe(10 * MIN);
    expect(paris(at(16, 50), 15 * MIN)).toBe(10 * MIN);
    expect(paris(at(16, 50), 30 * MIN)).toBe(10 * MIN);
  });

  it('aligns intervals that do not divide an hour on the local-midnight grid', () => {
    // 90 min grid from local midnight: 15:00, 16:30, 18:00...
    expect(paris(at(16, 50), 90 * MIN)).toBe(70 * MIN);
    expect(paris(at(15, 0), 90 * MIN)).toBe(90 * MIN);
    expect(paris(at(0, 0), 90 * MIN)).toBe(90 * MIN);
  });

  it('follows the app timezone, not the process one', () => {
    // 16:50 Paris sits 20 min into the 16:30 Paris slot - next tick in 70 min.
    expect(paris(at(16, 50), 90 * MIN)).toBe(70 * MIN);
    // Same instant is 14:50 UTC, 80 min into the 13:30 UTC slot.
    expect(alignedDelay(at(16, 50), 90 * MIN, 0, 'UTC')).toBe(10 * MIN);
    // ...and 20:20 in Kolkata (UTC+5:30), 50 min into the 19:30 slot.
    expect(alignedDelay(at(16, 50), 90 * MIN, 0, 'Asia/Kolkata')).toBe(40 * MIN);
  });

  it('shifts the grid by offsetMs - the daily 03:00 purge slot', () => {
    const DAY = 24 * HOUR;
    expect(paris(at(16, 50), DAY, 3 * HOUR)).toBe(10 * HOUR + 10 * MIN);
    // Before 03:00 the same day, the wait is short - no negative modulo.
    expect(paris(at(2, 0), DAY, 3 * HOUR)).toBe(HOUR);
    expect(paris(at(3, 0), DAY, 3 * HOUR)).toBe(DAY);
  });

  it('never returns 0 or more than one period', () => {
    expect(paris(at(17, 0), HOUR)).toBe(HOUR);
    expect(paris(at(17, 0) + 1, HOUR)).toBe(HOUR - 1);
  });
});

describe('rescheduleFromSettings', () => {
  it('dedupes on unchanged minutes, reschedules on change, and stopScheduler clears both globals', () => {
    rescheduleFromSettings();
    const timer1 = globalThis.__speedtestScheduler?.timer;
    expect(timer1).toBeDefined();

    // Same minutes - no-op, same timer reference.
    rescheduleFromSettings();
    expect(globalThis.__speedtestScheduler?.timer).toBe(timer1);

    // Minutes changed - old timer cleared, new one installed.
    minutes = 30;
    rescheduleFromSettings();
    const timer2 = globalThis.__speedtestScheduler?.timer;
    expect(timer2).not.toBe(timer1);
    expect(globalThis.__speedtestScheduler?.minutes).toBe(30);

    // Set up a purge timer to ensure stopScheduler clears it.
    globalThis.__speedtestPurge = setInterval(() => {}, 60_000);

    stopScheduler();
    expect(globalThis.__speedtestScheduler).toBeUndefined();
    expect(globalThis.__speedtestPurge).toBeUndefined();
  });
});
