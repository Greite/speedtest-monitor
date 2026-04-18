import { NextResponse } from 'next/server';
import { z } from 'zod';
import { apiError, apiValidationError } from '@/lib/api-errors';
import { requireSession } from '@/lib/auth/authorize';
import { hashPassword, verifyPassword } from '@/lib/auth/hash';
import { findUserById, updateUser } from '@/lib/auth/users';

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
  const user = findUserById(Number(session.id));
  if (!user?.passwordHash) {
    return apiError('not_local', 'This account uses SSO and has no local password.', 400);
  }
  if (!(await verifyPassword(user.passwordHash, parsed.data.currentPassword))) {
    return apiError('wrong_password', 'Current password is incorrect.', 400);
  }
  updateUser(user.id, { passwordHash: await hashPassword(parsed.data.newPassword) });
  return NextResponse.json({ ok: true });
}
