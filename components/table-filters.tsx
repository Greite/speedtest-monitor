'use client';

import { Button } from '@astryxdesign/core/Button';
import { DateTimeInput, type ISODateTimeString } from '@astryxdesign/core/DateTimeInput';
import { IconButton } from '@astryxdesign/core/IconButton';
import { NumberInput } from '@astryxdesign/core/NumberInput';
import { TextInput } from '@astryxdesign/core/TextInput';
import { ToggleButton, ToggleButtonGroup } from '@astryxdesign/core/ToggleButton';
import { Token } from '@astryxdesign/core/Token';
import { ChevronDown, ChevronUp, X } from 'lucide-react';
import { useState } from 'react';

import { formatDateTime } from '@/lib/format';
import type { TableFilters as TableFiltersType } from '@/lib/measurements-query';
import type { MeasurementDto } from '@/lib/types';
import { cn, statusPillClassesBad, statusPillClassesOk, statusPillClassesWarn, togglePillClasses } from '@/lib/utils';

type NumericRange = { min?: number; max?: number };
type TimeRange = { from?: number; to?: number };
type StatusValue = MeasurementDto['status'];

const STATUSES: readonly { value: StatusValue; label: string }[] = [
  { value: 'success', label: 'OK' },
  { value: 'timeout', label: 'Timeout' },
  { value: 'error', label: 'Error' },
];

function parseTime(v: string): number | undefined {
  if (v === '') {
    return undefined;
  }
  const t = new Date(v).getTime();
  return Number.isFinite(t) ? t : undefined;
}

