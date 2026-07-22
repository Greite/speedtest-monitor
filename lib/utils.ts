import { type ClassValue, clsx } from 'clsx';
import { twMerge } from 'tailwind-merge';

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

// ToggleButton drops its own className and hardcodes the ghost variant, so
// wrap the group in a div targeting the rendered <button> via a descendant
// selector to restore the bordered pill affordance and the 44px mobile touch
// floor (utilities win over astryx-base under the explicit layer order).
export const togglePillClasses =
  '[&_button]:min-h-11 [&_button]:rounded-full [&_button]:border [&_button]:border-border [&_button]:px-3 md:[&_button]:min-h-7';

// Per-status color cues for pressed ToggleButtons in the Status filter group
// (table-filters.tsx), layered on top of togglePillClasses via nth-of-type -
// ToggleButtonGroup renders a single wrapper div holding the buttons as flat
// siblings (verified in ToggleButtonGroup.js/ToggleButton.js), so nth-of-type
// counts the group's own children correctly. Tailwind 4's scanner can't see
// dynamically constructed classes, so these are three literal strings rather
// than a parameterized helper - the position is bound to the STATUSES array
// order in table-filters.tsx (OK=1, Timeout=2, Error=3).
export const statusPillClassesOk =
  "[&_button:nth-of-type(1)[aria-pressed='true']]:text-latency-ok [&_button:nth-of-type(1)[aria-pressed='true']]:border-latency-ok/30 [&_button:nth-of-type(1)[aria-pressed='true']]:bg-latency-ok/10";
export const statusPillClassesWarn =
  "[&_button:nth-of-type(2)[aria-pressed='true']]:text-latency-warn [&_button:nth-of-type(2)[aria-pressed='true']]:border-latency-warn/30 [&_button:nth-of-type(2)[aria-pressed='true']]:bg-latency-warn/10";
export const statusPillClassesBad =
  "[&_button:nth-of-type(3)[aria-pressed='true']]:text-latency-bad [&_button:nth-of-type(3)[aria-pressed='true']]:border-latency-bad/30 [&_button:nth-of-type(3)[aria-pressed='true']]:bg-latency-bad/10";
