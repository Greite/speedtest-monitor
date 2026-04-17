import { NextResponse } from 'next/server';
import { z } from 'zod';
import { requireAdmin } from '@/lib/auth/authorize';
import { hashPassword } from '@/lib/auth/hash';
import { findUserById, updateUser } from '@/lib/auth/users';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const schema = z.object({ newPassword: z.string().min(10).max(1024) });

type Params = { params: Promise<{ id: string }> };

export async function POST(req: Request, { params }: Params) {
  await requireAdmin();
  const { id } = await params;
  const userId = Number.parseInt(id, 10);
  if (!Number.isInteger(userId)) {
    return NextResponse.json({ error: 'invalid id' }, { status: 400 });
  }
  const target = findUserById(userId);
  if (!target) return NextResponse.json({ error: 'not found' }, { status: 404 });
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
  updateUser(userId, { passwordHash: await hashPassword(parsed.data.newPassword) });
  return NextResponse.json({ ok: true });
}
