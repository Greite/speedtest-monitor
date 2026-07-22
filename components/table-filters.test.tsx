import { describe, expect, it } from 'bun:test';

import { renderToStaticMarkup } from 'react-dom/server';

import { TableFilters } from './table-filters';

import type { TableFilters as TableFiltersType } from '@/lib/measurements-query';
import { statusPillClassesBad, statusPillClassesOk, statusPillClassesWarn } from '@/lib/utils';

// The filters panel starts closed (`useState(false)` in table-filters.tsx),
// so the first describe block below is a static-render lock on the
// COLLAPSED state only: the chip row, the active-count Token and the Reset
// button. The second describe block reaches the open panel via the
// `defaultOpen` prop (seeds the same `useState`, no behavior change for
// callers that pass nothing). The one honest limit left is that a static
// render can't simulate user interaction: NumberInput commits an emptied
// value on blur/Enter/clear-click rather than per keystroke (see the
// comment above NumericBlock in table-filters.tsx), so only its initial
// value and presence are asserted here, not a typed commit.
const render = (value: TableFiltersType, defaultOpen?: boolean) =>
  renderToStaticMarkup(<TableFilters value={value} onChange={() => {}} defaultOpen={defaultOpen} />);

describe('TableFilters (collapsed panel)', () => {
  it('renders the collapsed toggle with no chips, count or reset when there are no active filters', () => {
    const html = render({});
    expect(html).toContain('Expand filters');
    expect(html).toContain('aria-expanded="false"');
    expect(html).not.toContain('active');
    expect(html).not.toContain('Reset');
  });

  it('renders a removable chip per active filter, formatted per filter kind, plus the active count and Reset', () => {
    const html = render({
      download: { min: 100 },
      upload: { min: 10, max: 50 },
      latency: { max: 80 },
      server: 'Paris',
      status: ['success', 'timeout'],
    });

    expect(html).toContain('Download (Mbps) ≥ 100');
    expect(html).toContain('Upload (Mbps): 10–50');
    expect(html).toContain('Latency (ms) ≤ 80');
    expect(html).toContain('Server: Paris');
    expect(html).toContain('Status: OK, Timeout');
    expect(html).toContain('5 active');
    expect(html).toContain('Reset');
  });

  it('renders a chip for an active time filter without pinning the locale-dependent date format', () => {
    const html = render({ time: { from: 1_700_000_000_000 } });
    // formatDateTime is locale/timezone-configurable (lib/format.ts), so only
    // the "from " prefix built by table-filters.tsx is asserted here.
    expect(html).toMatch(/>from [^<]+</);
    expect(html).toContain('1 active');
  });

  it('gives each Token remove button the "Remove <label>" accessible name (ICU message, not a fixed string)', () => {
    const html = render({ download: { min: 100 }, server: 'Paris' });
    // Token.tsx resolves onRemove's aria-label via the ICU message
    // "@astryx.token.remove" -> "Remove {label}" (locales/en.json), not a
    // hardcoded prop - verified against Token's source before writing this.
    expect(html).toContain('aria-label="Remove Download (Mbps) ≥ 100"');
    expect(html).toContain('aria-label="Remove Server: Paris"');
  });
});

// Class strings built with Tailwind's arbitrary-variant syntax contain `&`
// and `'`, which react-dom/server escapes as HTML attribute text (`&amp;`,
// `&#x27;`) - confirmed against a raw renderToStaticMarkup dump before
// writing these assertions. This mirrors that escaping so the test compares
// against the same literal exported from lib/utils.ts, not a hand-copied
// duplicate.
const escapeAttr = (s: string) => s.replaceAll('&', '&amp;').replaceAll("'", '&#x27;');

describe('TableFilters (open panel via defaultOpen)', () => {
  it('renders a NumberInput minimum and maximum field for each numeric filter group', () => {
    const html = render({}, true);
    expect(html).toContain('id="table-filters-panel"');
    expect(html).toContain('aria-expanded="true"');
    for (const label of ['Download (Mbps)', 'Upload (Mbps)', 'Latency loaded (ms)']) {
      expect(html).toContain(`${label} minimum`);
      expect(html).toContain(`${label} maximum`);
    }
  });

  it('binds each status pill color class to the button at its matching DOM position, per the STATUSES order', () => {
    const html = render({}, true);

    // Isolate the Status fieldset - the last one in the panel - so the
    // color-class and button-order assertions below can't accidentally
    // match unrelated markup earlier in the document.
    const statusStart = html.indexOf('<legend class="label-eyebrow mb-2">Status</legend>');
    expect(statusStart).toBeGreaterThan(-1);
    const statusEnd = html.indexOf('</fieldset>', statusStart);
    const statusSection = html.slice(statusStart, statusEnd);

    // The wrapper div carries all three per-status color classes (lib/utils.ts),
    // each hardcoding a different nth-of-type position (OK=1, Timeout=2, Error=3).
    expect(statusSection).toContain(escapeAttr(statusPillClassesOk));
    expect(statusSection).toContain(escapeAttr(statusPillClassesWarn));
    expect(statusSection).toContain(escapeAttr(statusPillClassesBad));

    // ToggleButtonGroup renders a single wrapper div with the buttons as flat
    // siblings (lib/utils.ts's comment on togglePillClasses), and Button sets
    // aria-label=label on every button, so the aria-label sequence gives the
    // buttons' actual DOM order. The group wrapper's own aria-label="Status"
    // is the sequence's first match; drop it to get just the buttons.
    const ariaLabels = [...statusSection.matchAll(/aria-label="([^"]+)"/g)].map((m) => m[1]);
    const [, first, second, third] = ariaLabels;
    // nth-of-type(1) is styled by statusPillClassesOk (text-latency-ok): if
    // STATUSES were reordered, this button would stop being the first sibling
    // and this assertion would fail.
    expect(first).toBe('OK');
    expect(second).toBe('Timeout');
    expect(third).toBe('Error');
  });
});
