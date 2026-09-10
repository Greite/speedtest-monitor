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

// The "Back to dashboard" / "View on GitHub" pill link, previously copy-pasted
// byte-for-byte across settings and changelog - except the settings copy had
// silently drifted and shipped without the focus-visible ring. `press` is the
// pointer-down feedback defined in globals.css (Astryx controls ship their own;
// hand-rolled links do not, so on touch they had no feedback before release).
export const pillLinkClasses =
  'press inline-flex items-center gap-1.5 rounded-full border border-border/70 bg-card/40 px-3 py-1.5 text-xs font-medium text-muted-foreground hover:bg-accent hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background';

// The auth card shell, shared by the login and first-run setup screens - the
// two files carried this string byte-for-byte.
export const authCardClasses = 'rounded-2xl border border-border/60 bg-card/80 p-8 shadow-sm';

// Switch's track is a fixed 40x24 box and its invisible <input> - the actual
// hit target - matches it exactly, so both dimensions sit under the 44px mobile
// touch floor (WCAG 2.5.5). This enlarges the rendered input on mobile only;
// min-w-10/min-h-6 restore the native size at md and up. Same idiom as
// togglePillClasses above.
export const switchTouchClasses = '[&_input]:min-h-11 [&_input]:min-w-11 md:[&_input]:min-h-6 md:[&_input]:min-w-10';

// Links inside an error summary. Text links, so no `press` scale (transform is
// a no-op on inline boxes anyway) - what they were missing is a visible focus
// ring, which the surrounding Banner does not provide.
export const errorSummaryLinkClasses =
  'rounded-sm underline underline-offset-2 hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background';
