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

export function Markdown({ source }: { source: string }) {
  // headingLevelStart={2}: release bodies use ## for sections; h1 is the page's.
  return (
    <AstryxMarkdown headingLevelStart={2} density="compact" components={{ link: ReleaseLink }}>
      {source}
    </AstryxMarkdown>
  );
}
