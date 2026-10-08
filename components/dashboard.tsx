'use client';

import { Card } from '@astryxdesign/core/Card';
import { Skeleton } from '@astryxdesign/core/Skeleton';
import dynamic from 'next/dynamic';
import { useState, ViewTransition } from 'react';

import { HistoryTable } from './history-table';
import { KpiCards } from './kpi-cards';
import { useLiveMeasurements } from './use-live-measurements';

import { TimeRangePicker } from '@/components/time-range-picker';
import type { Range } from '@/lib/measurements';
import type { MeasurementDto } from '@/lib/types';

const HistoryChart = dynamic(() => import('./history-chart').then((m) => m.HistoryChart), {
  ssr: false,
  loading: () => (
    <Card>
      <Skeleton height={256} />
    </Card>
  ),
});

function computeAverage(values: (number | null)[]): number | null {
  const valid = values.filter((v): v is number => v != null);
  if (valid.length === 0) {
    return null;
  }
  return valid.reduce((a, b) => a + b, 0) / valid.length;
}

export function Dashboard({ initial, initialRange }: { initial: MeasurementDto[]; initialRange: Range }) {
  const [range, setRangeState] = useState<Range>(initialRange);
  function setRange(next: Range) {
    setRangeState(next);
    const url = new URL(window.location.href);
    url.searchParams.set('range', next);
    window.history.replaceState({}, '', url.toString());
  }

  const { measurements, running } = useLiveMeasurements(initial, range);
  const latest = measurements.find((m) => m.status === 'success') ?? null;
  const refreshSignal = measurements[0]?.id ?? null;

  const successes = measurements.filter((m) => m.status === 'success');
  const averages = {
    download: computeAverage(successes.map((m) => m.downloadMbps)),
    upload: computeAverage(successes.map((m) => m.uploadMbps)),
    latency: computeAverage(successes.map((m) => m.latencyLoadedMs)),
  };

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-end justify-between gap-4">
        <div className="flex flex-col gap-1">
          <span className="label-eyebrow">Network status</span>
          <h1 className="text-2xl font-semibold tracking-tight sm:text-3xl">
            Overview<span className="text-brand">.</span>
          </h1>
        </div>
        <TimeRangePicker value={range} onChange={setRange} />
      </div>
      {/* Crossfades when a range refetch lands (a transition, see
          useLiveMeasurements); live WS pushes are urgent and don't animate. */}
      <ViewTransition update="auto" default="none">
        <KpiCards latest={latest} averages={averages} busy={running} measurements={measurements} />
        <HistoryChart measurements={measurements} />
      </ViewTransition>
      <HistoryTable refreshSignal={refreshSignal} />
    </div>
  );
}
