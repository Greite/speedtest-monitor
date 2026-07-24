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
  const f = q.filters;
  const entries: [string, string | number | undefined][] = [
    ['page', q.page],
    ['pageSize', q.pageSize],
    ['sort', q.sort],
    ['sortDir', q.sortDir],
    ['timeFrom', f.time?.from],
    ['timeTo', f.time?.to],
    ['downloadMin', f.download?.min],
    ['downloadMax', f.download?.max],
    ['uploadMin', f.upload?.min],
    ['uploadMax', f.upload?.max],
    ['latencyMin', f.latency?.min],
    ['latencyMax', f.latency?.max],
    ['server', f.server || undefined],
    ['status', f.status?.length ? f.status.join(',') : undefined],
  ];
  const p = new URLSearchParams();
  for (const [k, v] of entries) {
    if (v !== undefined) {
      p.set(k, String(v));
    }
  }
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
      if (!res.ok) {
        return;
      }
      const body = (await res.json()) as TableResponse;
      if (reqId !== reqIdRef.current) {
        return;
      }
      setData(body);
    } finally {
      if (reqId === reqIdRef.current) {
        setLoading(false);
      }
    }
  }, [query]);

  useEffect(() => {
    fetchPage();
  }, [fetchPage]);

  useEffect(() => {
    if (refreshSignal == null) {
      return;
    }
    fetchPage();
  }, [refreshSignal, fetchPage]);

  return { ...data, loading, refetch: fetchPage };
}
