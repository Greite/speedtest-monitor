import { defineTheme } from '@astryxdesign/core/theme';
import { neutralTheme } from '@astryxdesign/theme-neutral';

// `extends: neutralTheme` seeds our theme with the full neutral base
// (tokens + component overrides) at lowest precedence - see
// DefineThemeInput.extends in @astryxdesign/core/dist/theme/defineTheme.d.ts.
// Without it, this theme would only carry the few tokens below and lose the
// rest of the neutral look. This file is the editable source: run
// `astryx theme build lib/astryx-theme.ts` to compile it to lib/speedtest.*
// (scoped to `[data-astryx-theme="speedtest"]`), which the app imports as a
// pre-built theme instead of injecting CSS at runtime. The neutral package's
// pre-compiled `theme.css` - scoped to `[data-astryx-theme="neutral"]` - never
// applies once this theme is active.
//
// Values mirror the shadcn tokens in app/globals.css ([light, dark] tuples).
export const astryxTheme = defineTheme({
  name: 'speedtest',
  extends: neutralTheme,
  tokens: {
    // Brand accent - same oklch values as --brand in app/globals.css
    // (--ring deliberately stays at 0.58: non-text, 3:1 suffices).
    '--color-accent': ['oklch(0.56 0.19 250)', 'oklch(0.7 0.17 240)'],
    // Elevated surfaces - Dialog, AppShell, Switch, FileInput, MultiSelector,
    // Selector, MobileNav, HoverCard, Tooltip, CheckboxInput, RadioList,
    // SegmentedControl, Section and others all read this directly (verified
    // in @astryxdesign/core/src/**) - mirrors --card.
    '--color-background-surface': ['oklch(1 0 0)', 'oklch(0.19 0.008 260)'],
    // Card reads --color-background-card, not -surface (verified in
    // @astryxdesign/core/src/Card/Card.tsx and dist/astryx.css line ~515) -
    // mirrors --card.
    '--color-background-card': ['oklch(1 0 0)', 'oklch(0.19 0.008 260)'],
    // Popover reads --color-background-popover, not -surface (verified in
    // @astryxdesign/core/src/Popover/usePopover.tsx and dist/astryx.css
    // line ~524) - mirrors --card.
    '--color-background-popover': ['oklch(1 0 0)', 'oklch(0.19 0.008 260)'],
    // Page canvas - mirrors --background.
    '--color-background-body': ['oklch(0.99 0.002 250)', 'oklch(0.135 0.01 260)'],
    '--color-border': ['oklch(0.922 0 0)', 'oklch(1 0 0 / 10%)'],
    // Astryx Theme wrapper sets `color: var(--color-text-primary)` app-wide -
    // mirrors --foreground.
    '--color-text-primary': ['oklch(0.145 0 0)', 'oklch(0.985 0 0)'],
    '--radius-container': '0.625rem',
    // The app uses a single sans font everywhere (no distinct heading font),
    // so both body and heading roles point at --font-sans; this overrides
    // neutral's default Figtree.
    '--font-family-body': 'var(--font-sans), ui-sans-serif, system-ui, sans-serif',
    '--font-family-heading': 'var(--font-sans), ui-sans-serif, system-ui, sans-serif',
    '--font-family-code': 'var(--font-mono), ui-monospace, monospace',
  },
});
