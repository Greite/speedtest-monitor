'use client';

import { ArrowDown, ArrowUp, Gauge, Minus, TrendingDown, TrendingUp } from 'lucide-react';
import type { ReactNode } from 'react';
import { useEffect, useMemo, useRef, useState } from 'react';
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

const levelText: Record<LatencyLevel, string> = {
  ok: 'text-latency-ok',
  warn: 'text-latency-warn',
  bad: 'text-latency-bad',
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
  measurements = [],
}: {
  latest: MeasurementDto | null;
  averages: Averages;
  busy?: boolean;
  measurements?: MeasurementDto[];
}) {
  const latencyCurrentLevel = latencyLevel(latest?.latencyLoadedMs ?? null);
  const downLevel = speedLevel(latest?.downloadMbps, averages.download);
  const upLevel = speedLevel(latest?.uploadMbps, averages.upload);

  const relative = useRelativeTime(latest?.timestamp ?? null);

  // Sparkline series, oldest -> newest, last 30 successes.
  const series = useMemo(() => {
    const successes = measurements
      .filter((m) => m.status === 'success')
      .slice(0, 30)
      .reverse();
    return {
      download: successes.map((m) => m.downloadMbps),
      upload: successes.map((m) => m.uploadMbps),
      latency: successes.map((m) => m.latencyLoadedMs),
    };
  }, [measurements]);

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
        spark={series.download}
        sparkColor="var(--color-speed-down)"
        accentDot="bg-speed-down"
        flashKey={latest?.id}
        busy={busy}
      />
      <Kpi
        label="Upload"
        icon={<ArrowUp className="size-4 text-speed-up" />}
        value={formatMbps(latest?.uploadMbps ?? null)}
        level={upLevel}
        delta={computeDelta(latest?.uploadMbps, averages.upload)}
        deltaSuffix="vs avg"
        sub={relative ?? 'No measurement yet'}
        spark={series.upload}
        sparkColor="var(--color-speed-up)"
        accentDot="bg-speed-up"
        flashKey={latest?.id}
        busy={busy}
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
        spark={series.latency}
        sparkColor={
          latencyCurrentLevel === 'bad'
            ? 'var(--color-latency-bad)'
            : latencyCurrentLevel === 'warn'
              ? 'var(--color-latency-warn)'
              : 'var(--color-latency-ok)'
        }
        accentDot={latencyCurrentLevel ? levelColor[latencyCurrentLevel] : 'bg-muted-foreground'}
        accentText={latencyCurrentLevel ? levelText[latencyCurrentLevel] : undefined}
        flashKey={latest?.id}
        busy={busy}
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
  spark,
  sparkColor,
  accentDot,
  accentText,
  flashKey,
  busy,
}: {
  label: string;
  icon: ReactNode;
  value: string;
  level: LatencyLevel | null;
  delta: Delta;
  deltaSuffix?: string;
  sub: string;
  spark: (number | null)[];
  sparkColor: string;
  accentDot: string;
  accentText?: string;
  flashKey?: number;
  busy?: boolean;
}) {
  const summary = level
    ? `${label} ${value}, status ${levelLabel[level]}. ${sub}.`
    : `${label} ${value}. ${sub}.`;

  const hasSpark = spark.filter((v): v is number => v != null).length >= 2;

  // Trigger a flash anim when a new measurement lands.
  const ref = useRef<HTMLDivElement | null>(null);
  const lastKey = useRef<number | undefined>(flashKey);
  useEffect(() => {
    if (flashKey !== lastKey.current && ref.current) {
      ref.current.classList.remove('kpi-flash');
      // force reflow so the animation re-triggers
      void ref.current.offsetWidth;
      ref.current.classList.add('kpi-flash');
      lastKey.current = flashKey;
    }
  }, [flashKey]);

  return (
    <Card
      aria-label={summary}
      className="relative gap-0 overflow-hidden border-border/60 bg-card/80 py-0 backdrop-blur-sm transition-shadow hover:shadow-md"
    >
      <div ref={ref} className="flex flex-col gap-3 px-6 pt-6 pb-4">
        <CardHeader className="px-0 pb-0">
          <CardTitle
            as="h2"
            className="flex items-center justify-between gap-2 text-[11px] font-medium uppercase tracking-[0.14em] text-muted-foreground"
          >
            <span className="flex items-center gap-2">
              {icon}
              {label}
            </span>
            {level ? (
              <span
                className="inline-flex items-center gap-1.5 normal-case tracking-normal"
                aria-hidden
              >
                <span className="relative inline-block size-2">
                  <span className={cn('absolute inset-0 rounded-full', levelColor[level])} />
                  {busy ? (
                    <span
                      className={cn(
                        'pulse-ring absolute inset-0 rounded-full',
                        accentText ?? 'text-foreground',
                      )}
                    />
                  ) : null}
                </span>
                <span className={cn('text-[11px] font-medium', accentText)}>
                  {levelLabel[level]}
                </span>
              </span>
            ) : null}
          </CardTitle>
        </CardHeader>
        <CardContent className="px-0 pb-0">
          <div
            className={cn(
              'kpi-value-gradient font-mono font-semibold tracking-tight tabular-nums',
              // Latency reads as two values, scale down a bit
              value.includes('/') ? 'text-3xl sm:text-4xl' : 'text-4xl sm:text-5xl',
            )}
            aria-hidden
          >
            {value}
          </div>
          <div className="mt-2 flex items-center gap-2 text-xs text-muted-foreground" aria-hidden>
            {delta ? <DeltaBadge delta={delta} suffix={deltaSuffix} /> : null}
            <span
              className={cn('inline-block size-1 rounded-full', accentDot, !delta && 'hidden')}
            />
            <span className="truncate">{sub}</span>
          </div>
        </CardContent>
      </div>
      {hasSpark ? (
        <div className="border-t border-border/40 bg-background/30">
          <Sparkline
            data={spark}
            color={sparkColor}
            className="pointer-events-none block h-10 w-full opacity-90"
          />
        </div>
      ) : null}
    </Card>
  );
}

