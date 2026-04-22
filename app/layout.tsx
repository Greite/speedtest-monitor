import type { Metadata } from 'next';
import { ThemeProvider } from 'next-themes';
import type { ReactNode } from 'react';
import { Toaster } from 'sonner';
import { SessionShell } from '@/components/auth/session-shell';
import './globals.css';

export const metadata: Metadata = {
  title: 'Speedtest Monitor',
  description: 'Self-hosted internet speed monitor',
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body>
        <a href="#main" className="skip-link">
          Skip to main content
        </a>
        <ThemeProvider attribute="class" defaultTheme="system" enableSystem>
          <SessionShell>{children}</SessionShell>
          <Toaster position="top-right" richColors closeButton />
        </ThemeProvider>
      </body>
    </html>
  );
}
