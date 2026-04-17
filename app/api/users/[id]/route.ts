import { NextResponse } from 'next/server';
import { z } from 'zod';
import { requireAdmin } from '@/lib/auth/authorize';
import { countAdmins, deleteUser, findUserById, updateUser } from '@/lib/auth/users';
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

const patchSchema = z
  .object({
    role: z.enum(['admin', 'viewer']).optional(),
    name: z.string().max(200).nullable().optional(),
  })
  .strict();

type Params = { params: Promise<{ id: string }> };

export async function PATCH(req: Request, { params }: Params) {
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
  const parsed = patchSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: z.treeifyError(parsed.error) }, { status: 400 });
  }

  if (parsed.data.role === 'viewer' && target.role === 'admin' && countAdmins() <= 1) {
    return NextResponse.json({ error: 'last admin' }, { status: 409 });
  }

  const updated = updateUser(userId, parsed.data);
  return NextResponse.json({ user: publicShape(updated!) });
}

export async function DELETE(_req: Request, { params }: Params) {
  await requireAdmin();
  const { id } = await params;
  const userId = Number.parseInt(id, 10);
  if (!Number.isInteger(userId)) {
    return NextResponse.json({ error: 'invalid id' }, { status: 400 });
  }
  const target = findUserById(userId);
  if (!target) return new NextResponse(null, { status: 204 });
  if (target.role === 'admin' && countAdmins() <= 1) {
    return NextResponse.json({ error: 'last admin' }, { status: 409 });
  }
  deleteUser(userId);
  return new NextResponse(null, { status: 204 });
}
