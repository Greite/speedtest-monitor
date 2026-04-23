import { z } from 'zod';

export const SORT_COLUMNS = [
  'timestamp',
  'downloadMbps',
  'uploadMbps',
  'latencyLoadedMs',
  'status',
] as const;

export type SortColumn = (typeof SORT_COLUMNS)[number];

export const PAGE_SIZES = [10, 25, 50, 100] as const;
export type PageSize = (typeof PAGE_SIZES)[number];

export const STATUSES = ['success', 'error', 'timeout'] as const;
export type StatusValue = (typeof STATUSES)[number];

export type NumericRange = { min?: number; max?: number };
export type TimeRange = { from?: number; to?: number };

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
  if (raw == null || raw === '') return undefined;
  const n = Number(raw);
  return Number.isFinite(n) ? n : undefined;
}

function readNumericRange(params: URLSearchParams, base: string): NumericRange | undefined {
  const min = readNumber(params, `${base}Min`);
  const max = readNumber(params, `${base}Max`);
  if (min === undefined && max === undefined) return undefined;
  return { ...(min !== undefined ? { min } : {}), ...(max !== undefined ? { max } : {}) };
}

function readTimeRange(params: URLSearchParams): TimeRange | undefined {
  const from = readNumber(params, 'timeFrom');
  const to = readNumber(params, 'timeTo');
  if (from === undefined && to === undefined) return undefined;
  return { ...(from !== undefined ? { from } : {}), ...(to !== undefined ? { to } : {}) };
}

function readStatuses(params: URLSearchParams): StatusValue[] | undefined {
  const raw = params.get('status');
  if (raw == null || raw === '') return undefined;
  const parts = raw
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
  if (parts.length === 0) return undefined;
  const validated = z.array(z.enum(STATUSES)).parse(parts);
  return [...new Set(validated)];
}

function readServer(params: URLSearchParams): string | undefined {
  const raw = params.get('server');
  if (raw == null) return undefined;
  const trimmed = raw.trim();
  return trimmed === '' ? undefined : trimmed;
}

export function parseTableQuery(params: URLSearchParams): TableQuery {
  const pageRaw = params.get('page');
  const page =
    pageRaw == null || pageRaw === '' ? 1 : z.coerce.number().int().min(1).parse(pageRaw);

  const pageSizeRaw = params.get('pageSize');
  const pageSize: PageSize =
    pageSizeRaw == null || pageSizeRaw === '' ? 25 : pageSizeSchema.parse(Number(pageSizeRaw));

  const sortRaw = params.get('sort');
  const sort: SortColumn =
    sortRaw == null || sortRaw === '' ? 'timestamp' : z.enum(SORT_COLUMNS).parse(sortRaw);

  const sortDirRaw = params.get('sortDir');
  const sortDir: 'asc' | 'desc' =
    sortDirRaw == null || sortDirRaw === '' ? 'desc' : z.enum(['asc', 'desc']).parse(sortDirRaw);

  const filters: TableFilters = {};
  const time = readTimeRange(params);
  if (time) filters.time = time;
  const download = readNumericRange(params, 'download');
  if (download) filters.download = download;
  const upload = readNumericRange(params, 'upload');
  if (upload) filters.upload = upload;
  const latency = readNumericRange(params, 'latency');
  if (latency) filters.latency = latency;
  const server = readServer(params);
  if (server) filters.server = server;
  const status = readStatuses(params);
  if (status) filters.status = status;

  return { page, pageSize, sort, sortDir, filters };
}
