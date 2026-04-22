import { Fragment, type ReactNode } from 'react';

type Block =
  | { kind: 'h'; level: 2 | 3 | 4; text: string }
  | { kind: 'p'; text: string }
  | { kind: 'ul'; items: string[] }
  | { kind: 'ol'; items: string[] }
  | { kind: 'pre'; lang: string | null; text: string }
  | { kind: 'quote'; text: string }
  | { kind: 'hr' }
  | { kind: 'table'; header: string[]; rows: string[][] };

function parseBlocks(src: string): Block[] {
  const lines = src.replace(/\r\n/g, '\n').split('\n');
  const blocks: Block[] = [];
  let i = 0;

  while (i < lines.length) {
    const line = lines[i];

    if (line.trim() === '') {
      i++;
      continue;
    }

    // Fenced code
    const fence = line.match(/^```(\w+)?\s*$/);
    if (fence) {
      const lang = fence[1] ?? null;
      const buf: string[] = [];
      i++;
      while (i < lines.length && !/^```\s*$/.test(lines[i])) {
        buf.push(lines[i]);
        i++;
      }
      if (i < lines.length) i++;
      blocks.push({ kind: 'pre', lang, text: buf.join('\n') });
      continue;
    }

    // Heading (## to ####). H1 is reserved for the page; release titles usually use ##.
    const heading = line.match(/^(#{2,4})\s+(.+?)\s*#*\s*$/);
    if (heading) {
      const level = Math.min(4, heading[1].length) as 2 | 3 | 4;
      blocks.push({ kind: 'h', level, text: heading[2] });
      i++;
      continue;
    }

    // Horizontal rule
    if (/^(\*\s*\*\s*\*+|-\s*-\s*-+|_\s*_\s*_+)\s*$/.test(line)) {
      blocks.push({ kind: 'hr' });
      i++;
      continue;
    }

    // Blockquote
    if (line.startsWith('>')) {
      const buf: string[] = [];
      while (i < lines.length && lines[i].startsWith('>')) {
        buf.push(lines[i].replace(/^>\s?/, ''));
        i++;
      }
      blocks.push({ kind: 'quote', text: buf.join(' ') });
      continue;
    }

    // Table
    if (
      line.trim().startsWith('|') &&
      i + 1 < lines.length &&
      /^\s*\|?\s*:?-{2,}/.test(lines[i + 1])
    ) {
      const header = line
        .trim()
        .replace(/^\||\|$/g, '')
        .split('|')
        .map((c) => c.trim());
      i += 2;
      const rows: string[][] = [];
      while (i < lines.length && lines[i].trim().startsWith('|')) {
        rows.push(
          lines[i]
            .trim()
            .replace(/^\||\|$/g, '')
            .split('|')
            .map((c) => c.trim()),
        );
        i++;
      }
      blocks.push({ kind: 'table', header, rows });
      continue;
    }

    // Unordered list
    if (/^[-*+]\s+/.test(line)) {
      const items: string[] = [];
      while (i < lines.length && /^[-*+]\s+/.test(lines[i])) {
        items.push(lines[i].replace(/^[-*+]\s+/, ''));
        i++;
      }
      blocks.push({ kind: 'ul', items });
      continue;
    }

    // Ordered list
    if (/^\d+[.)]\s+/.test(line)) {
      const items: string[] = [];
      while (i < lines.length && /^\d+[.)]\s+/.test(lines[i])) {
        items.push(lines[i].replace(/^\d+[.)]\s+/, ''));
        i++;
      }
      blocks.push({ kind: 'ol', items });
      continue;
    }

    // Paragraph (merge consecutive non-empty lines)
    const buf: string[] = [line];
    i++;
    while (
      i < lines.length &&
      lines[i].trim() !== '' &&
      !/^#{2,4}\s+/.test(lines[i]) &&
      !/^```/.test(lines[i]) &&
      !/^[-*+]\s+/.test(lines[i]) &&
      !/^\d+[.)]\s+/.test(lines[i]) &&
      !lines[i].startsWith('>') &&
      !lines[i].trim().startsWith('|')
    ) {
      buf.push(lines[i]);
      i++;
    }
    blocks.push({ kind: 'p', text: buf.join(' ') });
  }

  return blocks;
}

function renderInline(text: string, keyBase: string): ReactNode[] {
  const nodes: ReactNode[] = [];
  // Tokenizer: code, bold, italic, link. Processed left-to-right.
  type Token = { t: 'text' | 'code' | 'bold' | 'italic' | 'link'; v: string; href?: string };
  const tokens: Token[] = [];
  let rest = text;
  const patterns: [RegExp, Token['t']][] = [
    [/^`([^`]+)`/, 'code'],
    [/^\*\*([^*]+)\*\*/, 'bold'],
    [/^__([^_]+)__/, 'bold'],
    [/^\*([^*]+)\*/, 'italic'],
    [/^_([^_]+)_/, 'italic'],
  ];
  const linkRe = /^\[([^\]]+)\]\(([^)\s]+)(?:\s+"[^"]*")?\)/;

  while (rest.length > 0) {
    const linkMatch = rest.match(linkRe);
    if (linkMatch) {
      tokens.push({ t: 'link', v: linkMatch[1], href: linkMatch[2] });
      rest = rest.slice(linkMatch[0].length);
      continue;
    }
    let matched = false;
    for (const [re, kind] of patterns) {
      const m = rest.match(re);
      if (m) {
        tokens.push({ t: kind, v: m[1] });
        rest = rest.slice(m[0].length);
        matched = true;
        break;
      }
    }
    if (matched) continue;
    // Eat one char as literal text, coalescing into the last text token
    const last = tokens[tokens.length - 1];
    if (last?.t === 'text') {
      last.v += rest[0];
    } else {
      tokens.push({ t: 'text', v: rest[0] });
    }
    rest = rest.slice(1);
  }

  tokens.forEach((tok, idx) => {
    const key = `${keyBase}-${idx}`;
    switch (tok.t) {
      case 'text':
        nodes.push(<Fragment key={key}>{tok.v}</Fragment>);
        break;
      case 'code':
        nodes.push(
          <code key={key} className="rounded bg-muted px-1.5 py-0.5 font-mono text-[0.85em]">
            {tok.v}
          </code>,
        );
        break;
      case 'bold':
        nodes.push(
          <strong key={key} className="font-semibold text-foreground">
            {tok.v}
          </strong>,
        );
        break;
      case 'italic':
        nodes.push(
          <em key={key} className="italic">
            {tok.v}
          </em>,
        );
        break;
      case 'link':
        nodes.push(
          <a
            key={key}
            href={tok.href}
            target="_blank"
            rel="noopener noreferrer"
            className="font-medium text-primary underline underline-offset-2 hover:text-primary/80 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
          >
            {tok.v}
          </a>,
        );
        break;
    }
  });

  return nodes;
}

