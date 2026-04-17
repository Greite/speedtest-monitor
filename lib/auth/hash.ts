import * as argon2 from '@node-rs/argon2';

// argon2id with OWASP 2024-recommended parameters.
// `algorithm: 2` is the numeric value of Algorithm.Argon2id (the exported
// Algorithm enum is a `const enum`, which cannot be referenced with
// `isolatedModules` enabled).
const OPTS: argon2.Options = {
  algorithm: 2,
  memoryCost: 19456, // KiB (~19 MiB)
  timeCost: 2,
  parallelism: 1,
};

export async function hashPassword(plain: string): Promise<string> {
  return argon2.hash(plain, OPTS);
}

export async function verifyPassword(hashed: string, plain: string): Promise<boolean> {
  try {
    return await argon2.verify(hashed, plain);
  } catch {
    return false;
  }
}

/**
 * Returns true when the stored hash was produced with parameters weaker than
 * the current OPTS (i.e. it should be re-hashed on next successful login).
 * `@node-rs/argon2` does not export a `needsRehash` helper, so we parse the
 * PHC-formatted string directly: `$argon2id$v=19$m=19456,t=2,p=1$salt$hash`.
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

    if (m < (OPTS.memoryCost ?? 0)) return true;
    if (t < (OPTS.timeCost ?? 0)) return true;
    if (p !== (OPTS.parallelism ?? 1)) return true;

    return false;
  } catch {
    return true;
  }
}
