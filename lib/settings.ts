import { eq } from 'drizzle-orm';
import { getDb } from './db/client';
import { settings } from './db/schema';

const KEY_INTERVAL = 'interval_minutes';
const DEFAULT_INTERVAL = 15;
const MIN_INTERVAL = 1;
const MAX_INTERVAL = 1440;

const KEY_RETENTION = 'retention_days';
const DEFAULT_RETENTION = 90;
export const MIN_RETENTION_DAYS = 1;
export const MAX_RETENTION_DAYS = 3650;

function envIntervalMinutes(): number {
  const raw = process.env.FASTCOM_INTERVAL_MINUTES;
  if (!raw) return DEFAULT_INTERVAL;
  const n = Number.parseInt(raw, 10);
  if (Number.isNaN(n) || n < MIN_INTERVAL || n > MAX_INTERVAL) return DEFAULT_INTERVAL;
  return n;
}

function envRetentionDays(): number {
  const raw = process.env.FASTCOM_RETENTION_DAYS;
  if (!raw) return DEFAULT_RETENTION;
  const n = Number.parseInt(raw, 10);
  if (Number.isNaN(n) || n < MIN_RETENTION_DAYS || n > MAX_RETENTION_DAYS) return DEFAULT_RETENTION;
  return n;
}

export function getEnvDefaultIntervalMinutes(): number {
  return envIntervalMinutes();
}

export function getIntervalMinutes(): number {
  const db = getDb();
  const row = db.select().from(settings).where(eq(settings.key, KEY_INTERVAL)).get();
  if (!row) return envIntervalMinutes();
  const n = Number.parseInt(row.value, 10);
  if (Number.isNaN(n) || n < MIN_INTERVAL || n > MAX_INTERVAL) return envIntervalMinutes();
  return n;
}

export function setIntervalMinutes(minutes: number): number {
  if (!Number.isInteger(minutes) || minutes < MIN_INTERVAL || minutes > MAX_INTERVAL) {
    throw new Error(
      `intervalMinutes must be an integer between ${MIN_INTERVAL} and ${MAX_INTERVAL}`,
    );
  }
  const db = getDb();
  db.insert(settings)
    .values({ key: KEY_INTERVAL, value: String(minutes), updatedAt: new Date() })
    .onConflictDoUpdate({
      target: settings.key,
      set: { value: String(minutes), updatedAt: new Date() },
    })
    .run();
  return minutes;
}

export function getEnvDefaultRetentionDays(): number {
  return envRetentionDays();
}

export function getRetentionDays(): number {
  const db = getDb();
  const row = db.select().from(settings).where(eq(settings.key, KEY_RETENTION)).get();
  if (!row) return envRetentionDays();
  const n = Number.parseInt(row.value, 10);
  if (Number.isNaN(n) || n < MIN_RETENTION_DAYS || n > MAX_RETENTION_DAYS) {
    return envRetentionDays();
  }
  return n;
}

export function setRetentionDays(days: number): number {
  if (!Number.isInteger(days) || days < MIN_RETENTION_DAYS || days > MAX_RETENTION_DAYS) {
    throw new Error(
      `retentionDays must be an integer between ${MIN_RETENTION_DAYS} and ${MAX_RETENTION_DAYS}`,
    );
  }
  const db = getDb();
  db.insert(settings)
    .values({ key: KEY_RETENTION, value: String(days), updatedAt: new Date() })
    .onConflictDoUpdate({
      target: settings.key,
      set: { value: String(days), updatedAt: new Date() },
    })
    .run();
  return days;
}
