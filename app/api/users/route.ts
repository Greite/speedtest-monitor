import { NextResponse } from 'next/server';
import { z } from 'zod';

import { apiError, apiValidationError } from '@/lib/api-errors';
import { requireAdmin } from '@/lib/auth/authorize';
import { hashPassword } from '@/lib/auth/hash';
import { emailSchema } from '@/lib/auth/schema';
import { createUser, findUserByEmail, listUsers, setCredentialPassword, toPublicUser } from '@/lib/auth/users';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const createSchema = z.object({
  email: emailSchema,
  password: z.string().min(10).max(1024),
  role: z.enum(['admin', 'viewer']).optional(),
  name: z.string().max(200).optional(),
});

export async function GET() {
  await requireAdmin();
  return NextResponse.json({ users: listUsers().map(toPublicUser) });
}

export async function POST(req: Request) {
  await requireAdmin();
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return apiError('invalid_json', 'Request body is not valid JSON.', 400);
  }
  const parsed = createSchema.safeParse(body);
  if (!parsed.success) {
    return apiValidationError(parsed.error);
  }
  const email = parsed.data.email.toLowerCase().trim();
  if (findUserByEmail(email)) {
    return apiError('email_in_use', 'An account with this email already exists.', 409);
  }
  const created = createUser({
    email,
    name: parsed.data.name ?? '',
    emailVerified: true,
    role: parsed.data.role ?? 'viewer',
    provider: 'local',
  });
  setCredentialPassword(created.id, await hashPassword(parsed.data.password));
  return NextResponse.json({ user: toPublicUser(created) });
}
