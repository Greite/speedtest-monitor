import { eq } from 'drizzle-orm';
import { getDb } from '../db/client';
import { type NewUser, type User, users } from '../db/schema';

function lower(email: string): string {
  return email.toLowerCase().trim();
}

export function countUsers(): number {
  const db = getDb();
  return db.select().from(users).all().length;
}

export function countAdmins(): number {
  const db = getDb();
  return db.select().from(users).where(eq(users.role, 'admin')).all().length;
}

export function findUserByEmail(email: string): User | undefined {
  const db = getDb();
  return db
    .select()
    .from(users)
    .where(eq(users.email, lower(email)))
    .get();
}

export function findUserByOidcSubject(sub: string): User | undefined {
  const db = getDb();
  return db.select().from(users).where(eq(users.oidcSubject, sub)).get();
}

export function findUserById(id: number): User | undefined {
  const db = getDb();
  return db.select().from(users).where(eq(users.id, id)).get();
}

export function listUsers(): User[] {
  const db = getDb();
  return db.select().from(users).all();
}

export function createUser(
  input: Omit<NewUser, 'id' | 'createdAt' | 'lastLoginAt' | 'email'> & { email: string },
): User {
  const db = getDb();
  return db
    .insert(users)
    .values({ ...input, email: lower(input.email) })
    .returning()
    .get();
}

export function updateUser(
  id: number,
  patch: Partial<Omit<NewUser, 'id' | 'createdAt'>>,
): User | undefined {
  const db = getDb();
  const normalized =
    'email' in patch && patch.email ? { ...patch, email: lower(patch.email) } : patch;
  const changed = db.update(users).set(normalized).where(eq(users.id, id)).returning().get();
  return changed;
}

export function updateLastLogin(id: number): void {
  const db = getDb();
  db.update(users).set({ lastLoginAt: new Date() }).where(eq(users.id, id)).run();
}

export function deleteUser(id: number): void {
  const db = getDb();
  db.delete(users).where(eq(users.id, id)).run();
}
