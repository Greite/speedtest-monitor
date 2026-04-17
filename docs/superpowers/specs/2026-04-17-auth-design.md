# Authentication & Authorization — Design Spec

Date: 2026-04-17
Status: approved — ready for implementation plan

## Goal

Add local + OIDC authentication to fastcom-monitor with two roles (admin, viewer), protecting the entire UI and API. Make the app safe to expose beyond the LAN and compatible with homelab SSO stacks (Authelia, Authentik, Keycloak).

## Scope

In-scope (v1):
- Local auth: email + password, argon2id hashing
- OIDC auth via a single configurable provider (generic OIDC)
- Two roles: `admin` (full control) and `viewer` (read-only — GET only)
- Three bootstrap paths for the first admin: env seed, `/setup` wizard, OIDC admin-email claim
- Admin-managed user list: add / change role / reset password / delete
- Self-service password change for the signed-in user
- Global Next.js middleware that enforces auth + role on every route
- JWT session cookies (stateless, via next-auth v5)

Out of scope (v2+):
- Password reset via email (admin can reset for now)
- Magic-link login
- Multiple OIDC providers
- Fine-grained permissions beyond admin/viewer
- Public read-only dashboard (explicit authenticated visitors only for v1)
- Audit log of user actions (only `lastLoginAt` tracked)
- Rate limiting on login (delegated to reverse proxy)
- Server-side JWT revocation (logout works via cookie delete; forced kill-switch v2)
- User invites via email
- 2FA / TOTP

## Roles

| Role | GET on any API/page | Mutations (POST/PATCH/DELETE) | `/api/alerts/test` | Users management |
|---|---|---|---|---|
| `admin` | yes | yes | yes | yes |
| `viewer` | yes | **no** (403) | **no** | **no** (route hidden/403) |

`viewer` cannot trigger a manual measurement (`POST /api/measurements/run`) — the scheduler continues to produce measurements automatically. This is intentional: keeping the rule "GET for viewer, everything for admin" simple.

## Architecture

```
lib/auth/
  config.ts       loadAuthConfig() — zod-validated env for OIDC + seed + AUTH_SECRET
  hash.ts         hashPassword() / verifyPassword() / needsRehash() via @node-rs/argon2
  users.ts        User CRUD helpers (findByEmail, findByOidcSubject, create,
                  updateUser, updateLastLogin, deleteUser, countUsers, countAdmins)
  bootstrap.ts    ensureSeededAdmin() — idempotent env-seed runner
  providers.ts    Next-auth providers array (Credentials always, OIDC conditional)
  handler.ts      NextAuth({...}) setup, exports `auth`, `signIn`, `signOut`, `handlers`
  authorize.ts    requireSession() / requireAdmin() for route handlers

middleware.ts     (root) — matcher + rules enforcing auth + role on every non-public route

app/api/auth/[...nextauth]/route.ts   re-exports next-auth handlers
app/api/auth/setup/route.ts           first-admin wizard endpoint
app/api/account/password/route.ts     self password change
app/api/users/route.ts                GET list / POST create
app/api/users/[id]/route.ts           PATCH (role, name) / DELETE
app/api/users/[id]/reset-password/route.ts   POST — admin resets someone else's password

app/login/page.tsx      Credentials form + OIDC button if configured
app/setup/page.tsx      First-run admin wizard (only accessible when countUsers()===0)
components/auth/
  login-form.tsx, setup-form.tsx, user-menu.tsx, password-change-card.tsx
components/users/
  users-card.tsx, add-user-dialog.tsx, reset-password-dialog.tsx
```

Integration with existing code:
- `lib/scheduler/index.ts::bootScheduler()` gains one call to `ensureSeededAdmin()` right after `runMigrations()`.
- Existing API handlers (`app/api/settings`, `app/api/alerts/*`, `app/api/measurements/*`) remain untouched. The middleware enforces all rules uniformly.
- `app/layout.tsx` wraps children in a next-auth `SessionProvider` and renders a header with the user menu.
- `components/settings/alerts-card.tsx` and `components/settings/settings-form.tsx` inspect `useSession().data.user.role` and disable controls for viewer. A "Read-only mode" alert is shown at the top of `/settings` for viewer.

## Data model

New table `users`:

```ts
export const users = sqliteTable('users', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  email: text('email').notNull().unique(),
  passwordHash: text('password_hash'),
  role: text('role', { enum: ['admin', 'viewer'] }).notNull().default('viewer'),
  provider: text('provider', { enum: ['local', 'oidc'] }).notNull().default('local'),
  oidcSubject: text('oidc_subject').unique(),
  name: text('name'),
  createdAt: integer('created_at', { mode: 'timestamp_ms' })
    .notNull()
    .default(sql`(unixepoch() * 1000)`),
  lastLoginAt: integer('last_login_at', { mode: 'timestamp_ms' }),
});

export type User = typeof users.$inferSelect;
export type UserRole = 'admin' | 'viewer';
```

