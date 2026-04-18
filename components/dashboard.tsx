'use client';

import dynamic from 'next/dynamic';
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

export function Dashboard({ initial }: { initial: MeasurementDto[] }) {
  const { measurements } = useLiveMeasurements(initial, '24h');
  const latest = measurements.find((m) => m.status === 'success') ?? null;

  return (
    <div className="flex flex-col gap-6">
      <KpiCards latest={latest} />
      <HistoryChart measurements={measurements} />
      <HistoryTable measurements={measurements.slice(0, 25)} />
    </div>
  );
}
