import { describe, expect, it } from 'bun:test';

import { renderToStaticMarkup } from 'react-dom/server';

import { Markdown } from './markdown';

const render = (source: string) => renderToStaticMarkup(<Markdown source={source} />);

describe('Markdown link hrefs', () => {
  it('keeps http and https links', () => {
    const html = render('[site](https://example.com) et [plain](http://example.com/a)');
    expect(html).toContain('href="https://example.com"');
    expect(html).toContain('href="http://example.com/a"');
  });

  it('keeps relative and anchor links', () => {
    const html = render('[page](/changelog) et [section](#notes)');
    expect(html).toContain('href="/changelog"');
    expect(html).toContain('href="#notes"');
  });

  it('drops javascript: links but keeps the label as text', () => {
    const html = render('[clique](javascript:alert%281%29)');
    expect(html).not.toContain('javascript:');
    expect(html).not.toContain('<a');
    expect(html).toContain('clique');
  });

  it('drops data: and vbscript: links', () => {
    const html = render('[d](data:text/html,x) et [v](vbscript:msgbox)');
    expect(html).not.toContain('href="data:');
    expect(html).not.toContain('href="vbscript:');
    expect(html).not.toContain('<a');
  });

  it('drops links whose scheme hides behind leading control characters', () => {
    const html = render('[x](\u0001javascript:alert(1))');
    expect(html).not.toContain('javascript:');
    expect(html).not.toContain('<a');
  });
});
