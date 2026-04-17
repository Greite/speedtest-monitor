import type { Metadata } from 'next';
import { ThemeProvider } from 'next-themes';
import type { ReactNode } from 'react';
import { SessionShell } from '@/components/auth/session-shell';
import './globals.css';

export const metadata: Metadata = {
  title: 'Fast.com Monitor',
  description: 'Self-hosted internet speed monitor',
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body>
        <ThemeProvider attribute="class" defaultTheme="system" enableSystem>
          <SessionShell>{children}</SessionShell>
        </ThemeProvider>
      </body>
    </html>
  );
}
