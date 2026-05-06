'use client';

import { LineChartIcon, TableIcon } from 'lucide-react';
import { useMemo, useState } from 'react';
import {
  Area,
  CartesianGrid,
  ComposedChart,
  Line,
  ResponsiveContainer,
  Tooltip,
  type TooltipContentProps,
  XAxis,
  YAxis,
} from 'recharts';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import {
  formatDateTime,
  formatShortDate,
  formatTime,
  type LatencyLevel,
  latencyLevel,
} from '@/lib/format';
import type { MeasurementDto } from '@/lib/types';
import { cn } from '@/lib/utils';

type Point = {
  t: number;
  label: string;
  timeLabel: string;
  dateLabel: string;
  showDate: boolean;
  download: number | null;
  upload: number | null;
  latency: number | null;
  latencyLevel: LatencyLevel | null;
  serverLocations: string[] | null;
  userLocation: string | null;
  userIp: string | null;
};

const LEVEL_STROKE: Record<LatencyLevel, string> = {
  ok: 'var(--color-latency-ok)',
  warn: 'var(--color-latency-warn)',
  bad: 'var(--color-latency-bad)',
};

export function HistoryChart({
  measurements,
  running = false,
}: {
  measurements: MeasurementDto[];
  running?: boolean;
}) {
  const [showTable, setShowTable] = useState(false);
  const data = useMemo<Point[]>(() => {
    const sorted = [...measurements].sort((a, b) => a.timestamp - b.timestamp);
    let prevDate: string | null = null;
    return sorted.map((m) => {
      const timeLabel = formatTime(m.timestamp);
      const dateLabel = formatShortDate(m.timestamp);
      const showDate = dateLabel !== prevDate;
      prevDate = dateLabel;
      return {
        t: m.timestamp,
        label: `${dateLabel} ${timeLabel}`,
        timeLabel,
        dateLabel,
        showDate,
        download: m.downloadMbps,
        upload: m.uploadMbps,
        latency: m.latencyLoadedMs,
        latencyLevel: m.latencyLoadedMs != null ? latencyLevel(m.latencyLoadedMs) : null,
        serverLocations: m.serverLocations,
        userLocation: m.userLocation,
        userIp: m.userIp,
      };
    });
  }, [measurements]);

  if (data.length === 0) {
    return (
      <Card>
        <CardHeader>
          <CardTitle as="h2" className="text-base">
            History
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex h-64 flex-col items-center justify-center gap-2 text-center">
            <LineChartIcon className="size-8 text-muted-foreground" aria-hidden />
            <p className="text-sm font-medium">No data for this range</p>
            <p className="text-xs text-muted-foreground">
              Measurements will appear here as they run.
            </p>
          </div>
        </CardContent>
      </Card>
    );
  }

  const summary = buildSummary(data);

  return (
    <Card
      className={cn(
        'relative overflow-hidden border-border/60 bg-card/80 backdrop-blur-sm transition-shadow',
        running && 'live-glow',
      )}
    >
      <CardHeader className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <CardTitle
          as="h2"
          className="flex items-center gap-2 text-[11px] font-medium uppercase tracking-[0.14em] text-muted-foreground"
        >
          <span className="size-1.5 rounded-full bg-brand" aria-hidden />
          History
        </CardTitle>
        <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-muted-foreground">
          <Legend color="var(--color-speed-down)" label="Download" />
          <Legend color="var(--color-speed-up)" label="Upload" />
          <Legend color="var(--color-latency-ok)" label="Latency" dashed />
          <Button
            type="button"
            variant="ghost"
            size="xs"
            aria-pressed={showTable}
            aria-controls="chart-data-table"
            onClick={() => setShowTable((v) => !v)}
          >
            <TableIcon aria-hidden />
            {showTable ? 'Hide table' : 'View as table'}
          </Button>
        </div>
      </CardHeader>
      <CardContent className="px-0 pb-0">
        <div
          className="relative h-64 w-full overflow-hidden"
          style={{ minWidth: 0, minHeight: 0 }}
          role="img"
          aria-label={summary}
        >
          <ResponsiveContainer width="100%" height="100%" minWidth={0} minHeight={0} debounce={50}>
            <ComposedChart data={data} margin={{ top: 8, right: 8, bottom: 0, left: 0 }}>
              <defs>
                <linearGradient id="chart-fill-down" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="var(--color-speed-down)" stopOpacity="0.28" />
                  <stop offset="100%" stopColor="var(--color-speed-down)" stopOpacity="0" />
                </linearGradient>
                <linearGradient id="chart-fill-up" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="var(--color-speed-up)" stopOpacity="0.18" />
                  <stop offset="100%" stopColor="var(--color-speed-up)" stopOpacity="0" />
                </linearGradient>
              </defs>
              <CartesianGrid
                stroke="var(--color-border)"
                strokeDasharray="3 3"
                opacity={0.45}
                vertical={false}
              />
              <XAxis
                dataKey="label"
                stroke="var(--color-muted-foreground)"
                fontSize={11}
                tickLine={false}
                axisLine={false}
                height={36}
                tick={(props) => <XAxisTick {...props} data={data} />}
              />
              <YAxis
                yAxisId="speed"
                stroke="var(--color-muted-foreground)"
                fontSize={11}
                tickLine={false}
                axisLine={false}
                width={56}
                unit=" Mbps"
                tickMargin={4}
              />
              <YAxis
                yAxisId="latency"
                orientation="right"
                stroke="var(--color-muted-foreground)"
                fontSize={11}
                tickLine={false}
                axisLine={false}
                width={48}
                unit=" ms"
                tickMargin={4}
              />
              <Tooltip
                content={ChartTooltip}
                cursor={{ stroke: 'var(--color-border)', strokeDasharray: '3 3' }}
              />
              <Area
                yAxisId="speed"
                type="monotone"
                dataKey="download"
                stroke="var(--color-speed-down)"
                strokeWidth={1.25}
                fill="url(#chart-fill-down)"
                dot={false}
                connectNulls
                isAnimationActive={false}
              />
              <Area
                yAxisId="speed"
                type="monotone"
                dataKey="upload"
                stroke="var(--color-speed-up)"
                strokeWidth={1.25}
                fill="url(#chart-fill-up)"
                dot={false}
                connectNulls
                isAnimationActive={false}
              />
              <Line
                yAxisId="latency"
                type="monotone"
                dataKey="latency"
                stroke="var(--color-latency-ok)"
                strokeWidth={1.25}
                strokeDasharray="4 3"
                connectNulls
                dot={(props) => {
                  const point = props.payload as Point | undefined;
                  const lvl = point?.latencyLevel ?? 'ok';
                  if (lvl === 'ok') return <g key={props.key} />;
                  return (
                    <circle
                      key={props.key}
                      cx={props.cx}
                      cy={props.cy}
                      r={3}
                      fill={LEVEL_STROKE[lvl]}
                      stroke="var(--color-background)"
                      strokeWidth={1}
                    />
                  );
                }}
                activeDot={{ r: 4 }}
              />
            </ComposedChart>
          </ResponsiveContainer>
        </div>
        <div
          id="chart-data-table"
          className={cn(
            'mx-6 mb-6 mt-4 max-h-64 overflow-auto rounded-md border border-border',
            !showTable && 'sr-only',
          )}
        >
          <table className="w-full text-xs tabular-nums">
            <caption className="sr-only">{summary}</caption>
            <thead className="bg-muted/40 text-left">
              <tr>
                <th scope="col" className="px-3 py-1.5 font-medium">
                  Time
                </th>
                <th scope="col" className="px-3 py-1.5 font-medium">
                  Download (Mbps)
                </th>
                <th scope="col" className="px-3 py-1.5 font-medium">
                  Upload (Mbps)
                </th>
                <th scope="col" className="px-3 py-1.5 font-medium">
                  Latency (ms)
                </th>
              </tr>
            </thead>
            <tbody>
              {data.map((p) => (
                <tr key={p.t} className="border-t border-border/60">
                  <td className="px-3 py-1">{p.label}</td>
                  <td className="px-3 py-1">{p.download ?? 'n/a'}</td>
                  <td className="px-3 py-1">{p.upload ?? 'n/a'}</td>
                  <td className="px-3 py-1">{p.latency ?? 'n/a'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </CardContent>
    </Card>
  );
}

function average(values: (number | null)[]): number | null {
  const nums = values.filter((v): v is number => v != null);
  if (nums.length === 0) return null;
  return nums.reduce((a, b) => a + b, 0) / nums.length;
}

function buildSummary(data: Point[]): string {
  const avgDown = average(data.map((p) => p.download));
  const avgUp = average(data.map((p) => p.upload));
  const avgLat = average(data.map((p) => p.latency));
  const start = data[0]?.label;
  const end = data[data.length - 1]?.label;
  const parts = [`Speed and latency history, ${data.length} measurements from ${start} to ${end}`];
  if (avgDown != null) parts.push(`average download ${avgDown.toFixed(1)} Mbps`);
  if (avgUp != null) parts.push(`average upload ${avgUp.toFixed(1)} Mbps`);
  if (avgLat != null) parts.push(`average latency ${avgLat.toFixed(0)} ms`);
  return `${parts.join(', ')}.`;
}

function Legend({ color, label, dashed }: { color: string; label: string; dashed?: boolean }) {
  return (
    <span className="flex items-center gap-1.5">
      {dashed ? (
        <span
          className="inline-block h-0.5 w-3"
          style={{
            backgroundImage: `repeating-linear-gradient(to right, ${color} 0, ${color} 3px, transparent 3px, transparent 6px)`,
          }}
        />
      ) : (
        <span className="inline-block size-2 rounded-full" style={{ background: color }} />
      )}
      {label}
    </span>
  );
}

type XAxisTickProps = {
  x?: number | string;
  y?: number | string;
  payload?: { index?: number };
  data: Point[];
};

function XAxisTick({ x = 0, y = 0, payload, data }: XAxisTickProps) {
  const idx = payload?.index;
  if (idx == null) return null;
  const point = data[idx];
  if (!point) return null;
  return (
    <g transform={`translate(${x},${y})`}>
      <text
        x={0}
        y={0}
        dy={12}
        textAnchor="middle"
        fill="var(--color-muted-foreground)"
        fontSize={11}
      >
        {point.timeLabel}
      </text>
      {point.showDate ? (
        <text
          x={0}
          y={0}
          dy={26}
          textAnchor="middle"
          fill="var(--color-muted-foreground)"
          fontSize={10}
          fontWeight={500}
        >
          {point.dateLabel}
        </text>
      ) : null}
    </g>
  );
}

function ChartTooltip({ active, payload }: TooltipContentProps) {
  if (!active || !payload?.length) return null;
  const point = payload[0]?.payload as Point | undefined;
  if (!point) return null;

  return (
    <div
      style={{
        background: 'color-mix(in oklab, var(--color-popover) 92%, transparent)',
        border: '1px solid var(--color-border)',
        borderRadius: 10,
        color: 'var(--color-popover-foreground)',
        fontSize: 12,
        padding: '10px 12px',
        backdropFilter: 'blur(8px)',
        boxShadow: '0 8px 24px -8px rgb(0 0 0 / 0.18)',
      }}
    >
      <div
        style={{
          color: 'var(--color-muted-foreground)',
          marginBottom: 6,
          fontFamily: 'var(--font-mono)',
          fontSize: 11,
          letterSpacing: '0.04em',
        }}
      >
        {formatDateTime(point.t)}
      </div>
      {payload.map((entry) => {
        const key = entry.graphicalItemId;
        const displayName = String(entry.name ?? entry.dataKey ?? '');
        return (
          <div
            key={key}
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              gap: 12,
              fontFamily: 'var(--font-mono)',
            }}
          >
            <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
              <span
                style={{
                  display: 'inline-block',
                  width: 6,
                  height: 6,
                  borderRadius: 9999,
                  background: entry.color,
                }}
              />
              <span style={{ color: 'var(--color-muted-foreground)' }}>{displayName}</span>
            </span>
            <span style={{ color: entry.color, fontVariantNumeric: 'tabular-nums' }}>
              {entry.value}
            </span>
          </div>
        );
      })}
      {(point.serverLocations || point.userLocation || point.userIp) && (
        <div
          style={{
            marginTop: 8,
            paddingTop: 8,
            borderTop: '1px solid var(--color-border)',
            color: 'var(--color-muted-foreground)',
            fontSize: 11,
          }}
        >
          {point.serverLocations?.length ? (
            <div>Server: {point.serverLocations.join(' | ')}</div>
          ) : null}
          {point.userLocation ? <div>Client: {point.userLocation}</div> : null}
          {point.userIp ? <div>IP: {point.userIp}</div> : null}
        </div>
      )}
    </div>
  );
}
