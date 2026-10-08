import { connection, NextResponse } from 'next/server';
import { z } from 'zod';

import { apiError, apiValidationError } from '@/lib/api-errors';
import {
  getEnvDefaultIntervalMinutes,
  getEnvDefaultRetentionDays,
  getIntervalMinutes,
  getRetentionDays,
  setIntervalMinutes,
  setRetentionDays,
} from '@/lib/settings';

const patchSchema = z
  .object({
    intervalMinutes: z.number().int().min(1).max(1440).optional(),
    retentionDays: z.number().int().min(1).max(3650).optional(),
  })
  .refine((data) => data.intervalMinutes !== undefined || data.retentionDays !== undefined, {
    message: 'at least one of intervalMinutes or retentionDays is required',
  });

export async function GET() {
  // No request data is read, so without this the handler is prerendered at build.
  await connection();
  return NextResponse.json({
    intervalMinutes: getIntervalMinutes(),
    envDefaultIntervalMinutes: getEnvDefaultIntervalMinutes(),
    retentionDays: getRetentionDays(),
    envDefaultRetentionDays: getEnvDefaultRetentionDays(),
  });
}

export async function PATCH(req: Request) {
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

  let intervalChanged = false;
  if (parsed.data.intervalMinutes !== undefined) {
    setIntervalMinutes(parsed.data.intervalMinutes);
    intervalChanged = true;
  }
  if (parsed.data.retentionDays !== undefined) {
    setRetentionDays(parsed.data.retentionDays);
  }

  const intervalMinutes = getIntervalMinutes();
  if (intervalChanged) {
    globalThis.__speedtestReschedule?.();
  }

  return NextResponse.json({
    intervalMinutes,
    envDefaultIntervalMinutes: getEnvDefaultIntervalMinutes(),
    retentionDays: getRetentionDays(),
    envDefaultRetentionDays: getEnvDefaultRetentionDays(),
  });
}
