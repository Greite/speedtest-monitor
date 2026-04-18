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

const { PATCH, DELETE } = await import('./route');
const { createUser, countAdmins, findUserById } = await import('@/lib/auth/users');

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

const pathReq = (id: number, body: unknown) =>
  new Request(`http://x/api/users/${id}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });

describe('/api/users/[id]', () => {
  it('PATCH role updates', async () => {
    const admin = createUser({
      email: 'a@x.y',
      passwordHash: 'h',
      role: 'admin',
      provider: 'local',
    });
    const u = createUser({ email: 'b@x.y', passwordHash: 'h', role: 'viewer', provider: 'local' });
    const res = await PATCH(pathReq(u.id, { role: 'admin' }), {
      params: Promise.resolve({ id: String(u.id) }),
    });
    expect(res.status).toBe(200);
    expect(findUserById(u.id)?.role).toBe('admin');
    void admin;
  });

  it('PATCH blocks last-admin demote', async () => {
    const admin = createUser({
      email: 'a@x.y',
      passwordHash: 'h',
      role: 'admin',
      provider: 'local',
    });
    const res = await PATCH(pathReq(admin.id, { role: 'viewer' }), {
      params: Promise.resolve({ id: String(admin.id) }),
    });
    expect(res.status).toBe(409);
    expect(countAdmins()).toBe(1);
  });

  it('DELETE blocks last admin', async () => {
    const admin = createUser({
      email: 'a@x.y',
      passwordHash: 'h',
      role: 'admin',
      provider: 'local',
    });
    const res = await DELETE(new Request(`http://x/api/users/${admin.id}`, { method: 'DELETE' }), {
      params: Promise.resolve({ id: String(admin.id) }),
    });
    expect(res.status).toBe(409);
  });

  it('DELETE removes a non-last-admin user', async () => {
    createUser({ email: 'a@x.y', passwordHash: 'h', role: 'admin', provider: 'local' });
    const u = createUser({ email: 'b@x.y', passwordHash: 'h', role: 'viewer', provider: 'local' });
    const res = await DELETE(new Request(`http://x/api/users/${u.id}`, { method: 'DELETE' }), {
      params: Promise.resolve({ id: String(u.id) }),
    });
    expect(res.status).toBe(204);
    expect(findUserById(u.id)).toBeUndefined();
  });
});
