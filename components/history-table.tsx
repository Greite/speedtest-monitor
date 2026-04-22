'use client';

import {
  type ColumnDef,
  type ColumnFiltersState,
  flexRender,
  getCoreRowModel,
  getFilteredRowModel,
  getPaginationRowModel,
  getSortedRowModel,
  type PaginationState,
  type SortingState,
  useReactTable,
} from '@tanstack/react-table';
import { ArrowDown, ArrowUp, ArrowUpDown, ChevronLeft, ChevronRight } from 'lucide-react';
import { useMemo, useState } from 'react';
import type { NumericRange, StatusValue, TimeRange } from '@/components/table-filters';
import { TableFilters } from '@/components/table-filters';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
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

function inNumericRange(value: number | null, range: NumericRange): boolean {
  if (value == null) return false;
  if (range.min != null && value < range.min) return false;
  if (range.max != null && value > range.max) return false;
  return true;
}

const columns: ColumnDef<MeasurementDto>[] = [
  {
    id: 'timestamp',
    accessorKey: 'timestamp',
    header: 'Time',
    cell: ({ row }) => formatDateTime(row.original.timestamp),
    filterFn: (row, _id, value: TimeRange) => {
      const ts = row.original.timestamp;
      if (value.from != null && ts < value.from) return false;
      if (value.to != null && ts > value.to) return false;
      return true;
    },
  },
  {
    id: 'download',
    accessorKey: 'downloadMbps',
    header: 'Download',
    cell: ({ row }) => (
      <span className="text-speed-down">{formatMbps(row.original.downloadMbps)}</span>
    ),
    sortUndefined: 'last',
    filterFn: (row, _id, value: NumericRange) => inNumericRange(row.original.downloadMbps, value),
  },
  {
    id: 'upload',
    accessorKey: 'uploadMbps',
    header: 'Upload',
    cell: ({ row }) => <span className="text-speed-up">{formatMbps(row.original.uploadMbps)}</span>,
    sortUndefined: 'last',
    filterFn: (row, _id, value: NumericRange) => inNumericRange(row.original.uploadMbps, value),
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
    filterFn: (row, _id, value: NumericRange) =>
      inNumericRange(row.original.latencyLoadedMs, value),
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
    filterFn: (row, _id, value: string) => {
      const joined = row.original.serverLocations?.join(' | ') ?? '';
      return joined.toLowerCase().includes(value.toLowerCase());
    },
  },
  {
    id: 'status',
    accessorKey: 'status',
    header: 'Status',
    cell: ({ row }) => statusBadge(row.original.status),
    filterFn: (row, _id, value: StatusValue[]) => {
      if (!value.length) return true;
      return value.includes(row.original.status);
    },
  },
];

const PAGE_SIZES = [10, 25, 50, 100] as const;

export function HistoryTable({ measurements }: { measurements: MeasurementDto[] }) {
  const [sorting, setSorting] = useState<SortingState>([{ id: 'timestamp', desc: true }]);
  const [columnFilters, setColumnFilters] = useState<ColumnFiltersState>([]);
  const [pagination, setPagination] = useState<PaginationState>({ pageIndex: 0, pageSize: 25 });
  const data = useMemo(() => measurements, [measurements]);

  const table = useReactTable({
    data,
    columns,
    state: { sorting, columnFilters, pagination },
    onSortingChange: setSorting,
    onColumnFiltersChange: setColumnFilters,
    onPaginationChange: setPagination,
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
    getFilteredRowModel: getFilteredRowModel(),
    getPaginationRowModel: getPaginationRowModel(),
  });

  const rows = table.getRowModel().rows;
  const totalFiltered = table.getFilteredRowModel().rows.length;
  const pageIndex = table.getState().pagination.pageIndex;
  const pageSize = table.getState().pagination.pageSize;
  const firstRow = totalFiltered === 0 ? 0 : pageIndex * pageSize + 1;
  const lastRow = Math.min(totalFiltered, (pageIndex + 1) * pageSize);

  return (
    <Card>
      <CardHeader>
        <CardTitle as="h2" className="text-base">
          Recent measurements
        </CardTitle>
      </CardHeader>
      <CardContent>
        <TableFilters table={table} />
        <Table>
          <TableHeader>
            {table.getHeaderGroups().map((headerGroup) => (
              <TableRow key={headerGroup.id}>
                {headerGroup.headers.map((header) => {
                  const sortDir = header.column.getIsSorted();
                  const ariaSort =
                    sortDir === 'asc' ? 'ascending' : sortDir === 'desc' ? 'descending' : 'none';
                  return (
                    <TableHead key={header.id} aria-sort={ariaSort}>
                      <button
                        type="button"
                        onClick={header.column.getToggleSortingHandler()}
                        className="inline-flex items-center gap-1 text-left font-medium text-muted-foreground transition-colors hover:text-foreground"
                      >
                        {flexRender(header.column.columnDef.header, header.getContext())}
                        {sortDir === 'asc' ? (
                          <ArrowUp className="size-3" aria-hidden />
                        ) : sortDir === 'desc' ? (
                          <ArrowDown className="size-3" aria-hidden />
                        ) : (
                          <ArrowUpDown className="size-3 opacity-40" aria-hidden />
                        )}
                      </button>
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
        <div
          className="mt-4 flex flex-col gap-2 text-xs text-muted-foreground sm:flex-row sm:items-center sm:justify-between"
          aria-live="polite"
          aria-atomic="true"
        >
          <div>
            {totalFiltered === 0 ? 'No rows' : `Showing ${firstRow}-${lastRow} of ${totalFiltered}`}
          </div>
          <div className="flex items-center gap-4">
            <div className="flex items-center gap-2">
              <span>Rows per page</span>
              <Select value={String(pageSize)} onValueChange={(v) => table.setPageSize(Number(v))}>
                <SelectTrigger
                  size="sm"
                  className="h-7 w-[72px] text-xs"
                  aria-label="Rows per page"
                >
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {PAGE_SIZES.map((n) => (
                    <SelectItem key={n} value={String(n)}>
                      {n}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="flex items-center gap-2">
              <span>
                Page {table.getPageCount() === 0 ? 0 : pageIndex + 1} of {table.getPageCount()}
              </span>
              <Button
                variant="outline"
                size="icon-sm"
                onClick={() => table.previousPage()}
                disabled={!table.getCanPreviousPage()}
                aria-label="Previous page"
                className="md:size-7"
              >
                <ChevronLeft />
              </Button>
              <Button
                variant="outline"
                size="icon-sm"
                onClick={() => table.nextPage()}
                disabled={!table.getCanNextPage()}
                aria-label="Next page"
                className="md:size-7"
              >
                <ChevronRight />
              </Button>
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
