'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import type { TableQuery } from '@/lib/measurements-query';
import type { MeasurementDto } from '@/lib/types';

export type TableResponse = {
  page: number;
  pageSize: number;
  totalCount: number;
  measurements: MeasurementDto[];
};

function toSearchParams(q: TableQuery): URLSearchParams {
  const p = new URLSearchParams();
  p.set('page', String(q.page));
  p.set('pageSize', String(q.pageSize));
  p.set('sort', q.sort);
  p.set('sortDir', q.sortDir);
  const f = q.filters;
  if (f.time?.from != null) p.set('timeFrom', String(f.time.from));
  if (f.time?.to != null) p.set('timeTo', String(f.time.to));
  if (f.download?.min != null) p.set('downloadMin', String(f.download.min));
  if (f.download?.max != null) p.set('downloadMax', String(f.download.max));
  if (f.upload?.min != null) p.set('uploadMin', String(f.upload.min));
  if (f.upload?.max != null) p.set('uploadMax', String(f.upload.max));
  if (f.latency?.min != null) p.set('latencyMin', String(f.latency.min));
  if (f.latency?.max != null) p.set('latencyMax', String(f.latency.max));
  if (f.server) p.set('server', f.server);
  if (f.status && f.status.length > 0) p.set('status', f.status.join(','));
  return p;
}

export function useTableMeasurements(query: TableQuery, refreshSignal: number | string | null) {
  const [data, setData] = useState<TableResponse>({
    page: query.page,
    pageSize: query.pageSize,
    totalCount: 0,
    measurements: [],
  });
  const [loading, setLoading] = useState(false);
  const reqIdRef = useRef(0);

  const fetchPage = useCallback(async () => {
    const reqId = ++reqIdRef.current;
    setLoading(true);
    try {
      const res = await fetch(`/api/measurements/table?${toSearchParams(query).toString()}`, {
        cache: 'no-store',
      });
      if (!res.ok) return;
      const body = (await res.json()) as TableResponse;
      if (reqId !== reqIdRef.current) return;
      setData(body);
    } finally {
      if (reqId === reqIdRef.current) setLoading(false);
    }
  }, [query]);

  useEffect(() => {
    fetchPage();
  }, [fetchPage]);

  useEffect(() => {
    if (refreshSignal == null) return;
    fetchPage();
  }, [refreshSignal, fetchPage]);

  return { ...data, loading, refetch: fetchPage };
}
