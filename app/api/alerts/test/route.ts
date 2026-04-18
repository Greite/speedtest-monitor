import { NextResponse } from 'next/server';
import { z } from 'zod';
import { loadAlertConfig } from '@/lib/alerts/config';
import { buildDestinations } from '@/lib/alerts/destinations';
import type { AlertPayload, DestinationName } from '@/lib/alerts/types';
import { apiValidationError } from '@/lib/api-errors';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const bodySchema = z
  .object({
    destination: z.enum(['webhook', 'ntfy', 'discord', 'slack', 'smtp']).optional(),
  })
  .strict();

export async function POST(req: Request) {
  let body: unknown = {};
  if (req.headers.get('content-length') !== '0') {
    try {
      body = await req.json();
    } catch {
      /* empty body is fine */
    }
  }
  const parsed = bodySchema.safeParse(body);
  if (!parsed.success) {
    return apiValidationError(parsed.error);
  }

  const cfg = loadAlertConfig();
  const destinations = buildDestinations(cfg);
  const filter: DestinationName | null = parsed.data.destination ?? null;
  const targets = filter ? destinations.filter((d) => d.name === filter) : destinations;

  const payload: AlertPayload = {
    event: 'fired',
    kind: 'download_below',
    title: 'Fastcom: Test alert',
    body: 'This is a test alert dispatched from /api/alerts/test - your configuration is working.',
    observed: null,
    threshold: null,
    timestamp: Date.now(),
    measurementId: null,
    alertId: 0,
  };

  const entries = await Promise.all(
    targets.map(async (d) => [d.name, await d.send(payload)] as const),
  );
  return NextResponse.json({ results: Object.fromEntries(entries) });
}
