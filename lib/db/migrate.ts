import { createRequire } from 'node:module';
import type { migrate as migrateFn } from 'drizzle-orm/bun-sqlite/migrator';
import { getDb } from './client';

// See comment in client.ts: hide the Bun-only specifier from static analysis
// so Next's Node build workers don't try to resolve it during page data
// collection. Deferred to runMigrations() so the require only runs at boot.
const cjsRequire = createRequire(import.meta.url);
const lazyRequire = new Function('r', 's', 'return r(s)') as <T>(
  r: NodeJS.Require,
  s: string,
) => T;

export function runMigrations() {
  const db = getDb();
  const { migrate } = lazyRequire<{ migrate: typeof migrateFn }>(
    cjsRequire,
    'drizzle-orm/bun-sqlite/migrator',
  );
  migrate(db, { migrationsFolder: './drizzle' });
}
