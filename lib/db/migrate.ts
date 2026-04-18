import { migrate } from 'drizzle-orm/bun-sqlite/migrator';
import { getDb } from './client';

export function runMigrations() {
  const db = getDb();
  migrate(db, { migrationsFolder: './drizzle' });
}
