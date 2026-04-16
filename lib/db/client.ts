import { mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import Database from 'better-sqlite3';
import { drizzle } from 'drizzle-orm/better-sqlite3';
import * as schema from './schema';

declare global {
  // eslint-disable-next-line no-var
  var __fastcomDb: { sqlite: Database.Database; db: ReturnType<typeof drizzle> } | undefined;
}

function getDbPath(): string {
  return process.env.FASTCOM_DB_PATH ?? './fastcom.db';
}

function openDatabase() {
  const path = getDbPath();
  mkdirSync(dirname(path), { recursive: true });
  const sqlite = new Database(path);
  sqlite.pragma('journal_mode = WAL');
  sqlite.pragma('foreign_keys = ON');
  sqlite.pragma('synchronous = NORMAL');
  const db = drizzle(sqlite, { schema });
  return { sqlite, db };
}

export function getDb() {
  if (!globalThis.__fastcomDb) {
    globalThis.__fastcomDb = openDatabase();
  }
  return globalThis.__fastcomDb.db;
}

export function closeDb() {
  if (globalThis.__fastcomDb) {
    globalThis.__fastcomDb.sqlite.close();
    globalThis.__fastcomDb = undefined;
  }
}

export { schema };
