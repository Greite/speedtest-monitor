import { NextResponse } from 'next/server';

import { apiError } from '@/lib/api-errors';
import { listMeasurementsPaged } from '@/lib/measurements';
import { parseTableQuery, type TableQuery } from '@/lib/measurements-query';
import { toMeasurementDto } from '@/lib/types';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export function GET(req: Request) {
  const url = new URL(req.url);
  let query: TableQuery;
  try {
    query = parseTableQuery(url.searchParams);
  } catch (err) {
    return apiError('invalid_query', err instanceof Error ? err.message : 'Invalid query.', 400);
  }
  const { rows, totalCount } = listMeasurementsPaged(query);
  return NextResponse.json({
    page: query.page,
    pageSize: query.pageSize,
    sort: query.sort,
    sortDir: query.sortDir,
    totalCount,
    measurements: rows.map(toMeasurementDto),
  });
}
