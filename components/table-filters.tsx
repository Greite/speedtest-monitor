'use client';

import type { Column, Table } from '@tanstack/react-table';
import { ChevronDown, ChevronUp, X } from 'lucide-react';
import { useState } from 'react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import type { MeasurementDto } from '@/lib/types';
import { cn } from '@/lib/utils';

export type NumericRange = { min?: number; max?: number };
export type TimeRange = { from?: number; to?: number };
export type StatusValue = MeasurementDto['status'];

const STATUSES: readonly { value: StatusValue; label: string }[] = [
  { value: 'success', label: 'OK' },
  { value: 'timeout', label: 'Timeout' },
  { value: 'error', label: 'Error' },
];

function parseNumber(v: string): number | undefined {
  if (v === '') return undefined;
  const n = Number(v);
  return Number.isFinite(n) ? n : undefined;
}

function parseTime(v: string): number | undefined {
  if (v === '') return undefined;
  const t = new Date(v).getTime();
  return Number.isFinite(t) ? t : undefined;
}

function toDateTimeLocal(ms?: number): string {
  if (ms == null) return '';
  const d = new Date(ms);
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function setNumericRange(col: Column<MeasurementDto, unknown> | undefined, next: NumericRange) {
  if (!col) return;
  if (next.min == null && next.max == null) col.setFilterValue(undefined);
  else col.setFilterValue(next);
}

function setTimeRange(col: Column<MeasurementDto, unknown> | undefined, next: TimeRange) {
  if (!col) return;
  if (next.from == null && next.to == null) col.setFilterValue(undefined);
  else col.setFilterValue(next);
}

function formatNumericSummary(label: string, val: NumericRange): string {
  if (val.min != null && val.max != null) return `${label}: ${val.min}–${val.max}`;
  if (val.min != null) return `${label} ≥ ${val.min}`;
  if (val.max != null) return `${label} ≤ ${val.max}`;
  return label;
}

export function TableFilters({ table }: { table: Table<MeasurementDto> }) {
  const [open, setOpen] = useState(false);

  const timeCol = table.getColumn('timestamp');
  const downCol = table.getColumn('download');
  const upCol = table.getColumn('upload');
  const latCol = table.getColumn('latency');
  const serverCol = table.getColumn('server');
  const statusCol = table.getColumn('status');

  const activeCount = table.getState().columnFilters.length;

  const timeVal = (timeCol?.getFilterValue() as TimeRange | undefined) ?? {};
  const downVal = (downCol?.getFilterValue() as NumericRange | undefined) ?? {};
  const upVal = (upCol?.getFilterValue() as NumericRange | undefined) ?? {};
  const latVal = (latCol?.getFilterValue() as NumericRange | undefined) ?? {};
  const serverVal = (serverCol?.getFilterValue() as string | undefined) ?? '';
  const statusVal = (statusCol?.getFilterValue() as StatusValue[] | undefined) ?? [];

  const toggleStatus = (s: StatusValue) => {
    if (!statusCol) return;
    const set = new Set(statusVal);
    if (set.has(s)) set.delete(s);
    else set.add(s);
    if (set.size === 0) statusCol.setFilterValue(undefined);
    else statusCol.setFilterValue([...set]);
  };

  const activePills: { key: string; label: string; onRemove: () => void }[] = [];
  if (timeVal.from != null || timeVal.to != null) {
    const parts: string[] = [];
    if (timeVal.from != null) parts.push(`from ${new Date(timeVal.from).toLocaleString()}`);
    if (timeVal.to != null) parts.push(`to ${new Date(timeVal.to).toLocaleString()}`);
    activePills.push({
      key: 'time',
      label: parts.join(' '),
      onRemove: () => timeCol?.setFilterValue(undefined),
    });
  }
  if (downVal.min != null || downVal.max != null) {
    activePills.push({
      key: 'download',
      label: formatNumericSummary('Download (Mbps)', downVal),
      onRemove: () => downCol?.setFilterValue(undefined),
    });
  }
  if (upVal.min != null || upVal.max != null) {
    activePills.push({
      key: 'upload',
      label: formatNumericSummary('Upload (Mbps)', upVal),
      onRemove: () => upCol?.setFilterValue(undefined),
    });
  }
  if (latVal.min != null || latVal.max != null) {
    activePills.push({
      key: 'latency',
      label: formatNumericSummary('Latency (ms)', latVal),
      onRemove: () => latCol?.setFilterValue(undefined),
    });
  }
  if (serverVal) {
    activePills.push({
      key: 'server',
      label: `Server: ${serverVal}`,
      onRemove: () => serverCol?.setFilterValue(undefined),
    });
  }
  if (statusVal.length > 0) {
    activePills.push({
      key: 'status',
      label: `Status: ${statusVal.map((s) => STATUSES.find((st) => st.value === s)?.label ?? s).join(', ')}`,
      onRemove: () => statusCol?.setFilterValue(undefined),
    });
  }

  return (
    <div className="mb-4 rounded-lg border bg-card">
      <div className="flex flex-wrap items-center gap-2 px-4 py-2">
        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          className="inline-flex items-center gap-2 text-sm font-medium text-foreground hover:text-foreground/80"
          aria-expanded={open}
          aria-controls="table-filters-panel"
        >
          {open ? <ChevronUp className="size-4" /> : <ChevronDown className="size-4" />}
          Filters
          {activeCount > 0 ? (
            <Badge variant="secondary" className="ml-1">
              {activeCount} active
            </Badge>
          ) : null}
        </button>
        {!open && activePills.length > 0 ? (
          <div className="flex flex-wrap items-center gap-1.5">
            {activePills.map((p) => (
              <button
                key={p.key}
                type="button"
                onClick={p.onRemove}
                aria-label={`Remove filter: ${p.label}`}
                className="inline-flex items-center gap-1 rounded-full border border-border bg-background px-2 py-0.5 text-xs text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
              >
                <span className="max-w-[24ch] truncate">{p.label}</span>
                <X className="size-3" aria-hidden />
              </button>
            ))}
          </div>
        ) : null}
        {activeCount > 0 ? (
          <Button
            variant="ghost"
            size="sm"
            onClick={() => table.resetColumnFilters()}
            className="ml-auto"
          >
            <X className="size-3" />
            Reset
          </Button>
        ) : null}
      </div>
      {open ? (
        <div
          id="table-filters-panel"
          className="grid grid-cols-1 gap-4 border-t p-4 md:grid-cols-3"
        >
          <div className="flex flex-col gap-2">
            <Label className="text-xs uppercase tracking-wide text-muted-foreground">Time</Label>
            <div className="flex flex-col gap-1">
              <Input
                type="datetime-local"
                value={toDateTimeLocal(timeVal.from)}
                onChange={(e) =>
                  setTimeRange(timeCol, { from: parseTime(e.target.value), to: timeVal.to })
                }
                className="h-8 text-xs"
                aria-label="From date and time"
              />
              <Input
                type="datetime-local"
                value={toDateTimeLocal(timeVal.to)}
                onChange={(e) =>
                  setTimeRange(timeCol, { from: timeVal.from, to: parseTime(e.target.value) })
                }
                className="h-8 text-xs"
                aria-label="To date and time"
              />
            </div>
          </div>

          <NumericBlock
            label="Download (Mbps)"
            value={downVal}
            onChange={(n) => setNumericRange(downCol, n)}
          />
          <NumericBlock
            label="Upload (Mbps)"
            value={upVal}
            onChange={(n) => setNumericRange(upCol, n)}
          />
          <NumericBlock
            label="Latency loaded (ms)"
            value={latVal}
            onChange={(n) => setNumericRange(latCol, n)}
          />

          <div className="flex flex-col gap-2">
            <Label
              htmlFor="filter-server"
              className="text-xs uppercase tracking-wide text-muted-foreground"
            >
              Server contains
            </Label>
            <Input
              id="filter-server"
              type="text"
              value={serverVal}
              onChange={(e) => serverCol?.setFilterValue(e.target.value || undefined)}
              placeholder="e.g. Paris"
              className="h-8 text-xs"
            />
          </div>

          <fieldset className="flex flex-col gap-2">
            <legend className="mb-2 text-xs uppercase tracking-wide text-muted-foreground">
              Status
            </legend>
            <div className="flex flex-wrap gap-2">
              {STATUSES.map((s) => {
                const active = statusVal.includes(s.value);
                return (
                  <button
                    key={s.value}
                    type="button"
                    onClick={() => toggleStatus(s.value)}
                    aria-pressed={active}
                    className={cn(
                      'inline-flex min-h-[36px] items-center rounded-full border px-3 text-xs font-medium transition-colors md:min-h-[28px]',
                      active
                        ? 'border-primary bg-primary text-primary-foreground'
                        : 'border-input bg-background text-muted-foreground hover:text-foreground',
                    )}
                  >
                    {s.label}
                  </button>
                );
              })}
            </div>
          </fieldset>
        </div>
      ) : null}
    </div>
  );
}

function NumericBlock({
  label,
  value,
  onChange,
}: {
  label: string;
  value: NumericRange;
  onChange: (next: NumericRange) => void;
}) {
  const minId = `${label}-min`.replace(/\s+/g, '-').toLowerCase();
  const maxId = `${label}-max`.replace(/\s+/g, '-').toLowerCase();
  return (
    <div className="flex flex-col gap-2">
      <Label className="text-xs uppercase tracking-wide text-muted-foreground">{label}</Label>
      <div className="flex items-center gap-2">
        <Input
          id={minId}
          type="number"
          value={value.min ?? ''}
          onChange={(e) => onChange({ min: parseNumber(e.target.value), max: value.max })}
          placeholder="min"
          aria-label={`${label} minimum`}
          className="h-8 text-xs"
        />
        <Input
          id={maxId}
          type="number"
          value={value.max ?? ''}
          onChange={(e) => onChange({ min: value.min, max: parseNumber(e.target.value) })}
          placeholder="max"
          aria-label={`${label} maximum`}
          className="h-8 text-xs"
        />
      </div>
    </div>
  );
}
