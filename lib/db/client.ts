import { Database } from 'bun:sqlite';
import { mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import { drizzle } from 'drizzle-orm/bun-sqlite';
import * as schema from './schema';

declare global {
  // eslint-disable-next-line no-var
  var __speedtestDb: { sqlite: Database; db: ReturnType<typeof drizzle> } | undefined;
}

function getDbPath(): string {
  return process.env.SPEEDTEST_DB_PATH ?? './speedtest.db';
}

function openDatabase() {
  const path = getDbPath();
  mkdirSync(dirname(path), { recursive: true });
  const sqlite = new Database(path, { create: true });
  sqlite.exec('PRAGMA journal_mode = WAL');
  sqlite.exec('PRAGMA foreign_keys = ON');
  sqlite.exec('PRAGMA synchronous = NORMAL');
  const db = drizzle(sqlite, { schema });
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

export { schema };
