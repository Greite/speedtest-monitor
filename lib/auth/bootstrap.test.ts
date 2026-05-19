import { Database } from 'bun:sqlite';
import { beforeEach, describe, expect, it } from 'bun:test';

import { drizzle } from 'drizzle-orm/bun-sqlite';

import * as schema from '../db/schema';
import { ensureSeededAdmin } from './bootstrap';
import { verifyPassword } from './hash';
import { findUserByEmail, getCredentialPasswordHash } from './users';

beforeEach(() => {
  const sqlite = new Database(':memory:');
  const db = drizzle(sqlite, { schema });
  sqlite.exec(`
    CREATE TABLE user (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL DEFAULT '',
      email TEXT NOT NULL UNIQUE,
      email_verified INTEGER NOT NULL DEFAULT 0,
      image TEXT,
      created_at INTEGER NOT NULL DEFAULT (unixepoch() * 1000),
      updated_at INTEGER NOT NULL DEFAULT (unixepoch() * 1000),
      role TEXT NOT NULL DEFAULT 'viewer',
      provider TEXT NOT NULL DEFAULT 'local',
      oidc_subject TEXT UNIQUE,
      last_login_at INTEGER
    );
    CREATE TABLE account (
      id TEXT PRIMARY KEY,
      account_id TEXT NOT NULL,
      provider_id TEXT NOT NULL,
      user_id TEXT NOT NULL,
      access_token TEXT,
      refresh_token TEXT,
      id_token TEXT,
      access_token_expires_at INTEGER,
      refresh_token_expires_at INTEGER,
      scope TEXT,
      password TEXT,
      created_at INTEGER NOT NULL DEFAULT (unixepoch() * 1000),
      updated_at INTEGER NOT NULL DEFAULT (unixepoch() * 1000)
    );
  `);
  globalThis.__speedtestDb = { sqlite, db };
  delete process.env.SPEEDTEST_ADMIN_EMAIL;
  delete process.env.SPEEDTEST_ADMIN_PASSWORD;
  process.env.AUTH_SECRET = 'test';
});

describe('ensureSeededAdmin', () => {
  it('no-op without env', async () => {
    await ensureSeededAdmin();
    expect(findUserByEmail('a@x')).toBeUndefined();
  });

  it('creates the admin with hashed password', async () => {
    process.env.SPEEDTEST_ADMIN_EMAIL = 'A@B.c';
    process.env.SPEEDTEST_ADMIN_PASSWORD = 'hunter2hunter2';
    await ensureSeededAdmin();
    const u = findUserByEmail('a@b.c');
    expect(u?.role).toBe('admin');
    const hash = getCredentialPasswordHash(u!.id);
    expect(hash).not.toBeNull();
    expect(await verifyPassword(hash!, 'hunter2hunter2')).toBe(true);
  });

  it('upserts role to admin and keeps a valid hash when already exists', async () => {
    process.env.SPEEDTEST_ADMIN_EMAIL = 'a@x';
    process.env.SPEEDTEST_ADMIN_PASSWORD = 'hunter2hunter2';
    await ensureSeededAdmin();
    const before = findUserByEmail('a@x');
    const { updateUser } = await import('./users');
    updateUser(before!.id, { role: 'viewer' });
    await ensureSeededAdmin();
    expect(findUserByEmail('a@x')?.role).toBe('admin');
  });
});
