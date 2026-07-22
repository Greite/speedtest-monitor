'use client';

import { Card } from '@astryxdesign/core/Card';
import { IconButton } from '@astryxdesign/core/IconButton';
import { Selector } from '@astryxdesign/core/Selector';
import {
  pixel,
  proportional,
  Table,
  type TableColumn,
  type TableSortState,
  useTableSortable,
} from '@astryxdesign/core/Table';
import { Heading } from '@astryxdesign/core/Text';
import { Token } from '@astryxdesign/core/Token';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { useMemo, useState } from 'react';

import { TableFilters } from '@/components/table-filters';
import { useTableMeasurements } from '@/components/use-table-measurements';
import {
  formatDateTime,
  formatMbps,
  formatMs,
  formatRelativeTime,
  type LatencyLevel,
  latencyLevel,
} from '@/lib/format';
import type { SortColumn, TableFilters as TableFiltersType, TableQuery } from '@/lib/measurements-query';
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

function statusToken(status: MeasurementDto['status']) {
  if (status === 'success') {
    return <Token label="OK" color="green" size="sm" />;
  }
  if (status === 'timeout') {
    return <Token label="Timeout" color="yellow" size="sm" />;
  }
  return <Token label="Error" color="red" size="sm" />;
}

function TimeCell({ ts }: { ts: number }) {
  return (
    <span title={formatDateTime(ts)} className="font-mono text-xs">
      <span className="text-foreground">{formatRelativeTime(ts)}</span>
      <span className="ml-2 text-muted-foreground">{formatDateTime(ts)}</span>
    </span>
  );
}

function LatencyCell({ m }: { m: MeasurementDto }) {
  const lvl = latencyLevel(m.latencyLoadedMs);
  const lvlLabel = levelLabel[lvl];
  return (
    <span className="inline-flex items-center gap-2 font-mono">
      <span
        className={cn('inline-block size-2 rounded-full', levelColor[lvl])}
        aria-hidden
        title={`Latency: ${lvlLabel}`}
      />
      <span className="sr-only">{`Latency ${lvlLabel}, `}</span>
      {formatMs(m.latencyUnloadedMs)} / {formatMs(m.latencyLoadedMs)}
    </span>
  );
}

const columns: TableColumn<MeasurementDto>[] = [
  {
    key: 'timestamp',
    header: 'Time',
    width: proportional(2),
    sortable: { sortKey: 'timestamp' },
    renderCell: (m) => <TimeCell ts={m.timestamp} />,
  },
  {
    key: 'download',
    header: 'Download',
    width: proportional(1),
    sortable: { sortKey: 'downloadMbps' },
    renderCell: (m) => <span className="font-mono text-speed-down">{formatMbps(m.downloadMbps)}</span>,
  },
  {
    key: 'upload',
    header: 'Upload',
    width: proportional(1),
    sortable: { sortKey: 'uploadMbps' },
    renderCell: (m) => <span className="font-mono text-speed-up">{formatMbps(m.uploadMbps)}</span>,
  },
  {
    key: 'latency',
    header: 'Latency (u/l)',
    width: proportional(1.5),
    sortable: { sortKey: 'latencyLoadedMs' },
    renderCell: (m) => <LatencyCell m={m} />,
  },
  {
    key: 'server',
    header: 'Server',
    width: proportional(1),
    renderCell: (m) => <span className="text-xs text-muted-foreground">{m.serverLocations?.join(' | ') ?? '-'}</span>,
  },
  {
    key: 'status',
    header: 'Status',
    width: pixel(96),
    sortable: { sortKey: 'status' },
    renderCell: (m) => statusToken(m.status),
  },
];

const PAGE_SIZES = [10, 25, 50, 100] as const;

