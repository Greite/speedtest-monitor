import { randomUUID } from 'node:crypto';

import { eq } from 'drizzle-orm';

import { getDb } from '../db/client';
import { account, legacyUsers, user } from '../db/schema';

export type LegacyMigrationResult = {
  migrated: number;
  skipped: number;
};

// Copies rows from the pre-Better-Auth `users` table into `user` + `account`.
// Safe to run repeatedly: existing emails in `user` are skipped. The legacy
// table is left in place so this can be re-run if needed; drop it in a later
// migration once you have confirmed the new tables are healthy.
export function migrateLegacyAuth(): LegacyMigrationResult {
  const db = getDb();
  let rows: ReturnType<typeof db.select> extends never ? never : Array<typeof legacyUsers.$inferSelect>;
  try {
    rows = db.select().from(legacyUsers).all();
  } catch {
    return { migrated: 0, skipped: 0 };
  }

  let migrated = 0;
  let skipped = 0;
  for (const row of rows) {
    const existing = db.select().from(user).where(eq(user.email, row.email)).get();
    if (existing) {
      skipped++;
      continue;
    }
    const id = randomUUID();
    db.insert(user)
      .values({
        id,
        name: row.name ?? '',
        email: row.email,
        emailVerified: row.provider === 'oidc',
        role: row.role,
        provider: row.provider,
        oidcSubject: row.oidcSubject,
        lastLoginAt: row.lastLoginAt,
        createdAt: row.createdAt,
        updatedAt: row.createdAt,
      })
      .run();
    if (row.passwordHash) {
      db.insert(account)
        .values({
          id: randomUUID(),
          accountId: id,
          providerId: 'credential',
          userId: id,
          password: row.passwordHash,
        })
        .run();
    }
    if (row.oidcSubject) {
      db.insert(account)
        .values({
          id: randomUUID(),
          accountId: row.oidcSubject,
          providerId: 'oidc',
          userId: id,
        })
        .run();
    }
    migrated++;
  }
  return { migrated, skipped };
}
