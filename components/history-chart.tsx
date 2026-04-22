'use client';

import { LineChartIcon } from 'lucide-react';
import { useMemo } from 'react';
import {
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  type TooltipContentProps,
  XAxis,
  YAxis,
} from 'recharts';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { formatTime, type LatencyLevel, latencyLevel } from '@/lib/format';
import type { MeasurementDto } from '@/lib/types';

type Point = {
  t: number;
  label: string;
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

export function HistoryChart({ measurements }: { measurements: MeasurementDto[] }) {
  const data = useMemo<Point[]>(() => {
    return [...measurements]
      .sort((a, b) => a.timestamp - b.timestamp)
      .map((m) => ({
        t: m.timestamp,
        label: formatTime(m.timestamp),
        download: m.downloadMbps,
        upload: m.uploadMbps,
        latency: m.latencyLoadedMs,
        latencyLevel: m.latencyLoadedMs != null ? latencyLevel(m.latencyLoadedMs) : null,
        serverLocations: m.serverLocations,
        userLocation: m.userLocation,
        userIp: m.userIp,
      }));
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
    <Card>
      <CardHeader className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <CardTitle as="h2" className="text-base">
          History
        </CardTitle>
        <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-muted-foreground">
          <Legend color="var(--color-speed-down)" label="Download" />
          <Legend color="var(--color-speed-up)" label="Upload" />
          <Legend color="var(--color-latency-ok)" label="Latency" dashed />
        </div>
      </CardHeader>
      <CardContent>
        <div
          className="h-64 w-full"
          style={{ minWidth: 0, minHeight: 0 }}
          role="img"
          aria-label={summary}
        >
          <ResponsiveContainer width="100%" height="100%" minWidth={0} minHeight={0} debounce={50}>
            <LineChart data={data} margin={{ top: 8, right: 16, bottom: 0, left: -8 }}>
              <CartesianGrid stroke="var(--color-border)" strokeDasharray="3 3" opacity={0.5} />
              <XAxis
                dataKey="label"
                stroke="var(--color-muted-foreground)"
                fontSize={11}
                tickLine={false}
                axisLine={false}
              />
              <YAxis
                yAxisId="speed"
                stroke="var(--color-muted-foreground)"
                fontSize={11}
                tickLine={false}
                axisLine={false}
                width={48}
                unit=" Mbps"
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
              />
              <Tooltip content={ChartTooltip} />
              <Line
                yAxisId="speed"
                type="monotone"
                dataKey="download"
                stroke="var(--color-speed-down)"
                dot={false}
                strokeWidth={2}
                connectNulls
              />
              <Line
                yAxisId="speed"
                type="monotone"
                dataKey="upload"
                stroke="var(--color-speed-up)"
                dot={false}
                strokeWidth={2}
                connectNulls
              />
              <Line
                yAxisId="latency"
                type="monotone"
                dataKey="latency"
                stroke="var(--color-latency-ok)"
                strokeWidth={2}
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
            </LineChart>
          </ResponsiveContainer>
        </div>
        <table className="sr-only">
          <caption>{summary}</caption>
          <thead>
            <tr>
              <th scope="col">Time</th>
              <th scope="col">Download (Mbps)</th>
              <th scope="col">Upload (Mbps)</th>
              <th scope="col">Latency (ms)</th>
            </tr>
          </thead>
          <tbody>
            {data.map((p) => (
              <tr key={p.t}>
                <td>{p.label}</td>
                <td>{p.download ?? 'n/a'}</td>
                <td>{p.upload ?? 'n/a'}</td>
                <td>{p.latency ?? 'n/a'}</td>
              </tr>
            ))}
          </tbody>
        </table>
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

function ChartTooltip({ active, payload, label }: TooltipContentProps) {
  if (!active || !payload?.length) return null;
  const point = payload[0]?.payload as Point | undefined;
  if (!point) return null;

  return (
    <div
      style={{
        background: 'var(--color-popover)',
        border: '1px solid var(--color-border)',
        borderRadius: 8,
        color: 'var(--color-popover-foreground)',
        fontSize: 12,
        padding: '8px 10px',
      }}
    >
      <div style={{ color: 'var(--color-muted-foreground)', marginBottom: 4 }}>{label}</div>
      {payload.map((entry) => {
        const key = entry.graphicalItemId;
        const displayName = String(entry.name ?? entry.dataKey ?? '');
        return (
          <div key={key} style={{ color: entry.color }}>
            {displayName}: {entry.value}
          </div>
        );
      })}
      {(point.serverLocations || point.userLocation || point.userIp) && (
        <div
          style={{
            marginTop: 6,
            paddingTop: 6,
            borderTop: '1px solid var(--color-border)',
            color: 'var(--color-muted-foreground)',
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
