import Database from 'better-sqlite3';
import { drizzle } from 'drizzle-orm/better-sqlite3';
import { beforeEach, describe, expect, it } from 'vitest';
import * as schema from '../db/schema';
import {
  countAdmins,
  countUsers,
  createUser,
  deleteUser,
  findUserByEmail,
  findUserById,
  findUserByOidcSubject,
  listUsers,
  updateLastLogin,
  updateUser,
} from './users';

let sqlite: Database.Database;
beforeEach(() => {
  sqlite = new Database(':memory:');
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
});

describe('auth/users', () => {
  it('countUsers is 0 initially', () => {
    expect(countUsers()).toBe(0);
  });

  it('createUser lowercases email on insert, findUserByEmail lowercases on lookup', () => {
    createUser({ email: 'A@B.c', passwordHash: 'h', role: 'admin', provider: 'local' });
    expect(findUserByEmail('a@b.C')?.email).toBe('a@b.c');
  });

  it('countAdmins reflects role column', () => {
    createUser({ email: 'a@x', passwordHash: 'h', role: 'admin', provider: 'local' });
    createUser({ email: 'b@x', passwordHash: 'h', role: 'viewer', provider: 'local' });
    expect(countAdmins()).toBe(1);
  });

  it('updateUser patches fields, updateLastLogin sets timestamp', () => {
    const u = createUser({ email: 'a@x', passwordHash: 'h', role: 'viewer', provider: 'local' });
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
    const u = createUser({ email: 'a@x', passwordHash: 'h', role: 'viewer', provider: 'local' });
    deleteUser(u.id);
    expect(findUserById(u.id)).toBeUndefined();
  });

  it('listUsers returns all', () => {
    createUser({ email: 'a@x', provider: 'local', role: 'viewer' });
    createUser({ email: 'b@x', provider: 'local', role: 'admin' });
    expect(listUsers()).toHaveLength(2);
  });
});