function toDateTimeLocal(ms?: number): string {
  if (ms == null) {
    return '';
  }
  const d = new Date(ms);
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

// Adapts toDateTimeLocal's "" empty sentinel to DateTimeInput's optional-value model.
function toISODateTimeValue(ms?: number): ISODateTimeString | undefined {
  const s = toDateTimeLocal(ms);
  return s === '' ? undefined : (s as ISODateTimeString);
}

function withNumericRange(
  current: TableFiltersType,
  key: 'download' | 'upload' | 'latency',
  next: NumericRange,
): TableFiltersType {
  const { [key]: _removed, ...rest } = current;
  if (next.min == null && next.max == null) {
    return rest;
  }
  return { ...rest, [key]: next };
}

function withTimeRange(current: TableFiltersType, next: TimeRange): TableFiltersType {
  const { time: _removed, ...rest } = current;
  if (next.from == null && next.to == null) {
    return rest;
  }
  return { ...rest, time: next };
}

function withServer(current: TableFiltersType, next: string): TableFiltersType {
  const { server: _removed, ...rest } = current;
  return next === '' ? rest : { ...rest, server: next };
}

function withStatus(current: TableFiltersType, next: StatusValue[]): TableFiltersType {
  const { status: _removed, ...rest } = current;
  return next.length === 0 ? rest : { ...rest, status: next };
}

function formatNumericSummary(label: string, val: NumericRange): string {
  if (val.min != null && val.max != null) {
    return `${label}: ${val.min}–${val.max}`;
  }
  if (val.min != null) {
    return `${label} ≥ ${val.min}`;
  }
  if (val.max != null) {
    return `${label} ≤ ${val.max}`;
  }
  return label;
}

export function TableFilters({
  value,
  onChange,
  defaultOpen = false,
}: {
  value: TableFiltersType;
  onChange: (next: TableFiltersType) => void;
  /** Seeds the panel's initial expanded state. Defaults to collapsed. */
  defaultOpen?: boolean;
}) {
  const [open, setOpen] = useState(defaultOpen);

  const activeCount = Object.keys(value).length;

  const timeVal = value.time ?? {};
  const downVal = value.download ?? {};
  const upVal = value.upload ?? {};
  const latVal = value.latency ?? {};
  const serverVal = value.server ?? '';
  const statusVal = value.status ?? [];

  const activePills: { key: string; label: string; onRemove: () => void }[] = [];
  if (timeVal.from != null || timeVal.to != null) {
    const parts: string[] = [];
    if (timeVal.from != null) {
      parts.push(`from ${formatDateTime(timeVal.from)}`);
    }
    if (timeVal.to != null) {
      parts.push(`to ${formatDateTime(timeVal.to)}`);
    }
    activePills.push({
      key: 'time',
      label: parts.join(' '),
      onRemove: () => onChange(withTimeRange(value, {})),
    });
  }
  if (downVal.min != null || downVal.max != null) {
    activePills.push({
      key: 'download',
      label: formatNumericSummary('Download (Mbps)', downVal),
      onRemove: () => onChange(withNumericRange(value, 'download', {})),
    });
  }
  if (upVal.min != null || upVal.max != null) {
    activePills.push({
      key: 'upload',
      label: formatNumericSummary('Upload (Mbps)', upVal),
      onRemove: () => onChange(withNumericRange(value, 'upload', {})),
    });
  }
  if (latVal.min != null || latVal.max != null) {
    activePills.push({
      key: 'latency',
      label: formatNumericSummary('Latency (ms)', latVal),
      onRemove: () => onChange(withNumericRange(value, 'latency', {})),
    });
  }
  if (serverVal) {
    activePills.push({
      key: 'server',
      label: `Server: ${serverVal}`,
      onRemove: () => onChange(withServer(value, '')),
    });
  }
  if (statusVal.length > 0) {
    activePills.push({
      key: 'status',
      label: `Status: ${statusVal.map((s) => STATUSES.find((st) => st.value === s)?.label ?? s).join(', ')}`,
      onRemove: () => onChange(withStatus(value, [])),
    });
  }

  return (
    <div className="mb-4 rounded-lg border bg-card">
      <div className="flex flex-wrap items-center gap-2 px-4 py-2">
        <div className="flex items-center gap-2">
          <IconButton
            icon={open ? <ChevronUp aria-hidden className="size-4" /> : <ChevronDown aria-hidden className="size-4" />}
            label={open ? 'Collapse filters' : 'Expand filters'}
            variant="ghost"
            size="sm"
            // min-h/min-w set a 44px touch-target floor on mobile (WCAG 2.5.5) without
            // fighting IconButton's aspect-ratio sizing. Utilities win over astryx-base
            // under the explicit layer order in globals.css.
            className="min-h-11 min-w-11 md:min-h-7 md:min-w-7"
            aria-expanded={open}
            aria-controls="table-filters-panel"
            onClick={() => setOpen((v) => !v)}
          />
          <span className="text-sm font-medium text-foreground">Filters</span>
          {activeCount > 0 ? <Token label={`${activeCount} active`} size="sm" /> : null}
        </div>
        {!open && activePills.length > 0 ? (
          <div className="flex flex-wrap items-center gap-1.5">
            {activePills.map((p) => (
              <Token key={p.key} label={p.label} size="sm" onRemove={p.onRemove} />
            ))}
          </div>
        ) : null}
        {activeCount > 0 ? (
          <Button
            variant="ghost"
            size="sm"
            icon={<X aria-hidden className="size-3" />}
            label="Reset"
            className="ml-auto"
            onClick={() => onChange({})}
          />
        ) : null}
      </div>
      {open ? (
        <div id="table-filters-panel" className="flex flex-wrap items-start gap-x-8 gap-y-4 border-t p-4">
          <fieldset className="flex flex-col gap-2">
            <legend className="label-eyebrow mb-2">Time</legend>
            <div className="flex flex-col gap-1">
              <DateTimeInput
                label="From date and time"
                isLabelHidden
                size="sm"
                className="flex-wrap"
                value={toISODateTimeValue(timeVal.from)}
                onChange={(v) => onChange(withTimeRange(value, { from: parseTime(v ?? ''), to: timeVal.to }))}
              />
              <DateTimeInput
                label="To date and time"
                isLabelHidden
                size="sm"
                className="flex-wrap"
                value={toISODateTimeValue(timeVal.to)}
                onChange={(v) => onChange(withTimeRange(value, { from: timeVal.from, to: parseTime(v ?? '') }))}
              />
            </div>
          </fieldset>

          <NumericBlock
            label="Download (Mbps)"
            value={downVal}
            onChange={(n) => onChange(withNumericRange(value, 'download', n))}
          />
          <NumericBlock
            label="Upload (Mbps)"
            value={upVal}
            onChange={(n) => onChange(withNumericRange(value, 'upload', n))}
          />
          <NumericBlock
            label="Latency loaded (ms)"
            value={latVal}
            onChange={(n) => onChange(withNumericRange(value, 'latency', n))}
          />

          <fieldset className="flex flex-col gap-2">
            <legend className="label-eyebrow mb-2">Server</legend>
            <TextInput
              label="Server contains"
              isLabelHidden
              value={serverVal}
              onChange={(v) => onChange(withServer(value, v))}
              placeholder="e.g. Paris"
              size="sm"
              width={224}
            />
          </fieldset>

          <fieldset className="flex flex-col gap-2">
            <legend className="label-eyebrow mb-2">Status</legend>
            {/* Shared pill affordance + 44px touch floor (togglePillClasses) plus
                per-status color cues on the pressed button (statusPillClasses*) -
                see lib/utils.ts. Position is bound to STATUSES below: OK=1,
                Timeout=2, Error=3. */}
            <div className={cn(togglePillClasses, statusPillClassesOk, statusPillClassesWarn, statusPillClassesBad)}>
              <ToggleButtonGroup
                label="Status"
                type="multiple"
                size="sm"
                value={statusVal}
                onChange={(v) => onChange(withStatus(value, v as StatusValue[]))}
              >
                {STATUSES.map((s) => (
                  <ToggleButton key={s.value} value={s.value} label={s.label} />
                ))}
              </ToggleButtonGroup>
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
  return (
    <fieldset className="flex flex-col gap-2">
      <legend className="label-eyebrow mb-2">{label}</legend>
      {/* NumberInput commits an emptied field on blur/Enter/clear-click, not per
          keystroke like the old TextInput - deliberate trade for the numeric
          keyboard and native parsing (controller-approved). */}
      <div className="flex items-center gap-2">
        <NumberInput
          label={`${label} minimum`}
          isLabelHidden
          hasClear
          value={value.min ?? null}
          onChange={(v) => onChange({ min: v ?? undefined, max: value.max })}
          placeholder="min"
          size="sm"
          width={112}
        />
        <NumberInput
          label={`${label} maximum`}
          isLabelHidden
          hasClear
          value={value.max ?? null}
          onChange={(v) => onChange({ min: value.min, max: v ?? undefined })}
          placeholder="max"
          size="sm"
          width={112}
        />
      </div>
    </fieldset>
  );
}