function Sparkline({
  data,
  color,
  className,
}: {
  data: (number | null)[];
  color: string;
  className?: string;
}) {
  const valid = data.filter((v): v is number => v != null);
  if (valid.length < 2) return null;
  const w = 100;
  const h = 24;
  const min = Math.min(...valid);
  const max = Math.max(...valid);
  const range = max - min || 1;
  const step = w / Math.max(1, valid.length - 1);
  const points = valid.map((v, i) => {
    const x = i * step;
    const y = h - ((v - min) / range) * h;
    return `${x.toFixed(2)},${y.toFixed(2)}`;
  });
  const linePath = `M${points.join(' L')}`;
  const areaPath = `${linePath} L${w},${h} L0,${h} Z`;
  return (
    <svg
      viewBox={`0 0 ${w} ${h}`}
      preserveAspectRatio="none"
      role="presentation"
      focusable="false"
      className={className}
    >
      <defs>
        <linearGradient
          id={`spark-${color.replace(/[^a-z0-9]/gi, '')}`}
          x1="0"
          y1="0"
          x2="0"
          y2="1"
        >
          <stop offset="0%" stopColor={color} stopOpacity="0.35" />
          <stop offset="100%" stopColor={color} stopOpacity="0" />
        </linearGradient>
      </defs>
      <path d={areaPath} fill={`url(#spark-${color.replace(/[^a-z0-9]/gi, '')})`} />
      <path
        d={linePath}
        fill="none"
        stroke={color}
        strokeWidth="1"
        strokeLinecap="round"
        strokeLinejoin="round"
        vectorEffect="non-scaling-stroke"
      />
    </svg>
  );
}

function DeltaBadge({ delta, suffix }: { delta: NonNullable<Delta>; suffix?: string }) {
  if (delta.sign === 'flat') {
    return (
      <span className="inline-flex items-center gap-1 rounded-full bg-muted px-1.5 py-0.5 font-mono text-[10px] font-medium text-muted-foreground">
        <Minus className="size-3" />
        <span>~{suffix ?? ''}</span>
      </span>
    );
  }
  const Icon = delta.sign === 'up' ? TrendingUp : TrendingDown;
  const tone =
    delta.sign === 'up' ? 'bg-latency-ok/12 text-latency-ok' : 'bg-latency-bad/12 text-latency-bad';
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1 rounded-full px-1.5 py-0.5 font-mono text-[10px] font-medium tabular-nums',
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
