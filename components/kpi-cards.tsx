'use client';

import { ArrowDown, ArrowUp, Gauge, Minus, TrendingDown, TrendingUp } from 'lucide-react';
import type { ReactNode } from 'react';
import { useEffect, useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import {
  computeDelta,
  type Delta,
  formatMbps,
  formatMs,
  formatRelativeTime,
  type LatencyLevel,
  latencyLevel,
} from '@/lib/format';
import type { MeasurementDto } from '@/lib/types';
import { cn } from '@/lib/utils';

const levelColor: Record<LatencyLevel, string> = {
  ok: 'bg-latency-ok',
  warn: 'bg-latency-warn',
  bad: 'bg-latency-bad',
};

const levelLabel: Record<LatencyLevel, string> = {
  ok: 'Good',
  warn: 'Fair',
  bad: 'Poor',
};

type Averages = {
  download: number | null;
  upload: number | null;
  latency: number | null;
};

function useRelativeTime(timestamp: number | null) {
  const [rendered, setRendered] = useState<string | null>(
    timestamp ? formatRelativeTime(timestamp) : null,
  );
  useEffect(() => {
    if (timestamp == null) {
      setRendered(null);
      return;
    }
    setRendered(formatRelativeTime(timestamp));
    const id = setInterval(() => setRendered(formatRelativeTime(timestamp)), 30_000);
    return () => clearInterval(id);
  }, [timestamp]);
  return rendered;
}

// Speed health: >= average + 10% is good, <= average - 20% is bad.
function speedLevel(value: number | null | undefined, average: number | null): LatencyLevel | null {
  if (value == null || average == null || average === 0) return null;
  const ratio = value / average;
  if (ratio >= 0.95) return 'ok';
  if (ratio >= 0.7) return 'warn';
  return 'bad';
}

export function KpiCards({
  latest,
  averages,
  busy = false,
}: {
  latest: MeasurementDto | null;
  averages: Averages;
  busy?: boolean;
}) {
  const latencyCurrentLevel = latencyLevel(latest?.latencyLoadedMs ?? null);
  const downLevel = speedLevel(latest?.downloadMbps, averages.download);
  const upLevel = speedLevel(latest?.uploadMbps, averages.upload);

  const relative = useRelativeTime(latest?.timestamp ?? null);

  return (
    <section
      aria-label="Key performance indicators"
      aria-live="polite"
      aria-atomic="false"
      aria-busy={busy || undefined}
      className="grid grid-cols-1 gap-4 md:grid-cols-3"
    >
      <Kpi
        label="Download"
        icon={<ArrowDown className="size-4 text-speed-down" />}
        value={formatMbps(latest?.downloadMbps ?? null)}
        level={downLevel}
        delta={computeDelta(latest?.downloadMbps, averages.download)}
        deltaSuffix="vs avg"
        sub={relative ?? 'No measurement yet'}
      />
      <Kpi
        label="Upload"
        icon={<ArrowUp className="size-4 text-speed-up" />}
        value={formatMbps(latest?.uploadMbps ?? null)}
        level={upLevel}
        delta={computeDelta(latest?.uploadMbps, averages.upload)}
        deltaSuffix="vs avg"
        sub={relative ?? 'No measurement yet'}
      />
      <Kpi
        label="Latency"
        icon={<Gauge className="size-4 text-muted-foreground" />}
        value={
          latest
            ? `${formatMs(latest.latencyUnloadedMs)} / ${formatMs(latest.latencyLoadedMs)}`
            : '—'
        }
        level={latest ? latencyCurrentLevel : null}
        delta={null}
        sub="unloaded / loaded"
      />
    </section>
  );
}

function Kpi({
  label,
  icon,
  value,
  level,
  delta,
  deltaSuffix,
  sub,
}: {
  label: string;
  icon: ReactNode;
  value: string;
  level: LatencyLevel | null;
  delta: Delta;
  deltaSuffix?: string;
  sub: string;
}) {
  const summary = level
    ? `${label} ${value}, status ${levelLabel[level]}. ${sub}.`
    : `${label} ${value}. ${sub}.`;

  return (
    <Card aria-label={summary}>
      <CardHeader>
        <CardTitle
          as="h2"
          className="flex items-center justify-between gap-2 text-sm font-normal text-muted-foreground"
        >
          <span className="flex items-center gap-2">
            {icon}
            {label}
          </span>
          {level ? (
            <span className="inline-flex items-center gap-1.5 text-xs" aria-hidden>
              <span
                className={cn('inline-block size-2 rounded-full', levelColor[level])}
                aria-hidden
              />
              <span>{levelLabel[level]}</span>
            </span>
          ) : null}
        </CardTitle>
      </CardHeader>
      <CardContent>
        <div className="text-3xl font-bold tracking-tight tabular-nums" aria-hidden>
          {value}
        </div>
        <div className="mt-1 flex items-center gap-2 text-xs text-muted-foreground" aria-hidden>
          {delta ? <DeltaBadge delta={delta} suffix={deltaSuffix} /> : null}
          <span>{sub}</span>
        </div>
      </CardContent>
    </Card>
  );
}

function DeltaBadge({ delta, suffix }: { delta: NonNullable<Delta>; suffix?: string }) {
  if (delta.sign === 'flat') {
    return (
      <span className="inline-flex items-center gap-1 rounded-full bg-muted px-1.5 py-0.5 text-[10px] font-medium text-muted-foreground">
        <Minus className="size-3" />
        <span>~{suffix ?? ''}</span>
      </span>
    );
  }
  const Icon = delta.sign === 'up' ? TrendingUp : TrendingDown;
  const tone =
    delta.sign === 'up' ? 'bg-latency-ok/10 text-latency-ok' : 'bg-latency-bad/10 text-latency-bad';
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1 rounded-full px-1.5 py-0.5 text-[10px] font-medium tabular-nums',
        tone,
      )}
    >
      <Icon className="size-3" aria-hidden />
      <span>
        {delta.percent.toFixed(0)}%{suffix ? ` ${suffix}` : ''}
      </span>
    </span>
  );
}
