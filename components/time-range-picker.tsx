'use client';

import { SegmentedControl, SegmentedControlItem } from '@astryxdesign/core/SegmentedControl';
import { useId } from 'react';

import type { Range } from '@/lib/measurements';

const RANGES: { value: Range; label: string }[] = [
  { value: '6h', label: '6h' },
  { value: '12h', label: '12h' },
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
  const idBase = useId();

  return (
    <>
      <SegmentedControl
        value={value}
        onChange={(next) => onChange(next as Range)}
        label="Time range"
        size="sm"
        className={className}
      >
        {/* SegmentedControlItem.js always sets its own "aria-label": isLabelHidden
            ? label : undefined after spreading the consumer's rest props, so a
            consumer-passed aria-label is silently overwritten (verified in
            node_modules/@astryxdesign/core/dist/SegmentedControl/SegmentedControlItem.js)
            - the established Astryx prop-forwarding trap. aria-labelledby is not
            touched by the component and reaches the DOM as-is, so it points at a
            visually-hidden span carrying the fuller "Last 6h" announcement while
            the visible label stays the short "6h". */}
        {RANGES.map((r) => (
          <SegmentedControlItem
            key={r.value}
            value={r.value}
            label={r.label}
            aria-labelledby={`${idBase}-${r.value}`}
          />
        ))}
      </SegmentedControl>
      <span className="sr-only">
        {RANGES.map((r) => (
          <span key={r.value} id={`${idBase}-${r.value}`}>{`Last ${r.label}`}</span>
        ))}
      </span>
    </>
  );
}
