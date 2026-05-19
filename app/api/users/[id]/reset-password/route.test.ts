import { Database } from 'bun:sqlite';
import { beforeEach, describe, expect, it, mock } from 'bun:test';

import { drizzle } from 'drizzle-orm/bun-sqlite';

import * as schema from '@/lib/db/schema';

mock.module('next/headers', () => ({
  headers: () => Promise.resolve(new Headers()),
}));

const getSession = mock();
mock.module('@/lib/auth/handler', () => ({
  auth: { api: { getSession } },
}));

const { POST } = await import('./route');
const { createUser, getCredentialPasswordHash } = await import('@/lib/auth/users');
const { verifyPassword } = await import('@/lib/auth/hash');

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
  getSession.mockResolvedValue({ user: { id: 'admin-id', email: 'admin@x.y', role: 'admin' } });
});

describe('POST /api/users/:id/reset-password', () => {
  it('admin resets target password', async () => {
    const u = createUser({ email: 'b@x.y', role: 'viewer', provider: 'local' });
    const res = await POST(
      new Request(`http://x/api/users/${u.id}/reset-password`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ newPassword: 'hunter2hunter2' }),
      }),
      { params: Promise.resolve({ id: u.id }) },
    );
    expect(res.status).toBe(200);
    const hash = getCredentialPasswordHash(u.id);
    expect(hash).not.toBeNull();
    expect(await verifyPassword(hash!, 'hunter2hunter2')).toBe(true);
  });

  it('rejects short password', async () => {
    const u = createUser({ email: 'b@x.y', role: 'viewer', provider: 'local' });
    const res = await POST(
      new Request(`http://x/api/users/${u.id}/reset-password`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ newPassword: 'short' }),
      }),
      { params: Promise.resolve({ id: u.id }) },
    );
    expect(res.status).toBe(400);
  });
});
