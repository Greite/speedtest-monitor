# Bun Runtime Migration - Phase 3 Design Spec

Date: 2026-04-18
Status: approved - ready for implementation

## Goal

Replace `@node-rs/argon2` with the native `Bun.password` API. One file
touched (`lib/auth/hash.ts`), one dep dropped, one native module gone
from the image. Existing password hashes in the DB keep verifying
unchanged.

## Scope

- `lib/auth/hash.ts`: internal impl swap. Public signatures of
  `hashPassword`, `verifyPassword`, `needsRehash` unchanged.
- `package.json`: `bun remove @node-rs/argon2`.
- `Dockerfile`: drop `@node-rs/argon2@^2` from the `runtime-deps`
  `bun add` list.
- `lib/auth/hash.test.ts`: optionally add a legacy-hash verification
  test (hash produced by @node-rs/argon2 pre-migration).
- `README.md` (optional): swap "password hashing: `@node-rs/argon2`" to
  "`Bun.password` (native argon2id)".

Out of scope:
- Changing argon2 parameters (keep `memoryCost: 19456, timeCost: 2`).
- Phase 2 (ws -> Bun.serve), explicitly skipped.

## Architecture

Bun.password exposes `hash(password, options)` and `verify(password, hash)`
as async wrappers around libsodium-compatible argon2id. PHC string format
is standard (`$argon2id$v=19$m=...,t=...,p=...$salt$hash`), verifiable by
any argon2id implementation.

Key API differences vs `@node-rs/argon2`:

| Concern | `@node-rs/argon2` | `Bun.password` |
|---|---|---|
| hash() signature | `hash(plain, opts)` | `hash(plain, opts)` |
| verify() signature | `verify(hash, plain)` | `verify(plain, hash)` |
| options.algorithm | numeric (2 for argon2id) | string (`'argon2id'`) |
| options.parallelism | supported | not configurable (default 1) |
| options.memoryCost | KiB | KiB |
| options.timeCost | iterations | iterations |

## Implementation

```ts
// lib/auth/hash.ts
const OPTS = {
  algorithm: 'argon2id' as const,
  memoryCost: 19456,
  timeCost: 2,
};

export async function hashPassword(plain: string): Promise<string> {
  return Bun.password.hash(plain, OPTS);
}

export async function verifyPassword(hash: string, plain: string): Promise<boolean> {
  try {
    return await Bun.password.verify(plain, hash);
  } catch {
    return false;
  }
}

// needsRehash() stays as-is: custom PHC parser that compares the hash's
// encoded m/t/p params to OPTS. Bun does not expose a native equivalent
// but our implementation handles it already.
```

## Backwards compat

Existing hashes in the `users.passwordHash` column (produced by
`@node-rs/argon2@2` during Phase 1 and earlier) are PHC-standard
argon2id strings. `Bun.password.verify` accepts them without
configuration. No migration or rotation needed.

Hashes newly produced by `Bun.password.hash(plain, OPTS)` use the same
parameters (m=19456, t=2, p=1) so `needsRehash` does not flag them,
keeping the login flow quiet after the swap.

## Dockerfile

`runtime-deps` stage `bun add` list:
- Remove: `@node-rs/argon2@^2`

No prebuild pruning / strip commands specific to `@node-rs/argon2`
exist in the Dockerfile (grep confirmed), so nothing else changes.

Expected effect:
- `~8 MB` drop in node_modules footprint.
- One less native module to worry about across arm64 / x64 prebuilds.
- Simpler rebuilds on Bun upgrades.

## Tests

Existing 5 tests in `lib/auth/hash.test.ts` cover the public API; they
pass unchanged because the public API is unchanged.

Optional addition: one test that verifies a hard-coded hash known to
have been produced by `@node-rs/argon2@2`, to guard against accidental
PHC parser drift. The hash is generated once locally by running the old
impl against `"fastcom-phase3-check"`.

## Rollback

`git revert` + `bun add @node-rs/argon2@^2` + restore Dockerfile line.
Existing hashes remain valid (same PHC format).

## Deliverable

```
lib/auth/hash.ts              (MODIFIED)
lib/auth/hash.test.ts         (MODIFIED - optional legacy hash test)
package.json                  (MODIFIED)
bun.lock                      (MODIFIED)
Dockerfile                    (MODIFIED - runtime-deps bun add list)
README.md                     (MODIFIED - optional stack swap)
```
