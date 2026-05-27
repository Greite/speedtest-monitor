import { betterAuth } from 'better-auth';
import { drizzleAdapter } from 'better-auth/adapters/drizzle';
import { nextCookies } from 'better-auth/next-js';
import { genericOAuth } from 'better-auth/plugins';
import { eq } from 'drizzle-orm';

import { loadAuthConfig } from './config';
import { hashPassword, verifyPasswordPair } from './hash';
import { getTrustedOrigins } from './origins';

import { getDb } from '@/lib/db/client';
import { account, session, user, verification } from '@/lib/db/schema';

// Lazy construction: betterAuth() touches getDb() through the drizzle adapter,
// and getDb() loads bun:sqlite. Next 16's build-time page-data collection runs
// in a Node worker that cannot resolve bun:sqlite, so any eager top-level
// instantiation breaks `next build`. Defer to first runtime use - all routes
// using `auth` are `dynamic = 'force-dynamic'`.
function build() {
  const cfg = loadAuthConfig();
  const adminEmail = cfg.oidc?.adminEmail ?? null;
  const allowNewUsers = cfg.oidc?.allowNewUsers ?? true;
  const trustedOrigins = getTrustedOrigins();
  const baseURL = trustedOrigins[0];

  return betterAuth({
    secret: cfg.secret,
    baseURL,
    trustedOrigins,
    database: drizzleAdapter(getDb(), {
      provider: 'sqlite',
      schema: { user, account, session, verification },
    }),
    emailAndPassword: {
      enabled: true,
      autoSignIn: true,
      disableSignUp: true,
      password: {
        hash: hashPassword,
        verify: verifyPasswordPair,
      },
    },
    user: {
      additionalFields: {
        role: { type: 'string', required: false, defaultValue: 'viewer', input: false },
        provider: { type: 'string', required: false, defaultValue: 'local', input: false },
        oidcSubject: { type: 'string', required: false, input: false },
        lastLoginAt: { type: 'date', required: false, input: false },
      },
    },
    databaseHooks: {
      user: {
        create: {
          before: async (data) => {
            const email = String(data.email ?? '')
              .toLowerCase()
              .trim();
            const role = adminEmail && email === adminEmail ? 'admin' : (data.role ?? 'viewer');
            return { data: { ...data, email, role } };
          },
        },
      },
      session: {
        create: {
          after: async (created) => {
            getDb().update(user).set({ lastLoginAt: new Date() }).where(eq(user.id, created.userId)).run();
          },
        },
      },
    },
    plugins: [
      ...(cfg.oidc
        ? [
            genericOAuth({
              config: [
                {
                  providerId: 'oidc',
                  discoveryUrl: `${cfg.oidc.issuer.replace(/\/+$/, '')}/.well-known/openid-configuration`,
                  clientId: cfg.oidc.clientId,
                  clientSecret: cfg.oidc.clientSecret,
                  scopes: ['openid', 'email', 'profile'],
                  pkce: true,
                  disableImplicitSignUp: !allowNewUsers,
                  mapProfileToUser: (profile) => {
                    const email = String((profile as { email?: unknown }).email ?? '')
                      .toLowerCase()
                      .trim();
                    const sub = String((profile as { sub?: unknown }).sub ?? '');
                    const name = (profile as { name?: unknown }).name;
                    return {
                      email,
                      name: typeof name === 'string' ? name : undefined,
                      emailVerified: true,
                      provider: 'oidc',
                      oidcSubject: sub,
                      role: adminEmail && email === adminEmail ? 'admin' : 'viewer',
                    };
                  },
                },
              ],
            }),
          ]
        : []),
      nextCookies(),
    ],
  });
}

type Auth = ReturnType<typeof build>;

let cached: Auth | undefined;

function getAuth(): Auth {
  if (!cached) {
    cached = build();
  }
  return cached;
}

export const auth = new Proxy({} as Auth, {
  get(_target, prop) {
    return Reflect.get(getAuth() as object, prop);
  },
  has(_target, prop) {
    return Reflect.has(getAuth() as object, prop);
  },
});
