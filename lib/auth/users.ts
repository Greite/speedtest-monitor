import { randomUUID } from 'node:crypto';

import { and, eq, ne, sql } from 'drizzle-orm';

import { getDb } from '../db/client';
import { account, type NewUser, session, type User, user } from '../db/schema';

export type PublicUser = {
  id: string;
  email: string;
  role: User['role'];
  provider: User['provider'];
  name: string;
  createdAt: number;
  lastLoginAt: number | null;
};

export function toPublicUser(u: User): PublicUser {
  return {
    id: u.id,
    email: u.email,
    role: u.role,
    provider: u.provider,
    name: u.name,
    createdAt: u.createdAt.getTime(),
    lastLoginAt: u.lastLoginAt ? u.lastLoginAt.getTime() : null,
  };
}

function lower(email: string): string {
  return email.toLowerCase().trim();
}

export function countUsers(): number {
  const row = getDb().select({ n: sql<number>`count(*)` }).from(user).get();
  return row?.n ?? 0;
}

export function countAdmins(): number {
  const row = getDb().select({ n: sql<number>`count(*)` }).from(user).where(eq(user.role, 'admin')).get();
  return row?.n ?? 0;
}

export function findUserByEmail(email: string): User | undefined {
  const db = getDb();
  return db
    .select()
    .from(user)
    .where(eq(user.email, lower(email)))
    .get();
}

export function findUserByOidcSubject(sub: string): User | undefined {
  const db = getDb();
  return db.select().from(user).where(eq(user.oidcSubject, sub)).get();
}

export function findUserById(id: string): User | undefined {
  const db = getDb();
  return db.select().from(user).where(eq(user.id, id)).get();
}

export function listUsers(): User[] {
  const db = getDb();
  return db.select().from(user).all();
}

export function createUser(
  input: Omit<NewUser, 'id' | 'createdAt' | 'updatedAt' | 'lastLoginAt' | 'email'> & { email: string },
): User {
  const db = getDb();
  const id = randomUUID();
  return db
    .insert(user)
    .values({
      id,
      name: input.name ?? '',
      email: lower(input.email),
      emailVerified: input.emailVerified ?? false,
      image: input.image,
      role: input.role,
      provider: input.provider,
      oidcSubject: input.oidcSubject,
    })
    .returning()
    .get();
}

export function updateUser(id: string, patch: Partial<Omit<NewUser, 'id' | 'createdAt'>>): User | undefined {
  const db = getDb();
  const normalized = 'email' in patch && patch.email ? { ...patch, email: lower(patch.email) } : patch;
  return db
    .update(user)
    .set({ ...normalized, updatedAt: new Date() })
    .where(eq(user.id, id))
    .returning()
    .get();
}

export function deleteUser(id: string): void {
  const db = getDb();
  db.delete(user).where(eq(user.id, id)).run();
}

// Sessions must die when credentials change (CWE-613): a stolen session must
// not survive a password reset. Pass `exceptSessionId` to keep the caller's
// own session alive; omitted or undefined revokes everything (fail-secure).
export function revokeUserSessions(userId: string, opts?: { exceptSessionId?: string }): void {
  const db = getDb();
  const where = opts?.exceptSessionId
    ? and(eq(session.userId, userId), ne(session.id, opts.exceptSessionId))
    : eq(session.userId, userId);
  db.delete(session).where(where).run();
}

// Credential account helpers - Better Auth stores password hashes on
// `account` rows where providerId = 'credential'.

export function getCredentialPasswordHash(userId: string): string | null {
  const db = getDb();
  const row = db
    .select()
    .from(account)
    .where(and(eq(account.userId, userId), eq(account.providerId, 'credential')))
    .get();
  return row?.password ?? null;
}

export function setCredentialPassword(userId: string, passwordHash: string): void {
  const db = getDb();
  const existing = db
    .select()
    .from(account)
    .where(and(eq(account.userId, userId), eq(account.providerId, 'credential')))
    .get();
  if (existing) {
    db.update(account).set({ password: passwordHash, updatedAt: new Date() }).where(eq(account.id, existing.id)).run();
    return;
  }
  db.insert(account)
    .values({
      id: randomUUID(),
      accountId: userId,
      providerId: 'credential',
      userId,
      password: passwordHash,
    })
    .run();
}
