'use client';

import { cn } from '@/lib/utils';

export type Range = '1h' | '6h' | '24h' | '7d' | '30d';

const RANGES: { value: Range; label: string }[] = [
  { value: '1h', label: '1h' },
  { value: '6h', label: '6h' },
  { value: '24h', label: '24h' },
  { value: '7d', label: '7d' },
  { value: '30d', label: '30d' },
];

export function TimeRangePicker({
  value,
  onChange,
  className,
}: {
  value: Range;
  onChange: (next: Range) => void;
  className?: string;
}) {
  return (
    <div
      className={cn(
        'inline-flex items-center rounded-md border border-border bg-background p-0.5',
        className,
      )}
    >
      {RANGES.map((r) => {
        const active = r.value === value;
        return (
          <button
            key={r.value}
            type="button"
            aria-pressed={active}
            aria-label={`Last ${r.label}`}
            onClick={() => onChange(r.value)}
            className={cn(
              'inline-flex h-8 min-w-[44px] items-center justify-center rounded-sm px-3 text-xs font-medium transition-colors md:h-7 md:min-w-0',
              active ? 'bg-accent text-foreground' : 'text-muted-foreground hover:text-foreground',
            )}
          >
            {r.label}
          </button>
        );
      })}
    </div>
  );
}
