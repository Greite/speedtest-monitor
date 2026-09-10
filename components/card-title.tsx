import { Heading } from '@astryxdesign/core/Text';
import type { ReactNode } from 'react';

/**
 * The section title shared by every dashboard and settings card: a brand dot
 * followed by an eyebrow-styled level-2 heading. Nine call sites repeated this
 * exact markup, which is how the dot ended up as the most-duplicated fragment
 * in the codebase.
 *
 * The dot is decorative, so it stays out of the accessible name - the heading
 * announces as its text alone.
 */
export function CardTitle({ children }: { children: ReactNode }) {
  return (
    <Heading level={2} className="label-eyebrow flex items-center gap-2">
      <span className="size-1.5 rounded-full bg-brand" aria-hidden />
      {children}
    </Heading>
  );
}
