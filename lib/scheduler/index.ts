import cron, { type ScheduledTask } from 'node-cron';

import { ensureSeededAdmin } from '../auth/bootstrap';
import { migrateLegacyAuth } from '../auth/migrate-legacy';
import { runMigrations } from '../db/migrate';
import { runMeasurementSafe } from '../measurement/runner';
import { purgeByRetention } from '../measurements';
import { getIntervalMinutes, getRetentionDays } from '../settings';

declare global {
  var __speedtestScheduler: { task: ScheduledTask; expr: string } | undefined;
  var __speedtestPurge: ScheduledTask | undefined;
}

const PURGE_CRON = '0 3 * * *';

export function cronExprForMinutes(minutes: number): string {
  if (minutes >= 60 && minutes % 60 === 0) {
    const hours = minutes / 60;
    if (hours >= 24 && hours % 24 === 0) {
      return `0 0 */${hours / 24} * *`;
    }
    return `0 */${hours} * * *`;
  }
  return `*/${minutes} * * * *`;
}

export async function bootScheduler() {
  runMigrations();
  migrateLegacyAuth();
  await ensureSeededAdmin();
  rescheduleFromSettings();
  startPurgeCron();
}

export function rescheduleFromSettings() {
  const minutes = getIntervalMinutes();
  const expr = cronExprForMinutes(minutes);
  if (globalThis.__speedtestScheduler?.expr === expr) {
    return;
  }
  globalThis.__speedtestScheduler?.task.stop();
  const task = cron.schedule(expr, () => {
    runMeasurementSafe().catch((_err) => {});
  });
  globalThis.__speedtestScheduler = { task, expr };
}

function startPurgeCron() {
  if (globalThis.__speedtestPurge) {
    return;
  }
  const task = cron.schedule(PURGE_CRON, () => {
    try {
      const days = getRetentionDays();
      const deleted = purgeByRetention(days);
      if (deleted > 0) {
      }
    } catch (_err) {}
  });
  globalThis.__speedtestPurge = task;
}

export function stopScheduler() {
  globalThis.__speedtestScheduler?.task.stop();
  globalThis.__speedtestScheduler = undefined;
  globalThis.__speedtestPurge?.stop();
  globalThis.__speedtestPurge = undefined;
}
