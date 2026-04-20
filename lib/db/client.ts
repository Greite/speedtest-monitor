import type { Database } from 'bun:sqlite';
import { mkdirSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname } from 'node:path';
import type { drizzle } from 'drizzle-orm/bun-sqlite';
import * as schema from './schema';

declare global {
  // eslint-disable-next-line no-var
  var __speedtestDb: { sqlite: Database; db: ReturnType<typeof drizzle> } | undefined;
}

function getDbPath(): string {
  return process.env.SPEEDTEST_DB_PATH ?? './speedtest.db';
}

// bun:sqlite + drizzle/bun-sqlite are Bun-only modules. Next 16 (Turbopack)
// spins up Node workers at build time to collect page data; those workers
// cannot resolve bun:sqlite. We defer the require to the first getDb() call
// — which never fires during `next build` because all DB-touching routes are
// `dynamic = 'force-dynamic'`. The `new Function` wrapper hides the specifier
// from Turbopack's static module-graph tracer so no build-time resolution
// happens; `createRequire` provides the CJS require in this ESM module
// (package.json sets "type": "module").
const cjsRequire = createRequire(import.meta.url);
const lazyRequire = new Function('r', 's', 'return r(s)') as <T>(r: NodeJS.Require, s: string) => T;

function openDatabase() {
  const { Database: BunDatabase } = lazyRequire<{ Database: typeof Database }>(
    cjsRequire,
    'bun:sqlite',
  );
  const { drizzle: bunDrizzle } = lazyRequire<{ drizzle: typeof drizzle }>(
    cjsRequire,
    'drizzle-orm/bun-sqlite',
  );

  const path = getDbPath();
  mkdirSync(dirname(path), { recursive: true });
  const sqlite = new BunDatabase(path, { create: true });
  sqlite.exec('PRAGMA journal_mode = WAL');
  sqlite.exec('PRAGMA foreign_keys = ON');
  sqlite.exec('PRAGMA synchronous = NORMAL');
  const db = bunDrizzle(sqlite, { schema });
  return { sqlite, db };
}

export function getDb() {
  if (!globalThis.__speedtestDb) {
    globalThis.__speedtestDb = openDatabase();
  }
  return globalThis.__speedtestDb.db;
}

export function closeDb() {
  if (globalThis.__speedtestDb) {
    globalThis.__speedtestDb.sqlite.close();
    globalThis.__speedtestDb = undefined;
  }
}

export function pingDb(): { ok: true } | { ok: false; error: string } {
  try {
    getDb();
    const row = globalThis.__speedtestDb?.sqlite.prepare('SELECT 1 AS ok').get() as
      | { ok: number }
      | undefined;
    if (row?.ok === 1) return { ok: true };
    return { ok: false, error: 'unexpected ping result' };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : String(err) };
  }
}

export { schema };
