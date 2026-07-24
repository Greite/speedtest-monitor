import { z } from 'zod';

const SORT_COLUMNS = ['timestamp', 'downloadMbps', 'uploadMbps', 'latencyLoadedMs', 'status'] as const;

export type SortColumn = (typeof SORT_COLUMNS)[number];

const PAGE_SIZES = [10, 25, 50, 100] as const;
type PageSize = (typeof PAGE_SIZES)[number];

const STATUSES = ['success', 'error', 'timeout'] as const;
type StatusValue = (typeof STATUSES)[number];

type NumericRange = { min?: number; max?: number };
type TimeRange = { from?: number; to?: number };

export type TableFilters = {
  time?: TimeRange;
  download?: NumericRange;
  upload?: NumericRange;
  latency?: NumericRange;
  server?: string;
  status?: StatusValue[];
};

export type TableQuery = {
  page: number;
  pageSize: number;
  sort: SortColumn;
  sortDir: 'asc' | 'desc';
  filters: TableFilters;
};

const pageSizeSchema = z.union([z.literal(10), z.literal(25), z.literal(50), z.literal(100)]);

function readNumber(params: URLSearchParams, key: string): number | undefined {
  const raw = params.get(key);
  if (raw == null || raw === '') {
    return undefined;
  }
  const n = Number(raw);
  return Number.isFinite(n) ? n : undefined;
}

function range<K extends 'min' | 'max' | 'from' | 'to'>(
  loKey: K,
  lo: number | undefined,
  hiKey: K,
  hi: number | undefined,
): Partial<Record<K, number>> | undefined {
  if (lo === undefined && hi === undefined) {
    return undefined;
  }
  return { ...(lo !== undefined ? { [loKey]: lo } : {}), ...(hi !== undefined ? { [hiKey]: hi } : {}) } as Partial<
    Record<K, number>
  >;
}

export function parseTableQuery(params: URLSearchParams): TableQuery {
  const pageRaw = params.get('page');
  const page = pageRaw == null || pageRaw === '' ? 1 : z.coerce.number().int().min(1).parse(pageRaw);

  const pageSizeRaw = params.get('pageSize');
  const pageSize: PageSize = pageSizeRaw == null || pageSizeRaw === '' ? 25 : pageSizeSchema.parse(Number(pageSizeRaw));

  const sortRaw = params.get('sort');
  const sort: SortColumn = sortRaw == null || sortRaw === '' ? 'timestamp' : z.enum(SORT_COLUMNS).parse(sortRaw);

  const sortDirRaw = params.get('sortDir');
  const sortDir: 'asc' | 'desc' =
    sortDirRaw == null || sortDirRaw === '' ? 'desc' : z.enum(['asc', 'desc']).parse(sortDirRaw);

  const filters: TableFilters = {};
  filters.time = range('from', readNumber(params, 'timeFrom'), 'to', readNumber(params, 'timeTo'));
  filters.download = range('min', readNumber(params, 'downloadMin'), 'max', readNumber(params, 'downloadMax'));
  filters.upload = range('min', readNumber(params, 'uploadMin'), 'max', readNumber(params, 'uploadMax'));
  filters.latency = range('min', readNumber(params, 'latencyMin'), 'max', readNumber(params, 'latencyMax'));
  const server = params.get('server')?.trim();
  if (server) {
    filters.server = server;
  }
  const statusRaw = params.get('status');
  const parts = statusRaw
    ? statusRaw
        .split(',')
        .map((s) => s.trim())
        .filter(Boolean)
    : [];
  if (parts.length > 0) {
    filters.status = [...new Set(z.array(z.enum(STATUSES)).parse(parts))];
  }
  for (const k of ['time', 'download', 'upload', 'latency'] as const) {
    if (filters[k] === undefined) {
      delete filters[k];
    }
  }
  return { page, pageSize, sort, sortDir, filters };
}