Decisions:
- `email` is lowercased and trimmed on every insert/lookup
- `passwordHash` is null for OIDC-only users; a local user that later signs in via OIDC keeps both
- `oidcSubject` is stored on the first OIDC sign-in so reauth is tolerant of email changes at the IdP
- `provider` is informational only (displayed as a badge in the admin Users table)
- New users default to `viewer`
- No `sessions` / `verification_tokens` tables — JWT cookies are authoritative

Retention: users are never purged by the daily retention cron.

## Bootstrap paths (first admin)

Three paths, all supported simultaneously. The most recent write wins (`ensureSeededAdmin` runs once at boot and is idempotent; wizard runs once when 0 users exist; OIDC promotion applies at login-time).

### Env seed (boot)

```
FASTCOM_ADMIN_EMAIL=admin@example.com
FASTCOM_ADMIN_PASSWORD=<cleartext, single-use at boot>
```

`ensureSeededAdmin()`:
1. If either var is unset, no-op.
2. If no user with that email exists, create `{email, passwordHash, role: 'admin', provider: 'local'}`.
3. If a user exists, upsert: set `role='admin'` and rehash the password if `needsRehash(existingHash, envPassword)` returns true.

Idempotent and safe to run every boot.

### Setup wizard

`/setup` is a public page that:
- Renders the first-admin form when `countUsers() === 0`
- Returns 404 (via middleware + handler double-check) when any user exists

The form posts to `POST /api/auth/setup` which:
- Re-verifies `countUsers() === 0` (race-safe via a transaction with unique-email constraint)
- Creates the admin user and issues a session (`signIn('credentials', {...})` server-side)
- Redirects to `/`

### OIDC admin claim

When a user signs in via OIDC and their email matches `FASTCOM_OIDC_ADMIN_EMAIL` (case-insensitive, trimmed), the profile callback sets their role to `admin` on first sign-in, or promotes them on subsequent sign-ins if they are currently `viewer`.

## Authentication providers

**Credentials** (always enabled):

```ts
Credentials({
  name: 'Email + password',
  credentials: { email: {}, password: {} },
  async authorize(creds) {
    const email = String(creds?.email ?? '').toLowerCase().trim();
    const password = String(creds?.password ?? '');
    if (!email || !password) return null;
    const user = findUserByEmail(email);
    if (!user?.passwordHash) return null;
    if (!(await verifyPassword(user.passwordHash, password))) return null;
    updateLastLogin(user.id);
    return { id: String(user.id), email: user.email, name: user.name ?? undefined, role: user.role };
  },
})
```

**OIDC** (enabled iff `FASTCOM_OIDC_ISSUER` is set):

```ts
{
  id: 'oidc',
  name: process.env.FASTCOM_OIDC_DISPLAY_NAME ?? 'SSO',
  type: 'oidc',
  issuer: process.env.FASTCOM_OIDC_ISSUER!,
  clientId: process.env.FASTCOM_OIDC_CLIENT_ID!,
  clientSecret: process.env.FASTCOM_OIDC_CLIENT_SECRET!,
  authorization: { params: { scope: 'openid email profile' } },
  async profile(claims) {
    const email = String(claims.email).toLowerCase().trim();
    const sub = String(claims.sub);
    const adminEmail = process.env.FASTCOM_OIDC_ADMIN_EMAIL?.toLowerCase().trim();
    const allowNew = process.env.FASTCOM_OIDC_ALLOW_NEW_USERS !== 'false';
    let user = findUserByOidcSubject(sub) ?? findUserByEmail(email);
    if (!user) {
      if (!allowNew) throw new Error('OIDC_USER_NOT_ALLOWED');
      user = createUser({
        email,
        name: typeof claims.name === 'string' ? claims.name : null,
        provider: 'oidc',
        oidcSubject: sub,
        role: email === adminEmail ? 'admin' : 'viewer',
      });
    } else {
      const updates: Partial<User> = { oidcSubject: sub };
      if (email === adminEmail && user.role !== 'admin') updates.role = 'admin';
      updateUser(user.id, updates);
      user = findUserById(user.id)!;
    }
    updateLastLogin(user.id);
    return { id: String(user.id), email: user.email, name: user.name ?? undefined, role: user.role };
  },
}
```

Session enrichment (next-auth v5 callbacks):

```ts
callbacks: {
  async jwt({ token, user }) {
    if (user) { token.role = (user as { role: UserRole }).role; }
    return token;
  },
  async session({ session, token }) {
    if (session.user && token.role) {
      (session.user as { role?: UserRole }).role = token.role as UserRole;
    }
    return session;
  },
}
```

