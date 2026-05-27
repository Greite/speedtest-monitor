import type { migrate as migrateFn } from 'drizzle-orm/bun-sqlite/migrator';

import { getDb } from './client';
import { lazyRequire } from './lazy-require';

export function runMigrations() {
  const { migrate } = lazyRequire<{ migrate: typeof migrateFn }>('drizzle-orm/bun-sqlite/migrator');
  migrate(getDb(), { migrationsFolder: './drizzle' });
}
