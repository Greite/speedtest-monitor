import { loadAuthConfig } from './config';
import { hashPassword, verifyPassword } from './hash';
import { createUser, findUserByEmail, updateUser } from './users';

export async function ensureSeededAdmin(): Promise<void> {
  let cfg: ReturnType<typeof loadAuthConfig>;
  try {
    cfg = loadAuthConfig();
  } catch {
    // Missing AUTH_SECRET - surfaced elsewhere; the seed step is best-effort.
    return;
  }
  const seed = cfg.seed;
  if (!seed) return;

  const existing = findUserByEmail(seed.email);
  if (!existing) {
    createUser({
      email: seed.email,
      passwordHash: await hashPassword(seed.password),
      role: 'admin',
      provider: 'local',
    });
    return;
  }

  const stillValid = existing.passwordHash
    ? await verifyPassword(existing.passwordHash, seed.password)
    : false;
  const patch: Parameters<typeof updateUser>[1] = {};
  if (existing.role !== 'admin') patch.role = 'admin';
  if (!stillValid) patch.passwordHash = await hashPassword(seed.password);
  if (Object.keys(patch).length > 0) updateUser(existing.id, patch);
}
