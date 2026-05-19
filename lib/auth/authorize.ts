import { headers } from 'next/headers';

import { auth } from './handler';
import type { SessionUser, UserRole } from './types';

class AuthError extends Error {
  constructor(
    public readonly status: 401 | 403,
    message: string,
  ) {
    super(message);
  }
}

export async function requireSession(): Promise<SessionUser> {
  const session = await auth.api.getSession({ headers: await headers() });
  const u = session?.user;
  if (!u?.id || !u.email) {
    throw new AuthError(401, 'unauthorized');
  }
  const role = (u as { role?: UserRole }).role;
  if (!role) {
    throw new AuthError(401, 'unauthorized');
  }
  return {
    id: u.id,
    email: u.email,
    name: u.name ?? null,
    role,
  };
}

export async function requireAdmin(): Promise<SessionUser> {
  const user = await requireSession();
  if (user.role !== 'admin') {
    throw new AuthError(403, 'forbidden');
  }
  return user;
}
