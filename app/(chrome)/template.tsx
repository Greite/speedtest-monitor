import { type ReactNode, ViewTransition } from 'react';

// A template remounts on every navigation (a layout persists), so the outgoing
// page exits and the incoming one enters: a crossfade between pages. Updates
// within a page are left to inner <ViewTransition>s (default="none").
export default function ChromeTemplate({ children }: { children: ReactNode }) {
  return (
    <ViewTransition enter="auto" exit="auto" default="none">
      {children}
    </ViewTransition>
  );
}
