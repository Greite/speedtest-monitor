import { headers } from 'next/headers';

import type { UserRole } from '../db/schema';
import { auth } from './handler';

export type SessionUser = {
  id: string;
  email: string;
  name?: string | null;
  role: UserRole;
  sessionId?: string;
};

export async function requireSession(): Promise<SessionUser> {
  const session = await auth.api.getSession({ headers: await headers() });
  const u = session?.user;
  if (!u?.id || !u.email) {
    throw new Error('unauthorized');
  }
  const role = (u as { role?: UserRole }).role;
  if (!role) {
    throw new Error('unauthorized');
  }
  return {
    id: u.id,
    email: u.email,
    name: u.name ?? null,
    role,
    sessionId: session?.session?.id,
  };
}

export async function requireAdmin(): Promise<SessionUser> {
  const user = await requireSession();
  if (user.role !== 'admin') {
    throw new Error('forbidden');
  }
  return user;
}
