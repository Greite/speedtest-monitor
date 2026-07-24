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

const { rescheduleFromSettings, stopScheduler } = await import('./index');

afterEach(() => {
  stopScheduler();
  minutes = 15;
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
