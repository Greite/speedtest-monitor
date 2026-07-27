import { ensureSeededAdmin } from '../auth/bootstrap';
import { runMigrations } from '../db/migrate';
import { runMeasurementSafe } from '../measurement/runner';
import { purgeByRetention } from '../measurements';
import { resolveDisplayConfig } from '../runtime-config';
import { getIntervalMinutes, getRetentionDays } from '../settings';

declare global {
  var __speedtestScheduler: { timer: ReturnType<typeof setInterval>; minutes: number } | undefined;
  var __speedtestPurge: ReturnType<typeof setInterval> | undefined;
  var __speedtestReschedule: (() => void) | undefined;
}

const DAY_MS = 24 * 60 * 60 * 1000;
const PURGE_HOUR_MS = 3 * 60 * 60 * 1000;

export async function bootScheduler() {
  runMigrations();
  await ensureSeededAdmin();
  rescheduleFromSettings();
  startPurgeTimer();
  globalThis.__speedtestReschedule = rescheduleFromSettings;
}

// Ticks are laid out from midnight in the app's display timezone (plus offsetMs),
// so a 90 min interval lands on 00:00 / 01:30 / 03:00 as shown in the dashboard
// rather than drifting off the UTC epoch.
// ponytail: the grid is only recomputed on reschedule, so a DST shift skews it
// by an hour until the next restart. Bring back a cron lib if that matters.
export function alignedDelay(
  nowMs: number,
  periodMs: number,
  offsetMs = 0,
  timeZone: string = resolveDisplayConfig().timeZone,
): number {
  const [h, m, s] = new Intl.DateTimeFormat('en-US', {
    timeZone,
    hourCycle: 'h23',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  })
    .format(nowMs)
    .split(':')
    .map(Number);
  const sinceMidnight = ((h * 60 + m) * 60 + s) * 1000 + (nowMs % 1000);
  const intoPeriod = (((sinceMidnight - offsetMs) % periodMs) + periodMs) % periodMs;
  return periodMs - intoPeriod;
}

export function rescheduleFromSettings() {
  const minutes = getIntervalMinutes();
  if (globalThis.__speedtestScheduler?.minutes === minutes) {
    return;
  }
  if (globalThis.__speedtestScheduler) {
    clearInterval(globalThis.__speedtestScheduler.timer);
  }
  const periodMs = minutes * 60_000;
  const run = () => {
    runMeasurementSafe().catch(() => {});
  };
  // Delay the first tick to the next clock boundary, then run on a plain
  // interval - setInterval alone would drift from whenever the app booted.
  const timer = setTimeout(
    () => {
      run();
      globalThis.__speedtestScheduler = { timer: setInterval(run, periodMs), minutes };
    },
    alignedDelay(Date.now(), periodMs),
  );
  globalThis.__speedtestScheduler = { timer, minutes };
}

function startPurgeTimer() {
  if (globalThis.__speedtestPurge) {
    return;
  }
  const purge = () => {
    try {
      purgeByRetention(getRetentionDays());
    } catch {}
  };
  // Run once at boot (covers deployments that restart more often than daily),
  // then daily at 03:00 in the app timezone.
  purge();
  globalThis.__speedtestPurge = setTimeout(
    () => {
      purge();
      globalThis.__speedtestPurge = setInterval(purge, DAY_MS);
    },
    alignedDelay(Date.now(), DAY_MS, PURGE_HOUR_MS),
  );
}

export function stopScheduler() {
  if (globalThis.__speedtestScheduler) {
    clearInterval(globalThis.__speedtestScheduler.timer);
  }
  globalThis.__speedtestScheduler = undefined;
  if (globalThis.__speedtestPurge) {
    clearInterval(globalThis.__speedtestPurge);
  }
  globalThis.__speedtestPurge = undefined;
  globalThis.__speedtestReschedule = undefined;
}
