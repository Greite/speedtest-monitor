'use client';
import { SessionProvider } from 'next-auth/react';
import { usePathname } from 'next/navigation';
import type { ReactNode } from 'react';
import { UserMenu } from './user-menu';

const NO_HEADER_PATHS = new Set(['/login', '/setup']);

export function SessionShell({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const showHeader = !NO_HEADER_PATHS.has(pathname ?? '');
  return (
    <SessionProvider>
      {showHeader && (
        <header className="flex items-center justify-between border-b px-6 py-3">
          <span className="font-semibold">Fastcom Monitor</span>
          <UserMenu />
        </header>
      )}
      {children}
    </SessionProvider>
  );
}
