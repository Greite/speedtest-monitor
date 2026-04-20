import { NextResponse } from 'next/server';
import { pingDb } from '@/lib/db/client';
import { isWsReady } from '@/lib/ws/server';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export function GET() {
  const db = pingDb();
  const ws = isWsReady();

  const body = {
    status: db.ok && ws.ok ? 'ok' : 'unhealthy',
    db: db.ok ? { ok: true } : { ok: false, error: db.error },
    ws: ws.ok ? { ok: true, clients: ws.clients } : { ok: false, error: ws.error },
  };

  return NextResponse.json(body, { status: db.ok && ws.ok ? 200 : 503 });
}
