import { eq } from 'drizzle-orm';
import { z } from 'zod';
import { getDb } from '../db/client';
import { settings } from '../db/schema';
import { type AlertRules, DEFAULT_RULES } from './types';

const KEY = 'alertRules';

const rulesSchema = z.object({
  enabled: z.boolean().default(false),
  thresholds: z
    .object({
      downloadMbps: z.number().positive().nullable().default(null),
      uploadMbps: z.number().positive().nullable().default(null),
      latencyMs: z.number().positive().nullable().default(null),
      bufferBloatMs: z.number().positive().nullable().default(null),
    })
    .default(DEFAULT_RULES.thresholds),
  failureStreak: z.number().int().positive().nullable().default(null),
  destinations: z
    .object({
      webhook: z.boolean().default(false),
      ntfy: z.boolean().default(false),
      discord: z.boolean().default(false),
      slack: z.boolean().default(false),
      smtp: z.boolean().default(false),
    })
    .default(DEFAULT_RULES.destinations),
});

export function getAlertRules(): AlertRules {
  const db = getDb();
  const row = db.select().from(settings).where(eq(settings.key, KEY)).get();
  if (!row) return DEFAULT_RULES;
  try {
    return rulesSchema.parse(JSON.parse(row.value));
  } catch {
    return DEFAULT_RULES;
  }
}

export function setAlertRules(partial: Partial<AlertRules>): AlertRules {
  const current = getAlertRules();
  const next = rulesSchema.parse({
    ...current,
    ...partial,
    thresholds: { ...current.thresholds, ...(partial.thresholds ?? {}) },
    destinations: { ...current.destinations, ...(partial.destinations ?? {}) },
  });
  const db = getDb();
  db.insert(settings)
    .values({ key: KEY, value: JSON.stringify(next), updatedAt: new Date() })
    .onConflictDoUpdate({
      target: settings.key,
      set: { value: JSON.stringify(next), updatedAt: new Date() },
    })
    .run();
  return next;
}
