import { Database } from 'bun:sqlite';
import { afterEach, beforeEach, describe, expect, it } from 'bun:test';
import { drizzle } from 'drizzle-orm/bun-sqlite';
import * as schema from '../db/schema';
import { hashPassword } from './hash';
import { buildProviders, oidcProfile } from './providers';
import { createUser, findUserByEmail } from './users';

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
  delete process.env.FASTCOM_OIDC_ISSUER;
  delete process.env.FASTCOM_OIDC_CLIENT_ID;
  delete process.env.FASTCOM_OIDC_CLIENT_SECRET;
  delete process.env.FASTCOM_OIDC_ADMIN_EMAIL;
  delete process.env.FASTCOM_OIDC_ALLOW_NEW_USERS;
});
afterEach(() => {
  delete process.env.AUTH_SECRET;
});

describe('auth/providers buildProviders', () => {
  it('contains only credentials when OIDC unset', () => {
    const p = buildProviders();
    expect(p).toHaveLength(1);
  });

  it('contains credentials + oidc when OIDC env is set', () => {
    process.env.FASTCOM_OIDC_ISSUER = 'https://idp';
    process.env.FASTCOM_OIDC_CLIENT_ID = 'cid';
    process.env.FASTCOM_OIDC_CLIENT_SECRET = 'csec';
    expect(buildProviders()).toHaveLength(2);
  });
});

describe('auth/providers oidcProfile', () => {
  it('creates a viewer user when unknown + allowNew=true', async () => {
    const u = await oidcProfile({
      claims: { email: 'A@B.c', sub: 'sub-1', name: 'Alice' },
      adminEmail: null,
      allowNewUsers: true,
    });
    expect(u.role).toBe('viewer');
    expect(findUserByEmail('a@b.c')?.oidcSubject).toBe('sub-1');
  });

  it('creates admin when email matches adminEmail', async () => {
    const u = await oidcProfile({
      claims: { email: 'admin@x', sub: 'sub-2' },
      adminEmail: 'admin@x',
      allowNewUsers: true,
    });
    expect(u.role).toBe('admin');
  });

  it('throws when unknown email and allowNew=false', async () => {
    await expect(
      oidcProfile({
        claims: { email: 'new@x', sub: 's' },
        adminEmail: null,
        allowNewUsers: false,
      }),
    ).rejects.toThrow(/OIDC_USER_NOT_ALLOWED/);
  });

  it('links sub to a pre-existing local user and promotes if adminEmail matches', async () => {
    createUser({
      email: 'exist@x',
      passwordHash: await hashPassword('x'),
      role: 'viewer',
      provider: 'local',
    });
    const u = await oidcProfile({
      claims: { email: 'exist@x', sub: 'sub-link' },
      adminEmail: 'exist@x',
      allowNewUsers: true,
    });
    expect(u.role).toBe('admin');
    const row = findUserByEmail('exist@x');
    expect(row?.oidcSubject).toBe('sub-link');
  });
});
