'use client';

import { Markdown as AstryxMarkdown } from '@astryxdesign/core/Markdown';
import type { ReactNode } from 'react';

// Release notes come from an external source (GitHub), so link targets are
// untrusted: only allow schemes that cannot execute script. Parsing with URL
// mirrors browser behavior (control-character stripping, scheme detection).
export function safeHref(href: string): string | null {
  let url: URL;
  try {
    url = new URL(href, 'https://releases.invalid/');
  } catch {
    return null;
  }
  return url.protocol === 'http:' || url.protocol === 'https:' || url.protocol === 'mailto:' ? href : null;
}

function ReleaseLink({ href, children }: { href: string; children: ReactNode }) {
  const safe = safeHref(href);
  if (safe === null) {
    return <>{children}</>;
  }
  return (
    <a
      href={safe}
      target="_blank"
      rel="noopener noreferrer"
      className="font-medium text-primary underline underline-offset-2 hover:text-primary/80 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
    >
      {children}
    </a>
  );
}

// Release notes are external content: rendering `![alt](src)` as a real <img>
// would let it load/track a remote URL just by being displayed. Astryx's own
// `components.image` override only fires for images inline inside a
// paragraph - a line that is *only* `![alt](src)` parses as its own block
// node and always renders a raw <img>, bypassing that override entirely. So
// instead of relying on it, strip the `!` that turns a link into an image
// before parsing: every image (block or inline, direct or reference-style)
// then renders through the already safeHref-gated `link` override above.
// ponytail: plain string replace also rewrites image syntax inside fenced
// code blocks AND inline code spans (display-only artifact). Upgrade path:
// parse-aware stripping.
function stripImageSyntax(source: string): string {
  return source.replace(/!(\[)/g, '$1');
}

export function Markdown({ source }: { source: string }) {
  // headingLevelStart={2}: release bodies use ## for sections; h1 is the page's.
  return (
    <AstryxMarkdown headingLevelStart={2} density="compact" components={{ link: ReleaseLink }}>
      {stripImageSyntax(source)}
    </AstryxMarkdown>
  );
}
