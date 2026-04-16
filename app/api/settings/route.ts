import { NextResponse } from 'next/server';
import { z } from 'zod';
import { rescheduleFromSettings } from '@/lib/scheduler';
import {
  getEnvDefaultIntervalMinutes,
  getIntervalMinutes,
  setIntervalMinutes,
} from '@/lib/settings';
import { broadcastSettingsUpdated } from '@/lib/ws/broadcast';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const patchSchema = z.object({
  intervalMinutes: z.number().int().min(1).max(1440),
});

export function GET() {
  return NextResponse.json({
    intervalMinutes: getIntervalMinutes(),
    envDefaultIntervalMinutes: getEnvDefaultIntervalMinutes(),
  });
}

export async function PATCH(req: Request) {
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'invalid JSON body' }, { status: 400 });
  }
  const parsed = patchSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: z.treeifyError(parsed.error) }, { status: 400 });
  }
  const minutes = setIntervalMinutes(parsed.data.intervalMinutes);
  rescheduleFromSettings();
  broadcastSettingsUpdated(minutes);
  return NextResponse.json({
    intervalMinutes: minutes,
    envDefaultIntervalMinutes: getEnvDefaultIntervalMinutes(),
  });
}
