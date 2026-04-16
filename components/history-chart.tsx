'use client';

import { useMemo } from 'react';
import {
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { formatTime } from '@/lib/format';
import type { MeasurementDto } from '@/lib/types';

type Point = {
  t: number;
  label: string;
  download: number | null;
  upload: number | null;
  latency: number | null;
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
      }));
  }, [measurements]);

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between">
        <CardTitle className="text-base">History</CardTitle>
        <div className="flex items-center gap-4 text-xs text-muted-foreground">
          <Legend color="var(--color-speed-down)" label="Download" />
          <Legend color="var(--color-speed-up)" label="Upload" />
          <Legend color="var(--color-latency-ok)" label="Latency" />
        </div>
      </CardHeader>
      <CardContent>
        <div className="h-64 w-full" style={{ minWidth: 0, minHeight: 0 }}>
          <ResponsiveContainer width="100%" height="100%" minWidth={0} minHeight={0} debounce={50}>
            <LineChart data={data} margin={{ top: 8, right: 16, bottom: 0, left: -8 }}>
              <CartesianGrid stroke="var(--color-border)" strokeDasharray="3 3" />
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
              <Tooltip
                contentStyle={{
                  background: 'var(--color-popover)',
                  border: '1px solid var(--color-border)',
                  borderRadius: 8,
                  color: 'var(--color-popover-foreground)',
                  fontSize: 12,
                }}
                labelStyle={{ color: 'var(--color-muted-foreground)' }}
              />
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
                dot={false}
                strokeWidth={2}
                strokeDasharray="4 3"
                connectNulls
              />
            </LineChart>
          </ResponsiveContainer>
        </div>
      </CardContent>
    </Card>
  );
}

function Legend({ color, label }: { color: string; label: string }) {
  return (
    <span className="flex items-center gap-1.5">
      <span className="inline-block size-2 rounded-full" style={{ background: color }} />
      {label}
    </span>
  );
}
