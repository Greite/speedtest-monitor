import { NextResponse } from 'next/server';
import { z } from 'zod';

import { apiError, apiValidationError } from '@/lib/api-errors';
import { requireAdmin } from '@/lib/auth/authorize';
import { countAdmins, deleteUser, findUserById, updateUser } from '@/lib/auth/users';
import type { User } from '@/lib/db/schema';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

function publicShape(u: User) {
  return {
    id: u.id,
    email: u.email,
    role: u.role,
    provider: u.provider,
    name: u.name,
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
  if (!id) {
    return apiError('invalid_id', 'User id is required.', 400);
  }
  const target = findUserById(id);
  if (!target) {
    return apiError('not_found', 'User not found.', 404);
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return apiError('invalid_json', 'Request body is not valid JSON.', 400);
  }
  const parsed = patchSchema.safeParse(body);
  if (!parsed.success) {
    return apiValidationError(parsed.error);
  }

  if (parsed.data.role === 'viewer' && target.role === 'admin' && countAdmins() <= 1) {
    return apiError('last_admin', 'Cannot demote the last admin.', 409);
  }

  const patch = { ...parsed.data, name: parsed.data.name ?? undefined };
  const updated = updateUser(id, patch);
  return NextResponse.json({ user: publicShape(updated!) });
}

export async function DELETE(_req: Request, { params }: Params) {
  await requireAdmin();
  const { id } = await params;
  if (!id) {
    return apiError('invalid_id', 'User id is required.', 400);
  }
  const target = findUserById(id);
  if (!target) {
    return new NextResponse(null, { status: 204 });
  }
  if (target.role === 'admin' && countAdmins() <= 1) {
    return apiError('last_admin', 'Cannot delete the last admin.', 409);
  }
  deleteUser(id);
  return new NextResponse(null, { status: 204 });
}