export function Markdown({ source }: { source: string }) {
  const blocks = parseBlocks(source);
  return (
    <div className="flex flex-col gap-4 text-sm leading-relaxed text-foreground/90">
      {blocks.map((b, idx) => {
        const key = `b-${idx}`;
        switch (b.kind) {
          case 'h': {
            const sizes = {
              2: 'text-base font-semibold tracking-tight text-foreground mt-2',
              3: 'text-sm font-semibold tracking-tight text-foreground mt-1',
              4: 'text-sm font-medium tracking-tight text-foreground mt-1',
            } as const;
            if (b.level === 2) {
              return (
                <h3 key={key} className={sizes[2]}>
                  {renderInline(b.text, key)}
                </h3>
              );
            }
            if (b.level === 3) {
              return (
                <h4 key={key} className={sizes[3]}>
                  {renderInline(b.text, key)}
                </h4>
              );
            }
            return (
              <h5 key={key} className={sizes[4]}>
                {renderInline(b.text, key)}
              </h5>
            );
          }
          case 'p':
            return (
              <p key={key} className="text-sm text-foreground/85">
                {renderInline(b.text, key)}
              </p>
            );
          case 'ul':
            return (
              <ul
                key={key}
                className="ml-5 list-disc space-y-1 text-foreground/85 marker:text-muted-foreground"
              >
                {b.items.map((it, i) => {
                  const itemKey = `${key}-${i}-${it.slice(0, 24)}`;
                  return <li key={itemKey}>{renderInline(it, itemKey)}</li>;
                })}
              </ul>
            );
          case 'ol':
            return (
              <ol
                key={key}
                className="ml-5 list-decimal space-y-1 text-foreground/85 marker:text-muted-foreground"
              >
                {b.items.map((it, i) => {
                  const itemKey = `${key}-${i}-${it.slice(0, 24)}`;
                  return <li key={itemKey}>{renderInline(it, itemKey)}</li>;
                })}
              </ol>
            );
          case 'pre':
            return (
              <pre
                key={key}
                className="overflow-x-auto rounded-md border border-border bg-muted/60 p-3 text-xs leading-relaxed"
              >
                <code className="font-mono">{b.text}</code>
              </pre>
            );
          case 'quote':
            return (
              <blockquote
                key={key}
                className="border-l-2 border-border pl-3 text-sm text-muted-foreground italic"
              >
                {renderInline(b.text, key)}
              </blockquote>
            );
          case 'hr':
            return <hr key={key} className="border-border" />;
          case 'table':
            return (
              <div key={key} className="overflow-x-auto rounded-md border border-border">
                <table className="w-full border-collapse text-sm">
                  <thead className="bg-muted/60">
                    <tr>
                      {b.header.map((h, i) => {
                        const thKey = `${key}-h-${i}-${h}`;
                        return (
                          <th
                            key={thKey}
                            className="border-b border-border px-3 py-2 text-left font-semibold text-foreground"
                          >
                            {renderInline(h, thKey)}
                          </th>
                        );
                      })}
                    </tr>
                  </thead>
                  <tbody>
                    {b.rows.map((row, r) => {
                      const rowKey = `${key}-r-${r}-${row.join('|').slice(0, 32)}`;
                      return (
                        <tr key={rowKey} className="odd:bg-background even:bg-muted/20">
                          {row.map((cell, c) => {
                            const cellKey = `${rowKey}-c-${c}`;
                            return (
                              <td
                                key={cellKey}
                                className="border-t border-border px-3 py-2 align-top text-foreground/85"
                              >
                                {renderInline(cell, cellKey)}
                              </td>
                            );
                          })}
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            );
          default:
            return null;
        }
      })}
    </div>
  );
}
