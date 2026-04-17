import { desc } from 'drizzle-orm';
import { NextResponse } from 'next/server';
import { getDb } from '@/lib/db/client';
import { alerts } from '@/lib/db/schema';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export function GET(req: Request) {
  const url = new URL(req.url);
  const rawLimit = url.searchParams.get('limit');
  const parsed = rawLimit ? Number.parseInt(rawLimit, 10) : 50;
  const limit = Number.isFinite(parsed) ? Math.min(Math.max(parsed, 1), 500) : 50;

  const db = getDb();
  const rows = db.select().from(alerts).orderBy(desc(alerts.timestamp)).limit(limit).all();

  return NextResponse.json({
    alerts: rows.map((r) => ({
      id: r.id,
      timestamp: r.timestamp.getTime(),
      kind: r.kind,
      event: r.event,
      measurementId: r.measurementId,
      threshold: r.threshold,
      observed: r.observed,
      deliveryStatus: r.deliveryStatus ?? {},
    })),
  });
}
