import Database from 'better-sqlite3';
import { drizzle } from 'drizzle-orm/better-sqlite3';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import * as schema from '@/lib/db/schema';

const authMock = vi.fn();
vi.mock('@/lib/auth/handler', () => ({
  auth: authMock,
  signIn: vi.fn(),
  signOut: vi.fn(),
  handlers: { GET: vi.fn(), POST: vi.fn() },
}));

const { GET, POST } = await import('./route');

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
  authMock.mockResolvedValue({ user: { id: '1', email: 'admin@x.y', role: 'admin' } });
});

describe('/api/users', () => {
  it('GET returns rows without passwordHash', async () => {
    const { createUser } = await import('@/lib/auth/users');
    createUser({ email: 'a@x.y', passwordHash: 'SECRET', role: 'viewer', provider: 'local' });
    const res = await GET();
    const body = await res.json();
    expect(body.users[0].email).toBe('a@x.y');
    expect('passwordHash' in body.users[0]).toBe(false);
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
    expect('passwordHash' in body.user).toBe(false);
  });

  it('POST returns 409 on duplicate email', async () => {
    const { createUser } = await import('@/lib/auth/users');
    createUser({ email: 'dup@x.y', passwordHash: 'h', role: 'viewer', provider: 'local' });
    const req = new Request('http://x/api/users', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: 'dup@x.y', password: 'hunter2hunter2' }),
    });
    const res = await POST(req);
    expect(res.status).toBe(409);
  });
});
