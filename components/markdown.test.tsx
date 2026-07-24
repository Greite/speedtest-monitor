import { describe, expect, it } from 'bun:test';

import { renderToStaticMarkup } from 'react-dom/server';

import { Markdown, safeHref } from './markdown';

describe('safeHref', () => {
  it('allows http/https/mailto', () => {
    expect(safeHref('https://github.com/x')).toBe('https://github.com/x');
    expect(safeHref('http://example.com/a')).toBe('http://example.com/a');
    expect(safeHref('mailto:a@b.c')).toBe('mailto:a@b.c');
  });

  it('allows relative and anchor links (resolved against an https base)', () => {
    expect(safeHref('/changelog')).toBe('/changelog');
    expect(safeHref('#notes')).toBe('#notes');
  });

  it('rejects script-capable schemes', () => {
    expect(safeHref('javascript:alert(1)')).toBeNull();
    expect(safeHref('data:text/html,x')).toBeNull();
    expect(safeHref('vbscript:msgbox')).toBeNull();
  });

  it('rejects unparseable input', () => {
    expect(safeHref('http://')).toBeNull();
  });
});

// Render smoke test: pins that the Astryx Markdown component (not the old
// hand-rolled parser) is what's rendering, and that safeHref is actually
// wired in as the link component's guard.
describe('Markdown (rendered via Astryx)', () => {
  const sample = ['## Highlights', '', '- Faster **exports**', '- Fixed `flaky` retries', '', '[docs](https://x)'].join(
    '\n',
  );

  it('renders headings, list items, bold, inline code and a safe link', () => {
    const html = renderToStaticMarkup(<Markdown source={sample} />);
    expect(html).toContain('<h3');
    expect(html).toContain('Highlights');
    expect(html).toContain('<li');
    expect(html).toContain('<strong');
    expect(html).toContain('exports');
    expect(html).toContain('<code');
    expect(html).toContain('flaky');
    expect(html).toContain('<a');
    expect(html).toContain('href="https://x"');
    expect(html).toContain('target="_blank"');
    expect(html).toContain('rel="noopener noreferrer"');
  });

  it('renders an unsafe link as plain text, not an anchor', () => {
    const html = renderToStaticMarkup(<Markdown source="[x](javascript:alert(1))" />);
    expect(html).not.toContain('<a');
    expect(html).not.toContain('javascript:');
    expect(html).toContain('x');
  });

  it('rejects tel: scheme via safeHref allowlist even though Astryx blocklist allows it', () => {
    const html = renderToStaticMarkup(<Markdown source="[call us](tel:123456)" />);
    expect(html).not.toContain('<a');
    expect(html).not.toContain('tel:');
    expect(html).toContain('call us');
  });
});
