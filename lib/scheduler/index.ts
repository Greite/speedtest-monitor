import cron, { type ScheduledTask } from 'node-cron';
import { runMigrations } from '../db/migrate';
import { runMeasurementSafe } from '../fastcli/runner';
import { getIntervalMinutes } from '../settings';

declare global {
  // eslint-disable-next-line no-var
  var __fastcomScheduler: { task: ScheduledTask; expr: string } | undefined;
}

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

export function stopScheduler() {
  globalThis.__fastcomScheduler?.task.stop();
  globalThis.__fastcomScheduler = undefined;
}
