import { NextResponse } from 'next/server';
import { z } from 'zod';
import { requireAdmin } from '@/lib/auth/authorize';
import { hashPassword } from '@/lib/auth/hash';
import { createUser, findUserByEmail, listUsers } from '@/lib/auth/users';
import type { User } from '@/lib/db/schema';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

function publicShape(u: User) {
  const { passwordHash, ...rest } = u;
  return {
    ...rest,
    createdAt: u.createdAt.getTime(),
    lastLoginAt: u.lastLoginAt ? u.lastLoginAt.getTime() : null,
  };
}

const createSchema = z.object({
  email: z.string().regex(/^[^\s@]+@[^\s@]+\.[^\s@]+$/, 'Invalid email'),
  password: z.string().min(10).max(1024),
  role: z.enum(['admin', 'viewer']).optional(),
  name: z.string().max(200).optional(),
});

export async function GET() {
  await requireAdmin();
  return NextResponse.json({ users: listUsers().map(publicShape) });
}

export async function POST(req: Request) {
  await requireAdmin();
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'invalid JSON' }, { status: 400 });
  }
  const parsed = createSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: z.treeifyError(parsed.error) }, { status: 400 });
  }
  const email = parsed.data.email.toLowerCase().trim();
  if (findUserByEmail(email)) {
    return NextResponse.json({ error: 'email already in use' }, { status: 409 });
  }
  const user = createUser({
    email,
    passwordHash: await hashPassword(parsed.data.password),
    role: parsed.data.role ?? 'viewer',
    provider: 'local',
    name: parsed.data.name ?? null,
  });
  return NextResponse.json({ user: publicShape(user) });
}
