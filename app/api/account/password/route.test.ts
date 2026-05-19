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
const { createUser, findUserByEmail, getCredentialPasswordHash, setCredentialPassword } = await import(
  '@/lib/auth/users'
);
const { hashPassword, verifyPassword } = await import('@/lib/auth/hash');

beforeEach(async () => {
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
  const u = createUser({ email: 'me@x', provider: 'local', role: 'viewer' });
  setCredentialPassword(u.id, await hashPassword('oldpassword1'));
  getSession.mockResolvedValue({ user: { id: u.id, email: u.email, role: u.role } });
});

const body = (j: unknown) =>
  new Request('http://x/api/account/password', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(j),
  });

describe('POST /api/account/password', () => {
  it('requires current password match', async () => {
    const res = await POST(body({ currentPassword: 'wrong', newPassword: 'hunter2hunter2' }));
    expect(res.status).toBe(400);
  });

  it('updates on valid current password', async () => {
    const res = await POST(body({ currentPassword: 'oldpassword1', newPassword: 'hunter2hunter2' }));
    expect(res.status).toBe(200);
    const row = findUserByEmail('me@x')!;
    const hash = getCredentialPasswordHash(row.id);
    expect(hash).not.toBeNull();
    expect(await verifyPassword(hash!, 'hunter2hunter2')).toBe(true);
  });

  it('rejects short new password', async () => {
    const res = await POST(body({ currentPassword: 'oldpassword1', newPassword: 'short' }));
    expect(res.status).toBe(400);
  });
});
