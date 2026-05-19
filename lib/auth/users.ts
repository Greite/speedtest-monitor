import { randomUUID } from 'node:crypto';

import { and, eq } from 'drizzle-orm';

import { getDb } from '../db/client';
import { account, type NewUser, type User, user } from '../db/schema';

function lower(email: string): string {
  return email.toLowerCase().trim();
}

export function countUsers(): number {
  const db = getDb();
  return db.select().from(user).all().length;
}

export function countAdmins(): number {
  const db = getDb();
  return db.select().from(user).where(eq(user.role, 'admin')).all().length;
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

export function updateLastLogin(id: string): void {
  const db = getDb();
  db.update(user).set({ lastLoginAt: new Date() }).where(eq(user.id, id)).run();
}

export function deleteUser(id: string): void {
  const db = getDb();
  db.delete(user).where(eq(user.id, id)).run();
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
