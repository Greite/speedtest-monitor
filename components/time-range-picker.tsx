'use client';

import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { cn } from '@/lib/utils';

export type Range = '1h' | '6h' | '24h' | '7d' | '30d';

const RANGES: { value: Range; label: string }[] = [
  { value: '1h', label: '1h' },
  { value: '6h', label: '6h' },
  { value: '24h', label: '24h' },
  { value: '7d', label: '7d' },
  { value: '30d', label: '30d' },
];

const useIsoLayoutEffect = typeof window !== 'undefined' ? useLayoutEffect : useEffect;

export function TimeRangePicker({
  value,
  onChange,
  className,
}: {
  value: Range;
  onChange: (next: Range) => void;
  className?: string;
}) {
  const trackRef = useRef<HTMLDivElement | null>(null);
  const buttonsRef = useRef<Record<Range, HTMLButtonElement | null>>({
    '1h': null,
    '6h': null,
    '24h': null,
    '7d': null,
    '30d': null,
  });
  const [pill, setPill] = useState<{ left: number; width: number } | null>(null);

  useIsoLayoutEffect(() => {
    const track = trackRef.current;
    const btn = buttonsRef.current[value];
    if (!track || !btn) return;
    const trackRect = track.getBoundingClientRect();
    const btnRect = btn.getBoundingClientRect();
    setPill({
      left: btnRect.left - trackRect.left,
      width: btnRect.width,
    });
  }, [value]);

  return (
    <div
      ref={trackRef}
      className={cn(
        'segmented-track inline-flex items-center rounded-md border border-border/70 bg-card/40 p-0.5 backdrop-blur-sm',
        className,
      )}
    >
      {pill ? (
        <span
          aria-hidden
          className="segmented-pill"
          style={{
            transform: `translateX(${pill.left}px)`,
            width: pill.width,
          }}
        />
      ) : null}
      {RANGES.map((r) => {
        const active = r.value === value;
        return (
          <button
            key={r.value}
            ref={(el) => {
              buttonsRef.current[r.value] = el;
            }}
            type="button"
            aria-pressed={active}
            aria-label={`Last ${r.label}`}
            onClick={() => onChange(r.value)}
            className={cn(
              'relative inline-flex h-8 min-w-[44px] items-center justify-center rounded-sm px-3 font-mono text-xs font-medium transition-colors md:h-7 md:min-w-0',
              active ? 'text-foreground' : 'text-muted-foreground hover:text-foreground',
            )}
          >
            {r.label}
          </button>
        );
      })}
    </div>
  );
}
