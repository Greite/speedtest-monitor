import { NextResponse } from 'next/server';
import { z } from 'zod';
import { apiError, apiValidationError } from '@/lib/api-errors';
import { signIn } from '@/lib/auth/handler';
import { hashPassword } from '@/lib/auth/hash';
import { countUsers, createUser } from '@/lib/auth/users';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const schema = z.object({
  email: z.string().regex(/^[^\s@]+@[^\s@]+\.[^\s@]+$/, 'Invalid email'),
  password: z.string().min(10).max(1024),
});

export async function POST(req: Request) {
  if (countUsers() !== 0) {
    return apiError('not_found', 'Setup is no longer available.', 404);
  }
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
  const email = parsed.data.email.toLowerCase().trim();
  const passwordHash = await hashPassword(parsed.data.password);
  createUser({ email, passwordHash, role: 'admin', provider: 'local' });
  try {
    await signIn('credentials', {
      email,
      password: parsed.data.password,
      redirect: false,
    });
  } catch {
    // Fall through - the user can sign in manually afterwards.
  }
  return new NextResponse(null, { status: 204 });
}
