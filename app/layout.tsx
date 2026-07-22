import type { Metadata } from 'next';
import { Instrument_Sans, JetBrains_Mono } from 'next/font/google';
import { connection } from 'next/server';
import { ThemeProvider } from 'next-themes';
import type { ReactNode } from 'react';

import { AstryxProviders } from '@/components/astryx-providers';
import { SessionShell } from '@/components/auth/session-shell';
import { FocusMainOnNavigate } from '@/components/focus-main-on-navigate';
import { resolveDisplayConfig } from '@/lib/runtime-config';
import './globals.css';

const sans = Instrument_Sans({
  subsets: ['latin'],
  display: 'swap',
  variable: '--font-sans',
  weight: ['400', '500', '600', '700'],
});

const mono = JetBrains_Mono({
  subsets: ['latin'],
  display: 'swap',
  variable: '--font-mono',
  weight: ['400', '500', '600', '700'],
});

export const metadata: Metadata = {
  title: 'Speedtest Monitor',
  description: 'Self-hosted internet speed monitor',
};

export default async function RootLayout({ children }: { children: ReactNode }) {
  // Force dynamic rendering so the config reflects runtime env vars, never
  // values captured during `next build` (the Docker image is built without
  // SPEEDTEST_LOCALE / SPEEDTEST_TIMEZONE).
  await connection();
  const displayConfig = resolveDisplayConfig();
  const configScript = `window.__SPEEDTEST_CONFIG__=${JSON.stringify(displayConfig).replace(/</g, '\\u003c')}`;

  return (
    <html
      lang={new Intl.Locale(displayConfig.locale).language}
      dir="ltr"
      suppressHydrationWarning
      className={`${sans.variable} ${mono.variable}`}
    >
      <body className="font-sans antialiased">
        {/* Must run before hydration so client formatters resolve the same
            locale/timezone the server rendered with. */}
        {/* biome-ignore lint/security/noDangerouslySetInnerHtml: operator-controlled env values, JSON-encoded with < escaped */}
        <script dangerouslySetInnerHTML={{ __html: configScript }} />
        <a href="#main" className="skip-link">
          Skip to main content
        </a>
        <div aria-hidden className="pointer-events-none fixed inset-0 -z-10 app-backdrop" />
        <ThemeProvider attribute="class" defaultTheme="system" enableSystem>
          <AstryxProviders>
            <FocusMainOnNavigate />
            <SessionShell>{children}</SessionShell>
          </AstryxProviders>
        </ThemeProvider>
      </body>
    </html>
  );
}
