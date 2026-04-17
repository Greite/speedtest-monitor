import { NextResponse } from 'next/server';
import { z } from 'zod';
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
    return NextResponse.json({ error: 'invalid JSON' }, { status: 400 });
  }
  const parsed = schema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: z.treeifyError(parsed.error) }, { status: 400 });
  }
  const user = findUserById(Number(session.id));
  if (!user?.passwordHash) {
    return NextResponse.json({ error: 'not a local user' }, { status: 400 });
  }
  if (!(await verifyPassword(user.passwordHash, parsed.data.currentPassword))) {
    return NextResponse.json({ error: 'current password incorrect' }, { status: 400 });
  }
  updateUser(user.id, { passwordHash: await hashPassword(parsed.data.newPassword) });
  return NextResponse.json({ ok: true });
}
