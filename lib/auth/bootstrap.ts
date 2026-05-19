import { loadAuthConfig } from './config';
import { hashPassword, verifyPassword } from './hash';
import { createUser, findUserByEmail, getCredentialPasswordHash, setCredentialPassword, updateUser } from './users';

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
