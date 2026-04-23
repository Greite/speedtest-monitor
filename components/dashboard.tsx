'use client';

import dynamic from 'next/dynamic';
import { useCallback, useMemo, useState } from 'react';
import { type Range, TimeRangePicker } from '@/components/time-range-picker';
import { Card, CardContent } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import type { MeasurementDto } from '@/lib/types';
import { HistoryTable } from './history-table';
import { KpiCards } from './kpi-cards';
import { useLiveMeasurements } from './use-live-measurements';

const HistoryChart = dynamic(() => import('./history-chart').then((m) => m.HistoryChart), {
  ssr: false,
  loading: () => (
    <Card>
      <CardContent className="p-5">
        <Skeleton className="h-64 w-full" />
      </CardContent>
    </Card>
  ),
});

function computeAverage(values: (number | null)[]): number | null {
  const valid = values.filter((v): v is number => v != null);
  if (valid.length === 0) return null;
  return valid.reduce((a, b) => a + b, 0) / valid.length;
}

export function Dashboard({
  initial,
  initialRange,
}: {
  initial: MeasurementDto[];
  initialRange: Range;
}) {
  const [range, setRangeState] = useState<Range>(initialRange);
  const setRange = useCallback((next: Range) => {
    setRangeState(next);
    if (typeof window !== 'undefined') {
      const url = new URL(window.location.href);
      url.searchParams.set('range', next);
      window.history.replaceState({}, '', url.toString());
    }
  }, []);

  const { measurements, running } = useLiveMeasurements(initial, range);
  const latest = measurements.find((m) => m.status === 'success') ?? null;
  const refreshSignal = measurements[0]?.id ?? null;

  const averages = useMemo(() => {
    const successes = measurements.filter((m) => m.status === 'success');
    return {
      download: computeAverage(successes.map((m) => m.downloadMbps)),
      upload: computeAverage(successes.map((m) => m.uploadMbps)),
      latency: computeAverage(successes.map((m) => m.latencyLoadedMs)),
    };
  }, [measurements]);

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-center justify-between">
        <h1 className="text-lg font-semibold tracking-tight sm:text-xl">Overview</h1>
        <TimeRangePicker value={range} onChange={setRange} />
      </div>
      <KpiCards latest={latest} averages={averages} busy={running} />
      <HistoryChart measurements={measurements} />
      <HistoryTable refreshSignal={refreshSignal} />
    </div>
  );
}
