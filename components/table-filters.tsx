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

  return (
    <div className="mb-4 rounded-lg border bg-card">
      <div className="flex items-center justify-between px-4 py-2">
        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          className="inline-flex items-center gap-2 text-sm font-medium text-foreground hover:text-foreground/80"
        >
          {open ? <ChevronUp className="size-4" /> : <ChevronDown className="size-4" />}
          Filters
          {activeCount > 0 ? (
            <Badge variant="secondary" className="ml-1">
              {activeCount} active
            </Badge>
          ) : null}
        </button>
        {activeCount > 0 ? (
          <Button variant="ghost" size="sm" onClick={() => table.resetColumnFilters()}>
            <X className="size-3" />
            Reset
          </Button>
        ) : null}
      </div>
      {open ? (
        <div className="grid grid-cols-1 gap-4 border-t p-4 md:grid-cols-3">
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
                aria-label="From"
              />
              <Input
                type="datetime-local"
                value={toDateTimeLocal(timeVal.to)}
                onChange={(e) =>
                  setTimeRange(timeCol, { from: timeVal.from, to: parseTime(e.target.value) })
                }
                className="h-8 text-xs"
                aria-label="To"
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
            <Label className="text-xs uppercase tracking-wide text-muted-foreground">
              Server contains
            </Label>
            <Input
              type="text"
              value={serverVal}
              onChange={(e) => serverCol?.setFilterValue(e.target.value || undefined)}
              placeholder="e.g. Paris"
              className="h-8 text-xs"
            />
          </div>

          <div className="flex flex-col gap-2">
            <Label className="text-xs uppercase tracking-wide text-muted-foreground">Status</Label>
            <div className="flex flex-wrap gap-2">
              {STATUSES.map((s) => {
                const active = statusVal.includes(s.value);
                return (
                  <button
                    key={s.value}
                    type="button"
                    onClick={() => toggleStatus(s.value)}
                    className={cn(
                      'rounded-full border px-3 py-1 text-xs font-medium transition-colors',
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
          </div>
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
  return (
    <div className="flex flex-col gap-2">
      <Label className="text-xs uppercase tracking-wide text-muted-foreground">{label}</Label>
      <div className="flex items-center gap-2">
        <Input
          type="number"
          value={value.min ?? ''}
          onChange={(e) => onChange({ min: parseNumber(e.target.value), max: value.max })}
          placeholder="min"
          className="h-8 text-xs"
        />
        <Input
          type="number"
          value={value.max ?? ''}
          onChange={(e) => onChange({ min: value.min, max: parseNumber(e.target.value) })}
          placeholder="max"
          className="h-8 text-xs"
        />
      </div>
    </div>
  );
}
