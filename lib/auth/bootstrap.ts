import { and, eq, isNull } from 'drizzle-orm';

import { getDb } from '../db/client';
import { account } from '../db/schema';
import { loadAuthConfig } from './config';
import { hashPassword, verifyPassword } from './hash';
import { createUser, findUserByEmail, getCredentialPasswordHash, setCredentialPassword, updateUser } from './users';

// Better Auth 1.7 looks accounts up by (issuer, accountId); rows written by
// older versions have no issuer and are invisible to sign-in.
// ponytail: the OIDC issuer is assumed to equal the configured one minus the
// trailing slash (what the discovery document must return per spec). If a
// provider violates that, set SPEEDTEST_OIDC_ISSUER to the discovered value.
export function backfillAccountIssuers(): void {
  const db = getDb();
  db.update(account)
    .set({ issuer: 'local:credential' })
    .where(and(isNull(account.issuer), eq(account.providerId, 'credential')))
    .run();
  let oidcIssuer: string | undefined;
  try {
    oidcIssuer = loadAuthConfig().oidc?.issuer.replace(/\/+$/, '');
  } catch {
    return; // Missing AUTH_SECRET - surfaced elsewhere.
  }
  if (oidcIssuer) {
    db.update(account)
      .set({ issuer: oidcIssuer })
      .where(and(isNull(account.issuer), eq(account.providerId, 'oidc')))
      .run();
  }
}

export async function ensureSeededAdmin(): Promise<void> {
  let cfg: ReturnType<typeof loadAuthConfig>;
  try {
    cfg = loadAuthConfig();
  } catch {
    // Missing AUTH_SECRET - surfaced elsewhere; the seed step is best-effort.
    return;
  }
  const seed = cfg.seed;
  if (!seed) {
    return;
  }

  const existing = findUserByEmail(seed.email);
  if (!existing) {
    const created = createUser({
      email: seed.email,
      name: '',
      emailVerified: true,
      role: 'admin',
      provider: 'local',
    });
    setCredentialPassword(created.id, await hashPassword(seed.password));
    return;
  }

  const currentHash = getCredentialPasswordHash(existing.id);
  const stillValid = currentHash ? await verifyPassword(currentHash, seed.password) : false;
  if (existing.role !== 'admin') {
    updateUser(existing.id, { role: 'admin' });
  }
  if (!stillValid) {
    setCredentialPassword(existing.id, await hashPassword(seed.password));
  }
}
