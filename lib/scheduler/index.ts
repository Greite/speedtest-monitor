import { ensureSeededAdmin } from '../auth/bootstrap';
import { runMigrations } from '../db/migrate';
import { runMeasurementSafe } from '../measurement/runner';
import { purgeByRetention } from '../measurements';
import { getIntervalMinutes, getRetentionDays } from '../settings';

declare global {
  var __speedtestScheduler: { timer: ReturnType<typeof setInterval>; minutes: number } | undefined;
  var __speedtestPurge: ReturnType<typeof setInterval> | undefined;
  var __speedtestReschedule: (() => void) | undefined;
}

const DAY_MS = 24 * 60 * 60 * 1000;

export async function bootScheduler() {
  runMigrations();
  await ensureSeededAdmin();
  rescheduleFromSettings();
  startPurgeTimer();
  globalThis.__speedtestReschedule = rescheduleFromSettings;
}

// ponytail: setInterval, no wall-clock alignment (old cron ticked at :00/:15) —
// bring back a cron lib only if aligned ticks become a real need.
export function rescheduleFromSettings() {
  const minutes = getIntervalMinutes();
  if (globalThis.__speedtestScheduler?.minutes === minutes) {
    return;
  }
  if (globalThis.__speedtestScheduler) {
    clearInterval(globalThis.__speedtestScheduler.timer);
  }
  const timer = setInterval(() => {
    runMeasurementSafe().catch(() => {});
  }, minutes * 60_000);
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
  // then every 24h. Old behavior was daily at 03:00; exact hour never mattered.
  purge();
  globalThis.__speedtestPurge = setInterval(purge, DAY_MS);
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