export function HistoryTable({ refreshSignal }: { refreshSignal: number | null }) {
  const [sort, setSort] = useState<{ column: SortColumn; dir: 'asc' | 'desc' }>({ column: 'timestamp', dir: 'desc' });
  const [filters, setFilters] = useState<TableFiltersType>({});
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(25);

  const query = useMemo<TableQuery>(
    () => ({ page, pageSize, sort: sort.column, sortDir: sort.dir, filters }),
    [page, pageSize, sort, filters],
  );

  const { measurements, totalCount, loading } = useTableMeasurements(query, refreshSignal);
  const pageCount = Math.max(1, Math.ceil(totalCount / pageSize));

  const firstRow = totalCount === 0 ? 0 : (page - 1) * pageSize + 1;
  const lastRow = Math.min(totalCount, page * pageSize);

  // Headless sort plugin: consumer (this component) owns the sort state and
  // forwards it to the server via `query` - the plugin only renders the
  // clickable header affordance and aria-sort, it never sorts data itself.
  // allowUnsortedState is false so the sort array always has exactly one
  // entry, matching TableQuery.sort/sortDir (both mandatory, non-optional).
  const sortEntries = useMemo<TableSortState<SortColumn>>(
    () => [{ sortKey: sort.column, direction: sort.dir === 'asc' ? 'ascending' : 'descending' }],
    [sort],
  );
  const sortable = useTableSortable<MeasurementDto, SortColumn>({
    sort: sortEntries,
    onSortChange: (next) => {
      const entry = next[0];
      if (!entry) {
        return;
      }
      setSort({ column: entry.sortKey, dir: entry.direction === 'ascending' ? 'asc' : 'desc' });
      setPage(1);
    },
    allowUnsortedState: false,
  });

  return (
    <Card padding={0} className="flex flex-col gap-6 overflow-hidden py-6">
      <div className="px-6">
        <Heading level={2} className="label-eyebrow flex items-center gap-2">
          <span className="size-1.5 rounded-full bg-brand" aria-hidden />
          Recent measurements
        </Heading>
      </div>
      <div className="flex flex-col gap-4 px-6">
        <TableFilters
          value={filters}
          onChange={(next) => {
            setFilters(next);
            setPage(1);
          }}
        />
        {measurements.length === 0 ? (
          <div className="py-6 text-center text-muted-foreground" role="status">
            {loading && 'Loading...'}
            {!loading && totalCount === 0 && 'No measurements.'}
            {!loading && totalCount !== 0 && 'No rows match filters.'}
          </div>
        ) : (
          <Table
            data={measurements}
            columns={columns}
            idKey="id"
            plugins={{ sort: sortable }}
            density="compact"
            className="tabular-nums"
            aria-label="Recent speedtest measurements, sortable and filterable."
          />
        )}
        <div
          className="flex flex-col gap-2 text-xs tabular-nums text-muted-foreground sm:flex-row sm:items-center sm:justify-between"
          aria-live="polite"
          aria-atomic="true"
        >
          <div>{totalCount === 0 ? 'No rows' : `Showing ${firstRow}-${lastRow} of ${totalCount}`}</div>
          <div className="flex items-center gap-4">
            <Selector
              label="Rows per page"
              isLabelHidden
              size="sm"
              options={PAGE_SIZES.map((n) => String(n))}
              value={String(pageSize)}
              onChange={(v) => {
                setPageSize(Number(v));
                setPage(1);
              }}
            />
            <div className="flex items-center gap-2">
              <span>
                Page {totalCount === 0 ? 0 : page} of {pageCount}
              </span>
              <IconButton
                icon={<ChevronLeft aria-hidden className="size-4" />}
                label="Previous page"
                variant="secondary"
                size="sm"
                className="min-h-11 min-w-11 md:min-h-7 md:min-w-7"
                isDisabled={page <= 1}
                onClick={() => setPage((p) => Math.max(1, p - 1))}
              />
              <IconButton
                icon={<ChevronRight aria-hidden className="size-4" />}
                label="Next page"
                variant="secondary"
                size="sm"
                className="min-h-11 min-w-11 md:min-h-7 md:min-w-7"
                isDisabled={page >= pageCount}
                onClick={() => setPage((p) => Math.min(pageCount, p + 1))}
              />
            </div>
          </div>
        </div>
      </div>
    </Card>
  );
}
