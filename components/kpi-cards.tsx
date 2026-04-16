'use client';

import { ArrowDown, ArrowUp, Gauge } from 'lucide-react';
import type { ReactNode } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { formatMbps, formatMs, type LatencyLevel, latencyLevel } from '@/lib/format';
import type { MeasurementDto } from '@/lib/types';
import { cn } from '@/lib/utils';

const levelColor: Record<LatencyLevel, string> = {
  ok: 'bg-latency-ok',
  warn: 'bg-latency-warn',
  bad: 'bg-latency-bad',
};

export function KpiCards({ latest }: { latest: MeasurementDto | null }) {
  const level = latencyLevel(latest?.latencyLoadedMs ?? null);
  return (
    <section className="grid grid-cols-1 gap-4 md:grid-cols-3">
      <Kpi
        label="Download"
        icon={<ArrowDown className="size-4 text-speed-down" />}
        value={formatMbps(latest?.downloadMbps ?? null)}
        sub="last measurement"
      />
      <Kpi
        label="Upload"
        icon={<ArrowUp className="size-4 text-speed-up" />}
        value={formatMbps(latest?.uploadMbps ?? null)}
        sub="last measurement"
      />
      <Kpi
        label="Latency"
        icon={
          <span className="relative inline-flex items-center gap-1.5">
            <Gauge className="size-4 text-muted-foreground" />
            <span
              className={cn('inline-block size-2 rounded-full', levelColor[level])}
              aria-hidden
            />
          </span>
        }
        value={
          latest
            ? `${formatMs(latest.latencyUnloadedMs)} / ${formatMs(latest.latencyLoadedMs)}`
            : '—'
        }
        sub="unloaded / loaded"
      />
    </section>
  );
}

function Kpi({
  label,
  icon,
  value,
  sub,
}: {
  label: string;
  icon: ReactNode;
  value: string;
  sub: string;
}) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-sm font-normal text-muted-foreground">
          {icon}
          {label}
        </CardTitle>
      </CardHeader>
      <CardContent>
        <div className="text-3xl font-bold tracking-tight tabular-nums">{value}</div>
        <div className="mt-1 text-xs text-muted-foreground">{sub}</div>
      </CardContent>
    </Card>
  );
}
