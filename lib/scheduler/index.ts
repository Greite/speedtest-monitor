import cron, { type ScheduledTask } from 'node-cron';
import { runMigrations } from '../db/migrate';
import { runMeasurementSafe } from '../fastcli/runner';
import { purgeByRetention } from '../measurements';
import { getIntervalMinutes, getRetentionDays } from '../settings';

declare global {
  // eslint-disable-next-line no-var
  var __fastcomScheduler: { task: ScheduledTask; expr: string } | undefined;
  // eslint-disable-next-line no-var
  var __fastcomPurge: ScheduledTask | undefined;
}

const PURGE_CRON = '0 3 * * *';

export function cronExprForMinutes(minutes: number): string {
  if (minutes >= 60 && minutes % 60 === 0) {
    const hours = minutes / 60;
    if (hours >= 24 && hours % 24 === 0) return `0 0 */${hours / 24} * *`;
    return `0 */${hours} * * *`;
  }
  return `*/${minutes} * * * *`;
}

export async function bootScheduler() {
  runMigrations();
  rescheduleFromSettings();
  startPurgeCron();
}

export function rescheduleFromSettings() {
  const minutes = getIntervalMinutes();
  const expr = cronExprForMinutes(minutes);
  if (globalThis.__fastcomScheduler?.expr === expr) {
    console.log(`[scheduler] already scheduled with ${expr} (${minutes}m)`);
    return;
  }
  globalThis.__fastcomScheduler?.task.stop();
  const task = cron.schedule(expr, () => {
    runMeasurementSafe().catch((err) => console.error('[scheduler] run failed', err));
  });
  globalThis.__fastcomScheduler = { task, expr };
  console.log(`[scheduler] scheduled "${expr}" (every ${minutes}m)`);
}

function startPurgeCron() {
  if (globalThis.__fastcomPurge) return;
  const task = cron.schedule(PURGE_CRON, () => {
    try {
      const days = getRetentionDays();
      const deleted = purgeByRetention(days);
      if (deleted > 0) {
        console.log(`[scheduler] purged ${deleted} measurements older than ${days}d`);
      }
    } catch (err) {
      console.error('[scheduler] purge failed', err);
    }
  });
  globalThis.__fastcomPurge = task;
  console.log(`[scheduler] purge cron "${PURGE_CRON}" (daily 03:00)`);
}

export function stopScheduler() {
  globalThis.__fastcomScheduler?.task.stop();
  globalThis.__fastcomScheduler = undefined;
  globalThis.__fastcomPurge?.stop();
  globalThis.__fastcomPurge = undefined;
}
