import Database from 'better-sqlite3';
import { drizzle } from 'drizzle-orm/better-sqlite3';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import * as schema from '@/lib/db/schema';

vi.mock('@/lib/auth/handler', () => ({
  signIn: vi.fn().mockResolvedValue(undefined),
  auth: vi.fn(),
  handlers: { GET: vi.fn(), POST: vi.fn() },
  signOut: vi.fn(),
}));

const { POST } = await import('./route');

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
  process.env.AUTH_SECRET = 'test';
});

const body = (j: unknown) =>
  new Request('http://x/api/auth/setup', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(j),
  });

describe('POST /api/auth/setup', () => {
  it('creates the first admin and signs in', async () => {
    const res = await POST(body({ email: 'a@b.c', password: 'hunter2hunter2' }));
    expect(res.status).toBe(204);
    const { countAdmins } = await import('@/lib/auth/users');
    expect(countAdmins()).toBe(1);
  });

  it('returns 404 once any user exists', async () => {
    const { createUser } = await import('@/lib/auth/users');
    createUser({ email: 'pre@x', provider: 'local', role: 'viewer' });
    const res = await POST(body({ email: 'a@b.c', password: 'hunter2hunter2' }));
    expect(res.status).toBe(404);
  });

  it('rejects short password', async () => {
    const res = await POST(body({ email: 'a@b.c', password: 'short' }));
    expect(res.status).toBe(400);
  });
});
