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

const { GET, POST } = await import('./route');

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

describe('/api/users', () => {
  it('GET returns rows', async () => {
    const { createUser, setCredentialPassword } = await import('@/lib/auth/users');
    const u = createUser({ email: 'a@x.y', role: 'viewer', provider: 'local' });
    setCredentialPassword(u.id, 'SECRET');
    const res = await GET();
    const body = await res.json();
    expect(body.users[0].email).toBe('a@x.y');
    expect('password' in body.users[0]).toBe(false);
  });

  it('POST creates a viewer by default', async () => {
    const req = new Request('http://x/api/users', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: 'new@x.y', password: 'hunter2hunter2' }),
    });
    const res = await POST(req);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.user.role).toBe('viewer');
    expect(typeof body.user.id).toBe('string');
  });

  it('POST returns 409 on duplicate email', async () => {
    const { createUser } = await import('@/lib/auth/users');
    createUser({ email: 'dup@x.y', role: 'viewer', provider: 'local' });
    const req = new Request('http://x/api/users', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: 'dup@x.y', password: 'hunter2hunter2' }),
    });
    const res = await POST(req);
    expect(res.status).toBe(409);
  });
});
