import { Database } from 'bun:sqlite';
import { beforeEach, describe, expect, it } from 'bun:test';
import { drizzle } from 'drizzle-orm/bun-sqlite';
import * as schema from '../db/schema';
import { ensureSeededAdmin } from './bootstrap';
import { verifyPassword } from './hash';
import { findUserByEmail } from './users';

beforeEach(() => {
  const sqlite = new Database(':memory:');
  const db = drizzle(sqlite, { schema });
  sqlite.exec(`
    CREATE TABLE users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      email TEXT NOT NULL UNIQUE,
      password_hash TEXT,
      role TEXT NOT NULL DEFAULT 'viewer',
      provider TEXT NOT NULL DEFAULT 'local',
      oidc_subject TEXT UNIQUE,
      name TEXT,
      created_at INTEGER NOT NULL DEFAULT (unixepoch() * 1000),
      last_login_at INTEGER
    );
  `);
  globalThis.__fastcomDb = { sqlite, db };
  delete process.env.FASTCOM_ADMIN_EMAIL;
  delete process.env.FASTCOM_ADMIN_PASSWORD;
  process.env.AUTH_SECRET = 'test';
});

describe('ensureSeededAdmin', () => {
  it('no-op without env', async () => {
    await ensureSeededAdmin();
    expect(findUserByEmail('a@x')).toBeUndefined();
  });

  it('creates the admin with hashed password', async () => {
    process.env.FASTCOM_ADMIN_EMAIL = 'A@B.c';
    process.env.FASTCOM_ADMIN_PASSWORD = 'hunter2hunter2';
    await ensureSeededAdmin();
    const u = findUserByEmail('a@b.c');
    expect(u?.role).toBe('admin');
    expect(await verifyPassword(u!.passwordHash!, 'hunter2hunter2')).toBe(true);
  });

  it('upserts role to admin and keeps a valid hash when already exists', async () => {
    process.env.FASTCOM_ADMIN_EMAIL = 'a@x';
    process.env.FASTCOM_ADMIN_PASSWORD = 'hunter2hunter2';
    await ensureSeededAdmin();
    const before = findUserByEmail('a@x');
    // Demote by hand, then re-run: should promote back to admin.
    const { updateUser } = await import('./users');
    updateUser(before!.id, { role: 'viewer' });
    await ensureSeededAdmin();
    expect(findUserByEmail('a@x')?.role).toBe('admin');
  });
});
