import type { NextResponse } from 'next/server';
import { apiError } from '@/lib/api-errors';
import { auth } from './handler';
import type { SessionUser } from './types';

export class AuthError extends Error {
  constructor(
    public readonly status: 401 | 403,
    message: string,
  ) {
    super(message);
  }
}

export async function requireSession(): Promise<SessionUser> {
  const session = await auth();
  if (!session?.user?.email || !session.user.role || !session.user.id) {
    throw new AuthError(401, 'unauthorized');
  }
  return {
    id: session.user.id,
    email: session.user.email,
    name: session.user.name ?? null,
    role: session.user.role,
  };
}

export async function requireAdmin(): Promise<SessionUser> {
  const user = await requireSession();
  if (user.role !== 'admin') throw new AuthError(403, 'forbidden');
  return user;
}

export function authErrorResponse(err: unknown): NextResponse | null {
  if (err instanceof AuthError) {
    if (err.status === 401) {
      return apiError('unauthorized', 'You must be signed in.', 401);
    }
    return apiError('forbidden', 'You do not have permission.', 403);
  }
  return null;
}
