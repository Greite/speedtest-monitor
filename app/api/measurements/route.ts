import { NextResponse } from 'next/server';

import { apiError } from '@/lib/api-errors';
import { isRange, listMeasurements } from '@/lib/measurements';
import { toMeasurementDto } from '@/lib/types';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export function GET(req: Request) {
  const url = new URL(req.url);
  const rangeParam = url.searchParams.get('range') ?? '24h';
  if (!isRange(rangeParam)) {
    return apiError('invalid_range', 'Expected one of: 6h, 12h, 24h, 7d, 30d.', 400);
  }
  const rows = listMeasurements(rangeParam);
  return NextResponse.json({
    range: rangeParam,
    measurements: rows.map(toMeasurementDto),
  });
}
