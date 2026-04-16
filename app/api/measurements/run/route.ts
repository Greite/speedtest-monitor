import { NextResponse } from 'next/server';
import { MeasurementBusyError, runMeasurement } from '@/lib/fastcli/runner';
import { toMeasurementDto } from '@/lib/types';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 200;

export async function POST() {
  try {
    const row = await runMeasurement();
    return NextResponse.json({ measurement: toMeasurementDto(row) });
  } catch (err) {
    if (err instanceof MeasurementBusyError) {
      return NextResponse.json({ error: 'already running' }, { status: 409 });
    }
    const message = err instanceof Error ? err.message : 'unknown error';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
