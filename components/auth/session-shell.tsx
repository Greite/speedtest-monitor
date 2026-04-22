'use client';
import { usePathname } from 'next/navigation';
import { SessionProvider } from 'next-auth/react';
import type { ReactNode } from 'react';
import { Footer } from '@/components/footer';
import { Topbar } from '@/components/topbar';

const NO_CHROME_PATHS = new Set(['/login', '/setup']);

export function SessionShell({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const showChrome = !NO_CHROME_PATHS.has(pathname ?? '');
  return (
    <SessionProvider>
      {showChrome && <Topbar />}
      {children}
      {showChrome && <Footer />}
    </SessionProvider>
  );
}
