'use client';

import { AlertCircle, Loader2, Play } from 'lucide-react';
import dynamic from 'next/dynamic';
import { useState } from 'react';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import type { MeasurementDto } from '@/lib/types';
import { cn } from '@/lib/utils';
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
  const { measurements, running, connected, triggerRun } = useLiveMeasurements(initial, '24h');
  const [error, setError] = useState<string | null>(null);

  const latest = measurements.find((m) => m.status === 'success') ?? null;

  const onRun = async () => {
    setError(null);
    try {
      await triggerRun();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'run failed');
    }
  };

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-center justify-between gap-3">
        <Badge variant="outline" className="gap-1.5">
          <span
            className={cn(
              'inline-block size-2 rounded-full',
              connected ? 'bg-latency-ok' : 'bg-latency-bad',
            )}
            aria-hidden
          />
          {connected ? 'Live' : 'Disconnected'}
        </Badge>
        <Button onClick={onRun} disabled={running}>
          {running ? (
            <>
              <Loader2 className="animate-spin" /> Running…
            </>
          ) : (
            <>
              <Play /> Run now
            </>
          )}
        </Button>
      </div>
      {error ? (
        <Alert variant="destructive">
          <AlertCircle />
          <AlertTitle>Something went wrong</AlertTitle>
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      ) : null}
      <KpiCards latest={latest} />
      <HistoryChart measurements={measurements} />
      <HistoryTable measurements={measurements.slice(0, 25)} />
    </div>
  );
}
