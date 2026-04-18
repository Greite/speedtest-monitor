// Password hashing via Bun's native `Bun.password` API (argon2id).
// OWASP 2024 baseline parameters. Existing hashes produced by any standard
// argon2id implementation (including the previous `@node-rs/argon2`
// integration) verify without configuration.

const OPTS = {
  algorithm: 'argon2id' as const,
  memoryCost: 19456, // KiB (~19 MiB)
  timeCost: 2,
};

// Parallelism is fixed at 1 by Bun.password (not configurable). We reference
// it here only for `needsRehash`, which must compare a stored hash's encoded
// params against what we now produce.
const PARALLELISM = 1;

export async function hashPassword(plain: string): Promise<string> {
  return Bun.password.hash(plain, OPTS);
}

export async function verifyPassword(hashed: string, plain: string): Promise<boolean> {
  // Note: Bun.password.verify is (password, hash) — opposite of
  // @node-rs/argon2's (hash, password). Our public signature keeps the
  // prior (hashed, plain) order to avoid churn at call sites.
  try {
    return await Bun.password.verify(plain, hashed);
  } catch {
    return false;
  }
}

/**
 * Returns true when the stored hash was produced with parameters weaker than
 * the current OPTS (i.e. it should be re-hashed on next successful login).
 * We parse the PHC-formatted string directly:
 *   `$argon2id$v=19$m=19456,t=2,p=1$salt$hash`
 */
export function needsRehash(hashed: string): boolean {
  try {
    const parts = hashed.split('$');
    // ["", "argon2id", "v=19", "m=19456,t=2,p=1", salt, hash]
    if (parts.length < 6) return true;
    if (parts[1] !== 'argon2id') return true;

    const params = new Map<string, number>();
    for (const kv of parts[3].split(',')) {
      const [k, v] = kv.split('=');
      const n = Number(v);
      if (!Number.isFinite(n)) return true;
      params.set(k, n);
    }

    const m = params.get('m');
    const t = params.get('t');
    const p = params.get('p');
    if (m === undefined || t === undefined || p === undefined) return true;

    if (m < OPTS.memoryCost) return true;
    if (t < OPTS.timeCost) return true;
    if (p !== PARALLELISM) return true;

    return false;
  } catch {
    return true;
  }
}
