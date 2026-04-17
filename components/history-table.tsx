'use client';

import {
  type ColumnDef,
  type ColumnFiltersState,
  flexRender,
  getCoreRowModel,
  getFilteredRowModel,
  getSortedRowModel,
  type SortingState,
  useReactTable,
} from '@tanstack/react-table';
import { ArrowDown, ArrowUp, ArrowUpDown } from 'lucide-react';
import { useMemo, useState } from 'react';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
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

function statusLabel(status: MeasurementDto['status']): string {
  if (status === 'success') return 'OK';
  if (status === 'timeout') return 'Timeout';
  return 'Error';
}

const columns: ColumnDef<MeasurementDto>[] = [
  {
    id: 'timestamp',
    accessorKey: 'timestamp',
    header: 'Time',
    cell: ({ row }) => formatDateTime(row.original.timestamp),
    filterFn: (row, _id, value) =>
      formatDateTime(row.original.timestamp).toLowerCase().includes(String(value).toLowerCase()),
  },
  {
    id: 'download',
    accessorKey: 'downloadMbps',
    header: 'Download',
    cell: ({ row }) => (
      <span className="text-speed-down">{formatMbps(row.original.downloadMbps)}</span>
    ),
    sortUndefined: 'last',
    filterFn: (row, _id, value) =>
      formatMbps(row.original.downloadMbps).toLowerCase().includes(String(value).toLowerCase()),
  },
  {
    id: 'upload',
    accessorKey: 'uploadMbps',
    header: 'Upload',
    cell: ({ row }) => <span className="text-speed-up">{formatMbps(row.original.uploadMbps)}</span>,
    sortUndefined: 'last',
    filterFn: (row, _id, value) =>
      formatMbps(row.original.uploadMbps).toLowerCase().includes(String(value).toLowerCase()),
  },
  {
    id: 'latency',
    accessorKey: 'latencyLoadedMs',
    header: 'Latency (u/l)',
    cell: ({ row }) => (
      <span className="inline-flex items-center gap-2">
        <span
          className={cn(
            'inline-block size-2 rounded-full',
            levelColor[latencyLevel(row.original.latencyLoadedMs)],
          )}
          aria-hidden
        />
        {formatMs(row.original.latencyUnloadedMs)} / {formatMs(row.original.latencyLoadedMs)}
      </span>
    ),
    sortUndefined: 'last',
    filterFn: (row, _id, value) => {
      const text = `${formatMs(row.original.latencyUnloadedMs)} / ${formatMs(row.original.latencyLoadedMs)}`;
      return text.toLowerCase().includes(String(value).toLowerCase());
    },
  },
  {
    id: 'server',
    accessorFn: (row) => row.serverLocations?.join(' | ') ?? '',
    header: 'Server',
    cell: ({ row }) => (
      <span className="text-xs text-muted-foreground">
        {row.original.serverLocations?.join(' | ') ?? '-'}
      </span>
    ),
    filterFn: 'includesString',
  },
  {
    id: 'status',
    accessorKey: 'status',
    header: 'Status',
    cell: ({ row }) => statusBadge(row.original.status),
    filterFn: (row, _id, value) =>
      statusLabel(row.original.status).toLowerCase().includes(String(value).toLowerCase()),
  },
];

export function HistoryTable({ measurements }: { measurements: MeasurementDto[] }) {
  const [sorting, setSorting] = useState<SortingState>([{ id: 'timestamp', desc: true }]);
  const [columnFilters, setColumnFilters] = useState<ColumnFiltersState>([]);
  const data = useMemo(() => measurements, [measurements]);

  const table = useReactTable({
    data,
    columns,
    state: { sorting, columnFilters },
    onSortingChange: setSorting,
    onColumnFiltersChange: setColumnFilters,
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
    getFilteredRowModel: getFilteredRowModel(),
  });

  const rows = table.getRowModel().rows;

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Recent measurements</CardTitle>
      </CardHeader>
      <CardContent>
        <Table>
          <TableHeader>
            {table.getHeaderGroups().map((headerGroup) => (
              <TableRow key={headerGroup.id}>
                {headerGroup.headers.map((header) => {
                  const sortDir = header.column.getIsSorted();
                  return (
                    <TableHead key={header.id} className="align-top">
                      <div className="flex flex-col gap-1">
                        <button
                          type="button"
                          onClick={header.column.getToggleSortingHandler()}
                          className="inline-flex items-center gap-1 text-left font-medium text-muted-foreground transition-colors hover:text-foreground"
                        >
                          {flexRender(header.column.columnDef.header, header.getContext())}
                          {sortDir === 'asc' ? (
                            <ArrowUp className="size-3" />
                          ) : sortDir === 'desc' ? (
                            <ArrowDown className="size-3" />
                          ) : (
                            <ArrowUpDown className="size-3 opacity-40" />
                          )}
                        </button>
                        <Input
                          type="text"
                          value={(header.column.getFilterValue() as string) ?? ''}
                          onChange={(e) => header.column.setFilterValue(e.target.value)}
                          placeholder="Filter…"
                          className="h-7 text-xs"
                        />
                      </div>
                    </TableHead>
                  );
                })}
              </TableRow>
            ))}
          </TableHeader>
          <TableBody>
            {rows.length === 0 ? (
              <TableRow>
                <TableCell
                  colSpan={columns.length}
                  className="py-6 text-center text-muted-foreground"
                >
                  {measurements.length === 0 ? 'No measurements yet.' : 'No rows match filters.'}
                </TableCell>
              </TableRow>
            ) : (
              rows.map((row) => (
                <TableRow key={row.id} className="tabular-nums">
                  {row.getVisibleCells().map((cell) => (
                    <TableCell key={cell.id}>
                      {flexRender(cell.column.columnDef.cell, cell.getContext())}
                    </TableCell>
                  ))}
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </CardContent>
    </Card>
  );
}
