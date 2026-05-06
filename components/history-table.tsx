'use client';

import {
  type ColumnDef,
  type ColumnFiltersState,
  flexRender,
  getCoreRowModel,
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
  TableCaption,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { useTableMeasurements } from '@/components/use-table-measurements';
import {
  formatDateTime,
  formatMbps,
  formatMs,
  formatRelativeTime,
  type LatencyLevel,
  latencyLevel,
} from '@/lib/format';
import type {
  SortColumn,
  TableFilters as TableFiltersType,
  TableQuery,
} from '@/lib/measurements-query';
import type { MeasurementDto } from '@/lib/types';
import { cn } from '@/lib/utils';

const levelColor: Record<LatencyLevel, string> = {
  ok: 'bg-latency-ok',
  warn: 'bg-latency-warn',
  bad: 'bg-latency-bad',
};

function statusBadge(status: MeasurementDto['status']) {
  if (status === 'success') {
    return (
      <Badge className="border-latency-ok/30 bg-latency-ok/10 text-latency-ok hover:bg-latency-ok/15">
        <span className="size-1.5 rounded-full bg-latency-ok" aria-hidden />
        OK
      </Badge>
    );
  }
  if (status === 'timeout') {
    return (
      <Badge className="border-latency-warn/30 bg-latency-warn/10 text-latency-warn hover:bg-latency-warn/15">
        <span className="size-1.5 rounded-full bg-latency-warn" aria-hidden />
        Timeout
      </Badge>
    );
  }
  return (
    <Badge className="border-destructive/30 bg-destructive/10 text-destructive hover:bg-destructive/15">
      <span className="size-1.5 rounded-full bg-destructive" aria-hidden />
      Error
    </Badge>
  );
}

function TimeCell({ ts }: { ts: number }) {
  return (
    <span title={formatDateTime(ts)} className="font-mono text-xs">
      <span className="text-foreground">{formatRelativeTime(ts)}</span>
      <span className="ml-2 text-muted-foreground">{formatDateTime(ts)}</span>
    </span>
  );
}

const columns: ColumnDef<MeasurementDto>[] = [
  {
    id: 'timestamp',
    accessorKey: 'timestamp',
    header: 'Time',
    cell: ({ row }) => <TimeCell ts={row.original.timestamp} />,
    enableSorting: true,
  },
  {
    id: 'download',
    accessorKey: 'downloadMbps',
    header: 'Download',
    cell: ({ row }) => (
      <span className="font-mono text-speed-down">{formatMbps(row.original.downloadMbps)}</span>
    ),
    enableSorting: true,
  },
  {
    id: 'upload',
    accessorKey: 'uploadMbps',
    header: 'Upload',
    cell: ({ row }) => (
      <span className="font-mono text-speed-up">{formatMbps(row.original.uploadMbps)}</span>
    ),
    enableSorting: true,
  },
  {
    id: 'latency',
    accessorKey: 'latencyLoadedMs',
    header: 'Latency (u/l)',
    cell: ({ row }) => (
      <span className="inline-flex items-center gap-2 font-mono">
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
    enableSorting: true,
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
    enableSorting: false,
  },
  {
    id: 'status',
    accessorKey: 'status',
    header: 'Status',
    cell: ({ row }) => statusBadge(row.original.status),
    enableSorting: true,
  },
];

const PAGE_SIZES = [10, 25, 50, 100] as const;

const COLUMN_TO_SORT: Record<string, SortColumn> = {
  timestamp: 'timestamp',
  download: 'downloadMbps',
  upload: 'uploadMbps',
  latency: 'latencyLoadedMs',
  status: 'status',
};

function buildFiltersFromState(columnFilters: ColumnFiltersState): TableFiltersType {
  const out: TableFiltersType = {};
  for (const f of columnFilters) {
    if (f.id === 'timestamp') {
      const v = f.value as TimeRange;
      if (v.from != null || v.to != null) {
        out.time = {
          ...(v.from != null ? { from: v.from } : {}),
          ...(v.to != null ? { to: v.to } : {}),
        };
      }
    } else if (f.id === 'download') {
      const v = f.value as NumericRange;
      if (v.min != null || v.max != null) {
        out.download = {
          ...(v.min != null ? { min: v.min } : {}),
          ...(v.max != null ? { max: v.max } : {}),
        };
      }
    } else if (f.id === 'upload') {
      const v = f.value as NumericRange;
      if (v.min != null || v.max != null) {
        out.upload = {
          ...(v.min != null ? { min: v.min } : {}),
          ...(v.max != null ? { max: v.max } : {}),
        };
      }
    } else if (f.id === 'latency') {
      const v = f.value as NumericRange;
      if (v.min != null || v.max != null) {
        out.latency = {
          ...(v.min != null ? { min: v.min } : {}),
          ...(v.max != null ? { max: v.max } : {}),
        };
      }
    } else if (f.id === 'server') {
      const v = f.value as string;
      if (v) out.server = v;
    } else if (f.id === 'status') {
      const v = f.value as StatusValue[];
      if (v.length > 0) out.status = v;
    }
  }
  return out;
}

export function HistoryTable({ refreshSignal }: { refreshSignal: number | null }) {
  const [sorting, setSorting] = useState<SortingState>([{ id: 'timestamp', desc: true }]);
  const [columnFilters, setColumnFilters] = useState<ColumnFiltersState>([]);
  const [pagination, setPagination] = useState<PaginationState>({ pageIndex: 0, pageSize: 25 });

  const query = useMemo<TableQuery>(() => {
    const s = sorting[0];
    const sortId = s?.id ?? 'timestamp';
    const sort: SortColumn = COLUMN_TO_SORT[sortId] ?? 'timestamp';
    return {
      page: pagination.pageIndex + 1,
      pageSize: pagination.pageSize,
      sort,
      sortDir: s?.desc ? 'desc' : 'asc',
      filters: buildFiltersFromState(columnFilters),
    };
  }, [sorting, columnFilters, pagination]);

  const { measurements, totalCount, loading } = useTableMeasurements(query, refreshSignal);

  const pageCount = Math.max(1, Math.ceil(totalCount / pagination.pageSize));

  const table = useReactTable({
    data: measurements,
    columns,
    state: { sorting, columnFilters, pagination },
    manualSorting: true,
    manualFiltering: true,
    manualPagination: true,
    pageCount,
    onSortingChange: (updater) => {
      setSorting(updater);
      setPagination((p) => ({ ...p, pageIndex: 0 }));
    },
    onColumnFiltersChange: (updater) => {
      setColumnFilters(updater);
      setPagination((p) => ({ ...p, pageIndex: 0 }));
    },
    onPaginationChange: setPagination,
    getCoreRowModel: getCoreRowModel(),
  });

  const rows = table.getRowModel().rows;
  const pageIndex = pagination.pageIndex;
  const pageSize = pagination.pageSize;
  const firstRow = totalCount === 0 ? 0 : pageIndex * pageSize + 1;
  const lastRow = Math.min(totalCount, (pageIndex + 1) * pageSize);

  return (
    <Card className="border-border/60 bg-card/80 backdrop-blur-sm">
      <CardHeader>
        <CardTitle
          as="h2"
          className="flex items-center gap-2 text-[11px] font-medium uppercase tracking-[0.14em] text-muted-foreground"
        >
          <span className="size-1.5 rounded-full bg-brand" aria-hidden />
          Recent measurements
        </CardTitle>
      </CardHeader>
      <CardContent>
        <TableFilters table={table} />
        <Table>
          <TableCaption className="sr-only">
            Recent speedtest measurements, sortable and filterable.
          </TableCaption>
          <TableHeader>
            {table.getHeaderGroups().map((headerGroup) => (
              <TableRow key={headerGroup.id}>
                {headerGroup.headers.map((header) => {
                  const sortDir = header.column.getIsSorted();
                  const ariaSort =
                    sortDir === 'asc' ? 'ascending' : sortDir === 'desc' ? 'descending' : 'none';
                  const canSort = header.column.getCanSort();
                  return (
                    <TableHead key={header.id} aria-sort={ariaSort}>
                      {canSort ? (
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
                      ) : (
                        <span className="font-medium text-muted-foreground">
                          {flexRender(header.column.columnDef.header, header.getContext())}
                        </span>
                      )}
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
                  {loading
                    ? 'Loading...'
                    : totalCount === 0
                      ? 'No measurements.'
                      : 'No rows match filters.'}
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
            {totalCount === 0 ? 'No rows' : `Showing ${firstRow}-${lastRow} of ${totalCount}`}
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
                Page {totalCount === 0 ? 0 : pageIndex + 1} of {pageCount}
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
