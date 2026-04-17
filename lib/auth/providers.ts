import Credentials from 'next-auth/providers/credentials';
import { loadAuthConfig } from './config';
import { verifyPassword } from './hash';
import type { SessionUser } from './types';
import {
  createUser,
  findUserByEmail,
  findUserById,
  findUserByOidcSubject,
  updateLastLogin,
  updateUser,
} from './users';

type OidcClaims = { email: unknown; sub: unknown; name?: unknown };

export async function oidcProfile(args: {
  claims: OidcClaims;
  adminEmail: string | null;
  allowNewUsers: boolean;
}): Promise<SessionUser> {
  const email = String(args.claims.email).toLowerCase().trim();
  const sub = String(args.claims.sub);
  let user = findUserByOidcSubject(sub) ?? findUserByEmail(email);

  if (!user) {
    if (!args.allowNewUsers) throw new Error('OIDC_USER_NOT_ALLOWED');
    user = createUser({
      email,
      name: typeof args.claims.name === 'string' ? args.claims.name : null,
      provider: 'oidc',
      oidcSubject: sub,
      role: args.adminEmail && email === args.adminEmail ? 'admin' : 'viewer',
    });
  } else {
    const patch: Parameters<typeof updateUser>[1] = { oidcSubject: sub };
    if (args.adminEmail && email === args.adminEmail && user.role !== 'admin') {
      patch.role = 'admin';
    }
    updateUser(user.id, patch);
    user = findUserById(user.id)!;
  }

  updateLastLogin(user.id);
  return { id: String(user.id), email: user.email, name: user.name, role: user.role };
}

export function buildProviders(): unknown[] {
  const cfg = loadAuthConfig();
  const credentials = Credentials({
    name: 'Email + password',
    credentials: { email: {}, password: {} },
    async authorize(creds): Promise<SessionUser | null> {
      const email = String(creds?.email ?? '')
        .toLowerCase()
        .trim();
      const password = String(creds?.password ?? '');
      if (!email || !password) return null;
      const user = findUserByEmail(email);
      if (!user?.passwordHash) return null;
      if (!(await verifyPassword(user.passwordHash, password))) return null;
      updateLastLogin(user.id);
      return { id: String(user.id), email: user.email, name: user.name, role: user.role };
    },
  });

  const out: unknown[] = [credentials];

  if (cfg.oidc) {
    const { issuer, clientId, clientSecret, displayName, adminEmail, allowNewUsers } = cfg.oidc;
    out.push({
      id: 'oidc',
      name: displayName,
      type: 'oidc' as const,
      issuer,
      clientId,
      clientSecret,
      authorization: { params: { scope: 'openid email profile' } },
      async profile(claims: OidcClaims) {
        return oidcProfile({ claims, adminEmail, allowNewUsers });
      },
    });
  }

  return out;
}
