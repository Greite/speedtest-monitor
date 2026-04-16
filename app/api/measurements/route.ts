import { NextResponse } from 'next/server';
import { isRange, listMeasurements } from '@/lib/measurements';
import { toMeasurementDto } from '@/lib/types';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export function GET(req: Request) {
  const url = new URL(req.url);
  const rangeParam = url.searchParams.get('range') ?? '24h';
  if (!isRange(rangeParam)) {
    return NextResponse.json(
      { error: 'invalid range (expected 1h | 6h | 24h | 7d | 30d)' },
      { status: 400 },
    );
  }
  const rows = listMeasurements(rangeParam);
  return NextResponse.json({
    range: rangeParam,
    measurements: rows.map(toMeasurementDto),
  });
}
