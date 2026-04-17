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

const { POST } = await import('./route');
const { createUser, findUserByEmail } = await import('@/lib/auth/users');
const { hashPassword, verifyPassword } = await import('@/lib/auth/hash');

beforeEach(async () => {
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
  const u = createUser({
    email: 'me@x',
    passwordHash: await hashPassword('oldpassword1'),
    provider: 'local',
    role: 'viewer',
  });
  authMock.mockResolvedValue({
    user: { id: String(u.id), email: u.email, role: u.role },
  });
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
    const res = await POST(
      body({ currentPassword: 'oldpassword1', newPassword: 'hunter2hunter2' }),
    );
    expect(res.status).toBe(200);
    const row = findUserByEmail('me@x')!;
    expect(await verifyPassword(row.passwordHash!, 'hunter2hunter2')).toBe(true);
  });

  it('rejects short new password', async () => {
    const res = await POST(
      body({ currentPassword: 'oldpassword1', newPassword: 'short' }),
    );
    expect(res.status).toBe(400);
  });
});
