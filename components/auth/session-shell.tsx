'use client';
import { usePathname } from 'next/navigation';
import { SessionProvider } from 'next-auth/react';
import type { ReactNode } from 'react';
import { Topbar } from '@/components/topbar';

const NO_HEADER_PATHS = new Set(['/login', '/setup']);

export function SessionShell({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const showHeader = !NO_HEADER_PATHS.has(pathname ?? '');
  return (
    <SessionProvider>
      {showHeader && <Topbar />}
      {children}
    </SessionProvider>
  );
}