## Middleware

Single `middleware.ts` at repo root. Runtime: `nodejs` (required to call `countUsers()` which hits better-sqlite3).

Rules, in order:
1. Public: `/api/auth/*`, `/_next/*`, `/favicon.ico`, static icons — pass.
2. `/setup` and `/api/auth/setup`: pass iff `countUsers() === 0`; otherwise 404.
3. No session → if API path, `401 {error: 'unauthorized'}`; else redirect to `/login?callbackUrl=<pathname>`.
4. Session exists, but `role !== 'admin'` AND (`method !== 'GET'/'HEAD'` OR path starts with `/api/users` OR path === `/api/alerts/test`): if API, `403 {error: 'forbidden'}`; else redirect to `/`.
5. Otherwise pass.

`countUsers()` in the middleware is cheap (indexed primary-key aggregate) and runs only on `/setup`/`/api/auth/setup` requests.

## New API routes

| Method | Path | Auth | Body | Returns |
|---|---|---|---|---|
| POST | `/api/auth/setup` | public iff `countUsers()===0` | `{email, password}` | 204 + session cookie |
| POST | `/api/account/password` | signed-in | `{currentPassword, newPassword}` | `{ok: true}` |
| GET | `/api/users` | admin | — | `{users: User[]}` (no `passwordHash`) |
| POST | `/api/users` | admin | `{email, password, role?}` | `{user: User}` (no `passwordHash`) |
| PATCH | `/api/users/:id` | admin | `{role?, name?}` | `{user: User}` |
| POST | `/api/users/:id/reset-password` | admin | `{newPassword}` | `{ok: true}` |
| DELETE | `/api/users/:id` | admin | — | 204 |

Server-side invariants enforced in handlers beyond the middleware:
- Email uniqueness: returned as `409 Conflict` on insert.
- Password length: min 10 (zod), max 1024.
- Last-admin protection: `PATCH /api/users/:id` that would leave `countAdmins()===0` returns `409 Conflict {error: 'last admin'}`. Same for `DELETE`.
- `POST /api/users` defaults `role` to `viewer`.
- `POST /api/account/password` verifies the supplied `currentPassword` before updating.
- All email inputs are lowercased + trimmed.

## UI

**New pages**: `/login`, `/setup`.

**Login** — credentials form (email + password) plus a secondary "Sign in with `<FASTCOM_OIDC_DISPLAY_NAME>`" button rendered only if OIDC is configured. The `callbackUrl` query param is preserved. Invalid credentials show an inline error; rate-limiting is delegated to the reverse proxy.

**Setup wizard** — email + password + confirm-password (min 10 chars, client-side parity check). POSTs to `/api/auth/setup`. On success the response sets the session cookie and the client redirects to `/`.

**Header** (rendered in `app/layout.tsx` once signed in):
- Title + navigation links
- User menu (email, role badge, "Change password" anchor, "Logout" action)

**Settings page** gains two cards:
- `PasswordChangeCard` (always visible to signed-in user) — current + new + confirm, posts to `/api/account/password`.
- `UsersCard` (admin only) — list with actions: Add User, Change Role (select), Reset Password, Delete. Disabled buttons with tooltip when acting on the last admin.

**Viewer read-only UX**:
- Existing settings cards (SettingsForm, AlertsCard) inspect `session.user.role` and disable all inputs + action buttons when `viewer`.
- A sticky banner `<Alert>` at the top of `/settings` reads "Read-only mode — you do not have permission to change settings".

## Environment variables

All optional except `AUTH_SECRET`.

```
# Required
AUTH_SECRET                    # `openssl rand -base64 32`

# Reverse-proxy setup
AUTH_URL                       # optional, e.g. https://fastcom.example.com
AUTH_TRUST_HOST                # "true" when behind Traefik/Caddy/Nginx

# First-admin env seed
FASTCOM_ADMIN_EMAIL
FASTCOM_ADMIN_PASSWORD

# OIDC
FASTCOM_OIDC_ISSUER
FASTCOM_OIDC_CLIENT_ID
FASTCOM_OIDC_CLIENT_SECRET
FASTCOM_OIDC_DISPLAY_NAME      # default "SSO"
FASTCOM_OIDC_ADMIN_EMAIL
FASTCOM_OIDC_ALLOW_NEW_USERS   # default "true", set "false" to require admin-created records
```

`loadAuthConfig()` parses the above with zod and logs a single warning (not an error) if OIDC vars are partially set (e.g. issuer without client secret); in that case OIDC is silently disabled.

## Testing

Colocated `.test.ts`, vitest. Pure modules first, then handlers.

