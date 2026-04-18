import { Database } from 'bun:sqlite';
import { beforeEach, describe, expect, it } from 'bun:test';
import { drizzle } from 'drizzle-orm/bun-sqlite';
import * as schema from '../db/schema';
import { getAlertRules, setAlertRules } from './rules';
import { DEFAULT_RULES } from './types';

beforeEach(() => {
  const sqlite = new Database(':memory:');
  const db = drizzle(sqlite, { schema });
  sqlite.exec(
    `CREATE TABLE settings (key TEXT PRIMARY KEY, value TEXT NOT NULL, updated_at INTEGER NOT NULL);`,
  );
  globalThis.__fastcomDb = { sqlite, db };
});

describe('alerts/rules', () => {
  it('returns DEFAULT_RULES when no row exists', () => {
    expect(getAlertRules()).toEqual(DEFAULT_RULES);
  });

  it('round-trips via setAlertRules', () => {
    const rules = {
      ...DEFAULT_RULES,
      enabled: true,
      thresholds: { ...DEFAULT_RULES.thresholds, downloadMbps: 100 },
      destinations: { ...DEFAULT_RULES.destinations, ntfy: true },
    };
    setAlertRules(rules);
    expect(getAlertRules()).toEqual(rules);
  });

  it('merges partial updates over defaults (missing fields get defaults)', () => {
    setAlertRules({ enabled: true } as never);
    const rules = getAlertRules();
    expect(rules.enabled).toBe(true);
    expect(rules.thresholds.downloadMbps).toBeNull();
  });
});
