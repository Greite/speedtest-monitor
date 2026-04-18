import { NextResponse } from 'next/server';
import { apiError } from '@/lib/api-errors';
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
      return apiError('already_running', 'A measurement is already in progress.', 409);
    }
    const message = err instanceof Error ? err.message : 'Unknown error';
    return apiError('measurement_failed', message, 500);
  }
}