| File | Coverage |
|---|---|
| `lib/auth/hash.test.ts` | `hashPassword` non-empty argon2id string, roundtrip verify true, verify false on wrong, `needsRehash` detects upgrades |
| `lib/auth/users.test.ts` | email lowercasing, findByEmail/findByOidcSubject, create/update/delete, countAdmins, last-admin check used by invariants |
| `lib/auth/bootstrap.test.ts` | no-op without env, creates admin, upserts role+rehash on existing email, lowercases email |
| `lib/auth/providers.test.ts` | Credentials: reject empty/bad password, accept good; OIDC profile: create with viewer role when no admin match, create with admin role on match, existing user gets `sub` linked, `allowNew=false` throws |
| `app/api/auth/setup/route.test.ts` | accepts if 0 users, 404 if any user exists, rejects short password, creates admin + issues session |
| `app/api/account/password/route.test.ts` | requires current match, rejects short new password, updates hash |
| `app/api/users/route.test.ts` | GET omits `passwordHash`, POST validates zod + rejects dup email (409), defaults role to viewer |
| `app/api/users/[id]/route.test.ts` | PATCH role success, DELETE success, last-admin protection returns 409 on PATCH role change and DELETE |
| `app/api/users/[id]/reset-password/route.test.ts` | admin resets target user's password, short password rejected |
| `lib/auth/middleware.test.ts` (or split) | public paths pass, unauth API → 401, unauth page → /login redirect, viewer POST → 403, admin POST → pass, `/setup` gated by countUsers |

## Migration and dependencies

Drizzle migration:
1. Add `users` table in `lib/db/schema.ts`
2. `bunx drizzle-kit generate` → `drizzle/NNNN_users.sql`
3. `runMigrations()` applies at boot; `ensureSeededAdmin()` runs immediately after.

New dependencies:
- `next-auth@^5` — Auth.js v5 (Next 16 App-Router compatible)
- `@node-rs/argon2@^2` — argon2id native bindings with prebuilt binaries for linux-x64 + linux-arm64

Both added to `package.json` `dependencies` and to the `bun add` list in the `runtime-deps` stage of `Dockerfile`.

Backwards compat:
- Schema change is additive (`users` table only); no changes to `measurements`, `settings`, `alerts`.
- **Breaking UX**: after upgrade, all `/api/*` calls require auth. Scripts/curl commands that worked anonymously will 401. This is the point of the feature.
- First-run UX: if the upgrade deployment does not set `FASTCOM_ADMIN_EMAIL`/`FASTCOM_ADMIN_PASSWORD` and does not visit `/setup`, the app remains inaccessible beyond `/setup` itself. Documented prominently in README.
- `AUTH_SECRET` **must** be set before the app boots. Missing `AUTH_SECRET` is a fatal boot error (loud, early, clear message pointing to README).

Rollback: `DROP TABLE users; rm middleware.ts; git revert <commits>;` returns the app to its previous public state.

## README additions

A new `## Authentication` section covering:
- Required + optional env vars
- First-run (env-seed vs wizard)
- Example OIDC configs for Authelia / Authentik / Keycloak
- Roles: admin vs viewer
- Upgrade guide: "Set `AUTH_SECRET` before upgrading. Either visit `/setup` on first run or pre-seed the admin with `FASTCOM_ADMIN_EMAIL` + `FASTCOM_ADMIN_PASSWORD`."

## Open questions

None at design time. All major axes resolved during brainstorming.

## Deliverable summary

```
lib/auth/
  types.ts (user role types + aug module for next-auth types)
  config.ts, hash.ts, users.ts, bootstrap.ts, providers.ts,
  handler.ts, authorize.ts
  *.test.ts
middleware.ts
app/api/auth/[...nextauth]/route.ts
app/api/auth/setup/route.ts
app/api/account/password/route.ts
app/api/users/route.ts
app/api/users/[id]/route.ts
app/api/users/[id]/reset-password/route.ts
app/login/page.tsx
app/setup/page.tsx
app/layout.tsx                                (modified — SessionProvider + header)
app/settings/page.tsx                         (modified — conditional cards + read-only banner)
components/auth/login-form.tsx, setup-form.tsx, user-menu.tsx, password-change-card.tsx
components/users/users-card.tsx, add-user-dialog.tsx, reset-password-dialog.tsx
components/settings/alerts-card.tsx           (modified — disable controls for viewer)
components/settings/settings-form.tsx         (modified — idem)
lib/db/schema.ts                              (+ users table)
lib/scheduler/index.ts                        (+ ensureSeededAdmin call)
drizzle/NNNN_users.sql
Dockerfile                                    (+ next-auth, @node-rs/argon2 runtime-deps)
package.json                                  (+ deps)
README.md                                     (+ Authentication section)
```
