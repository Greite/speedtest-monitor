import { Database } from 'bun:sqlite';
import { beforeEach, describe, expect, it } from 'bun:test';

import { drizzle } from 'drizzle-orm/bun-sqlite';

import * as schema from '../db/schema';
import {
  countAdmins,
  countUsers,
  createUser,
  deleteUser,
  findUserByEmail,
  findUserById,
  findUserByOidcSubject,
  getCredentialPasswordHash,
  listUsers,
  setCredentialPassword,
  updateLastLogin,
  updateUser,
} from './users';

let sqlite: Database;
beforeEach(() => {
  sqlite = new Database(':memory:');
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
});

describe('auth/users', () => {
  it('countUsers is 0 initially', () => {
    expect(countUsers()).toBe(0);
  });

  it('createUser lowercases email on insert, findUserByEmail lowercases on lookup', () => {
    createUser({ email: 'A@B.c', role: 'admin', provider: 'local' });
    expect(findUserByEmail('a@b.C')?.email).toBe('a@b.c');
  });

  it('countAdmins reflects role column', () => {
    createUser({ email: 'a@x', role: 'admin', provider: 'local' });
    createUser({ email: 'b@x', role: 'viewer', provider: 'local' });
    expect(countAdmins()).toBe(1);
  });

  it('updateUser patches fields, updateLastLogin sets timestamp', () => {
    const u = createUser({ email: 'a@x', role: 'viewer', provider: 'local' });
    updateUser(u.id, { role: 'admin', name: 'Alice' });
    const after = findUserById(u.id);
    expect(after?.role).toBe('admin');
    expect(after?.name).toBe('Alice');
    updateLastLogin(u.id);
    expect(findUserById(u.id)?.lastLoginAt).toBeInstanceOf(Date);
  });

  it('findUserByOidcSubject', () => {
    createUser({ email: 'a@x', provider: 'oidc', oidcSubject: 'sub-1', role: 'viewer' });
    expect(findUserByOidcSubject('sub-1')?.email).toBe('a@x');
  });

  it('deleteUser removes row', () => {
    const u = createUser({ email: 'a@x', role: 'viewer', provider: 'local' });
    deleteUser(u.id);
    expect(findUserById(u.id)).toBeUndefined();
  });

  it('listUsers returns all', () => {
    createUser({ email: 'a@x', provider: 'local', role: 'viewer' });
    createUser({ email: 'b@x', provider: 'local', role: 'admin' });
    expect(listUsers()).toHaveLength(2);
  });

  it('setCredentialPassword / getCredentialPasswordHash round-trip', () => {
    const u = createUser({ email: 'a@x', role: 'viewer', provider: 'local' });
    expect(getCredentialPasswordHash(u.id)).toBeNull();
    setCredentialPassword(u.id, 'hash-1');
    expect(getCredentialPasswordHash(u.id)).toBe('hash-1');
    setCredentialPassword(u.id, 'hash-2');
    expect(getCredentialPasswordHash(u.id)).toBe('hash-2');
  });
});
