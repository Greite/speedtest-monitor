'use client';

import { LinkProvider } from '@astryxdesign/core/Link';
import { ToastViewport } from '@astryxdesign/core/Toast';
import { Theme } from '@astryxdesign/core/theme';
import Link from 'next/link';
import { useTheme } from 'next-themes';
import type { ReactNode } from 'react';
import { useEffect, useState } from 'react';

// Pre-built theme (astryx theme build lib/astryx-theme.ts -> lib/speedtest.*).
// __built: true tells <Theme> to skip runtime style injection - the CSS ships
// statically via the @import in app/globals.css. Edit lib/astryx-theme.ts and
// rebuild to change tokens.
import { speedtestTheme } from '@/lib/speedtest';

// Maps next-themes' resolvedTheme to an Astryx mode. Only called after mount
// (see the mounted gate below); an unresolved or unknown value falls back to
// 'system', which follows prefers-color-scheme.
function resolveAstryxMode(resolvedTheme: string | undefined): 'light' | 'dark' | 'system' {
  if (resolvedTheme === 'dark') {
    return 'dark';
  }
  if (resolvedTheme === 'light') {
    return 'light';
  }
  return 'system';
}

export function AstryxProviders({ children }: { children: ReactNode }) {
  const { resolvedTheme } = useTheme();
  // next-themes resolves resolvedTheme synchronously on the client (from
  // localStorage/matchMedia) during its own useState initializer, so it can
  // already be 'light'/'dark' on the very first client render - before that
  // render has been reconciled against the server-rendered 'system' markup.
  // Force 'system' until after mount to keep the Theme wrapper's data-theme
  // attribute identical between server and client hydration passes. 'system'
  // follows prefers-color-scheme, so the visual result stays correct pre-mount;
  // the only gap (user forced a theme opposite to OS) self-corrects at mount.
  const [mounted, setMounted] = useState(false);
  useEffect(() => {
    setMounted(true);
  }, []);
  const mode = mounted ? resolveAstryxMode(resolvedTheme) : 'system';
  return (
    <Theme theme={speedtestTheme} mode={mode}>
      <LinkProvider component={Link}>
        {/* Wraps (not just follows) children: ToastViewport is itself the
            ToastContext.Provider, so useToast() calls in descendants only
            reach this instance - and its `position` - if they render inside
            it. A childless sibling would leave every consumer falling back
            to Astryx's internal self-mounting viewport instead. */}
        <ToastViewport position="topEnd">{children}</ToastViewport>
      </LinkProvider>
    </Theme>
  );
}
