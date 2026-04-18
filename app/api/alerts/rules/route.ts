import { NextResponse } from 'next/server';
import { z } from 'zod';
import { loadAlertConfig } from '@/lib/alerts/config';
import { configuredNames } from '@/lib/alerts/destinations';
import { getAlertRules, setAlertRules } from '@/lib/alerts/rules';
import { apiError, apiValidationError } from '@/lib/api-errors';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const patchSchema = z
  .object({
    enabled: z.boolean().optional(),
    thresholds: z
      .object({
        downloadMbps: z.number().positive().nullable().optional(),
        uploadMbps: z.number().positive().nullable().optional(),
        latencyMs: z.number().positive().nullable().optional(),
        bufferBloatMs: z.number().positive().nullable().optional(),
      })
      .optional(),
    failureStreak: z.number().int().positive().nullable().optional(),
    destinations: z
      .object({
        webhook: z.boolean().optional(),
        ntfy: z.boolean().optional(),
        discord: z.boolean().optional(),
        slack: z.boolean().optional(),
        smtp: z.boolean().optional(),
      })
      .optional(),
  })
  .strict();

function withConfigured() {
  const rules = getAlertRules();
  const cfg = loadAlertConfig();
  return { ...rules, destinationsConfigured: configuredNames(cfg) };
}

export function GET() {
  return NextResponse.json(withConfigured());
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
  setAlertRules(parsed.data as never);
  return NextResponse.json(withConfigured());
}
