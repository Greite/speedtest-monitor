'use client';

import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import {
  formatDateTime,
  formatMbps,
  formatMs,
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

function statusBadge(status: MeasurementDto['status']) {
  if (status === 'success') return <Badge variant="secondary">OK</Badge>;
  if (status === 'timeout') return <Badge variant="outline">Timeout</Badge>;
  return <Badge variant="destructive">Error</Badge>;
}

export function HistoryTable({ measurements }: { measurements: MeasurementDto[] }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Recent measurements</CardTitle>
      </CardHeader>
      <CardContent>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Time</TableHead>
              <TableHead>Download</TableHead>
              <TableHead>Upload</TableHead>
              <TableHead>Latency (u/l)</TableHead>
              <TableHead>Server</TableHead>
              <TableHead>Status</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {measurements.length === 0 ? (
              <TableRow>
                <TableCell colSpan={6} className="py-6 text-center text-muted-foreground">
                  No measurements yet.
                </TableCell>
              </TableRow>
            ) : (
              measurements.map((m) => (
                <TableRow key={m.id} className="tabular-nums">
                  <TableCell>{formatDateTime(m.timestamp)}</TableCell>
                  <TableCell className="text-speed-down">{formatMbps(m.downloadMbps)}</TableCell>
                  <TableCell className="text-speed-up">{formatMbps(m.uploadMbps)}</TableCell>
                  <TableCell>
                    <span className="inline-flex items-center gap-2">
                      <span
                        className={cn(
                          'inline-block size-2 rounded-full',
                          levelColor[latencyLevel(m.latencyLoadedMs)],
                        )}
                        aria-hidden
                      />
                      {formatMs(m.latencyUnloadedMs)} / {formatMs(m.latencyLoadedMs)}
                    </span>
                  </TableCell>
                  <TableCell className="text-xs text-muted-foreground">
                    {m.serverLocations?.join(' | ') ?? '-'}
                  </TableCell>
                  <TableCell>{statusBadge(m.status)}</TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </CardContent>
    </Card>
  );
}
