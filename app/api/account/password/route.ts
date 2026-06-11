import { NextResponse } from 'next/server';
import { z } from 'zod';

import { apiError, apiValidationError } from '@/lib/api-errors';
import { requireSession } from '@/lib/auth/authorize';
import { hashPassword, verifyPassword } from '@/lib/auth/hash';
import { findUserById, getCredentialPasswordHash, revokeUserSessions, setCredentialPassword } from '@/lib/auth/users';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const schema = z.object({
  currentPassword: z.string().min(1),
  newPassword: z.string().min(10).max(1024),
});

export async function POST(req: Request) {
  const session = await requireSession();
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return apiError('invalid_json', 'Request body is not valid JSON.', 400);
  }
  const parsed = schema.safeParse(body);
  if (!parsed.success) {
    return apiValidationError(parsed.error);
  }
  const user = findUserById(session.id);
  if (!user) {
    return apiError('not_found', 'User not found.', 404);
  }
  const currentHash = getCredentialPasswordHash(user.id);
  if (!currentHash) {
    return apiError('not_local', 'This account uses SSO and has no local password.', 400);
  }
  if (!(await verifyPassword(currentHash, parsed.data.currentPassword))) {
    return apiError('wrong_password', 'Current password is incorrect.', 400);
  }
  setCredentialPassword(user.id, await hashPassword(parsed.data.newPassword));
  revokeUserSessions(user.id, { exceptSessionId: session.sessionId });
  return NextResponse.json({ ok: true });
}
