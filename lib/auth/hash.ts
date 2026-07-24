// Password hashing via Bun's native `Bun.password` API (argon2id).
// OWASP 2024 baseline parameters. Existing hashes produced by any standard
// argon2id implementation (including the previous `@node-rs/argon2`
// integration) verify without configuration.

const OPTS = {
  algorithm: 'argon2id' as const,
  memoryCost: 19456, // KiB (~19 MiB)
  timeCost: 2,
};

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

// Better Auth's email-password adapter passes `{ password, hash }` to its
// custom verify hook. Thin adapter over verifyPassword.
export async function verifyPasswordPair(data: { password: string; hash: string }): Promise<boolean> {
  return verifyPassword(data.hash, data.password);
}
