import { describe, expect, it } from 'bun:test';

import { renderToStaticMarkup } from 'react-dom/server';

import { TimeRangePicker } from './time-range-picker';

describe('TimeRangePicker', () => {
  it('renders all five ranges with the active value marked', () => {
    const html = renderToStaticMarkup(<TimeRangePicker value="24h" onChange={() => {}} />);
    for (const label of ['6h', '12h', '24h', '7d', '30d']) {
      expect(html).toContain(label);
    }
    // The active item must be conveyed to AT (aria-pressed, aria-checked or aria-selected).
    expect(html).toMatch(/aria-(pressed|checked|selected)="true"/);
  });

  it('announces "Last <range>" to AT while the visible label stays short', () => {
    const html = renderToStaticMarkup(<TimeRangePicker value="24h" onChange={() => {}} />);
    for (const label of ['6h', '12h', '24h', '7d', '30d']) {
      // Each segment button carries an aria-labelledby (SegmentedControlItem
      // overwrites a plain aria-label - see the component's header comment).
      const buttonMatch = html.match(new RegExp(`<button[^>]*data-value="${label}"[^>]*>`));
      expect(buttonMatch).not.toBeNull();
      const idMatch = buttonMatch?.[0].match(/aria-labelledby="([^"]+)"/);
      expect(idMatch).not.toBeNull();
      const id = idMatch?.[1] ?? '';
      // The referenced node carries the fuller "Last <range>" text, visually hidden.
      expect(html).toContain(`<span id="${id}">Last ${label}</span>`);
    }
  });
});
