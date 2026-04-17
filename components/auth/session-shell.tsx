'use client';
import { SessionProvider } from 'next-auth/react';
import type { ReactNode } from 'react';
import { UserMenu } from './user-menu';

export function SessionShell({ children }: { children: ReactNode }) {
  return (
    <SessionProvider>
      <header className="flex items-center justify-between border-b px-6 py-3">
        <span className="font-semibold">Fastcom Monitor</span>
        <UserMenu />
      </header>
      {children}
    </SessionProvider>
  );
}
