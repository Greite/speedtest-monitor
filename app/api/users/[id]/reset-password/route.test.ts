import { Database } from 'bun:sqlite';
import { beforeEach, describe, expect, it, mock } from 'bun:test';
import { drizzle } from 'drizzle-orm/bun-sqlite';
import * as schema from '@/lib/db/schema';

const authMock = mock();
mock.module('@/lib/auth/handler', () => ({
  auth: authMock,
  signIn: mock(),
  signOut: mock(),
  handlers: { GET: mock(), POST: mock() },
}));

const { POST } = await import('./route');
const { createUser, findUserById } = await import('@/lib/auth/users');
const { verifyPassword } = await import('@/lib/auth/hash');

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

describe('POST /api/users/:id/reset-password', () => {
  it('admin resets target password', async () => {
    const u = createUser({
      email: 'b@x.y',
      passwordHash: 'old',
      role: 'viewer',
      provider: 'local',
    });
    const res = await POST(
      new Request(`http://x/api/users/${u.id}/reset-password`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ newPassword: 'hunter2hunter2' }),
      }),
      { params: Promise.resolve({ id: String(u.id) }) },
    );
    expect(res.status).toBe(200);
    const row = findUserById(u.id)!;
    expect(await verifyPassword(row.passwordHash!, 'hunter2hunter2')).toBe(true);
  });

  it('rejects short password', async () => {
    const u = createUser({
      email: 'b@x.y',
      passwordHash: 'old',
      role: 'viewer',
      provider: 'local',
    });
    const res = await POST(
      new Request(`http://x/api/users/${u.id}/reset-password`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ newPassword: 'short' }),
      }),
      { params: Promise.resolve({ id: String(u.id) }) },
    );
    expect(res.status).toBe(400);
  });
});
