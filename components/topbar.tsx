'use client';

import {
  Activity,
  LogOut,
  Menu,
  Monitor,
  Moon,
  Play,
  Settings,
  Sun,
  X,
} from 'lucide-react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { signOut, useSession } from 'next-auth/react';
import { useTheme } from 'next-themes';
import { useEffect, useState } from 'react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { useLiveMeasurements } from './use-live-measurements';

type ThemeChoice = 'light' | 'dark' | 'system';

const THEMES: { value: ThemeChoice; label: string; icon: typeof Sun }[] = [
  { value: 'light', label: 'Light', icon: Sun },
  { value: 'dark', label: 'Dark', icon: Moon },
  { value: 'system', label: 'System', icon: Monitor },
];

function LiveDot({ running, connected }: { running: boolean; connected: boolean }) {
  return (
    <span
      aria-hidden
      className={cn(
        'inline-block size-2 rounded-full',
        !connected && 'bg-destructive',
        connected && running && 'animate-pulse bg-chart-1',
        connected && !running && 'bg-chart-1',
      )}
    />
  );
}

function liveLabel({ running, connected }: { running: boolean; connected: boolean }) {
  if (!connected) return 'Disconnected';
  if (running) return 'Measuring…';
  return 'Idle';
}

function ThemeSegmented({
  mounted,
  theme,
  setTheme,
  withLabels = false,
  fullWidth = false,
}: {
  mounted: boolean;
  theme: string | undefined;
  setTheme: (t: string) => void;
  withLabels?: boolean;
  fullWidth?: boolean;
}) {
  return (
    <div
      className={cn(
        'inline-flex items-center rounded-md border border-border bg-background p-0.5',
        fullWidth && 'w-full',
      )}
    >
      {THEMES.map(({ value, label, icon: Icon }) => {
        const active = mounted && theme === value;
        return (
          <button
            key={value}
            type="button"
            aria-pressed={active}
            aria-label={label}
            onClick={() => setTheme(value)}
            className={cn(
              'inline-flex items-center justify-center gap-1.5 rounded-sm px-2 py-1 text-xs font-medium transition-colors',
              withLabels ? 'flex-1' : 'size-7',
              active ? 'bg-accent text-primary' : 'text-muted-foreground hover:text-foreground',
            )}
          >
            <Icon className="size-3.5" />
            {withLabels ? <span>{label}</span> : null}
          </button>
        );
      })}
    </div>
  );
}

export function Topbar() {
  const { data: session } = useSession();
  const role = session?.user?.role ?? null;
  const { running, connected, triggerRun } = useLiveMeasurements([], '24h');
  const { theme, setTheme } = useTheme();
  const router = useRouter();

  const [mounted, setMounted] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [running2, setRunning2] = useState(false);

  useEffect(() => setMounted(true), []);

  // Close mobile sheet on escape
  useEffect(() => {
    if (!menuOpen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setMenuOpen(false);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [menuOpen]);

  // Prevent body scroll when sheet open
  useEffect(() => {
    if (!menuOpen) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = prev;
    };
  }, [menuOpen]);

  async function handleRun() {
    if (running || running2 || !connected) return;
    setRunning2(true);
    try {
      await triggerRun();
    } catch {
      /* swallow: surfaced elsewhere if needed */
    } finally {
      setRunning2(false);
    }
  }

  async function handleLogout() {
    await signOut({ redirect: false });
    router.replace('/login');
    router.refresh();
  }

  const isBusy = running || running2;
  const label = liveLabel({ running: isBusy, connected });

  return (
    <header className="sticky top-0 z-30 border-b border-border bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/80">
      <div className="mx-auto flex h-14 max-w-6xl items-center gap-3 px-4 md:gap-4 md:px-6">
        {/* Logo */}
        <Link href="/" className="flex items-center gap-2 shrink-0">
          <Activity className="size-5 text-chart-1" aria-hidden />
          <span className="text-lg font-bold tracking-tight">
            <span className="hidden md:inline">Fastcom Monitor</span>
            <span className="md:hidden">Fastcom</span>
          </span>
        </Link>

        <div className="flex-1" />

        {/* Desktop/tablet cluster */}
        <div className="hidden items-center gap-3 md:flex md:gap-4">
          <div
            className="inline-flex items-center gap-2 text-sm text-muted-foreground"
            aria-live="polite"
          >
            <LiveDot running={isBusy} connected={connected} />
            <span>{label}</span>
          </div>

          <Button
            variant="outline"
            size="sm"
            onClick={handleRun}
            disabled={isBusy || !connected}
            className="border-chart-1/50 text-primary hover:bg-chart-1/10 hover:text-primary"
            title={connected ? undefined : 'Waiting for live connection…'}
          >
            <Play className="text-chart-1" />
            <span>Run now</span>
          </Button>

          <span aria-hidden className="h-6 w-px bg-border" />

          <Button variant="ghost" size="icon-sm" asChild aria-label="Settings">
            <Link href="/settings">
              <Settings />
            </Link>
          </Button>

          <ThemeSegmented mounted={mounted} theme={theme} setTheme={setTheme} />

          <span aria-hidden className="h-6 w-px bg-border" />

          {role ? (
            <span className="rounded bg-muted px-2 py-0.5 text-xs font-bold uppercase tracking-wide text-muted-foreground">
              {role}
            </span>
          ) : null}

          <Button
            variant="ghost"
            size="icon-sm"
            onClick={handleLogout}
            aria-label="Log out"
            className="text-destructive hover:bg-destructive/10 hover:text-destructive"
          >
            <LogOut />
          </Button>
        </div>

        {/* Mobile cluster */}
        <div className="flex items-center gap-2 md:hidden">
          <LiveDot running={isBusy} connected={connected} />
          <Button
            variant="outline"
            size="icon-sm"
            onClick={handleRun}
            disabled={isBusy || !connected}
            aria-label="Run now"
            className="border-chart-1/50 text-primary hover:bg-chart-1/10 hover:text-primary"
          >
            <Play className="text-chart-1" />
          </Button>
          <Button
            variant="ghost"
            size="icon-sm"
            onClick={() => setMenuOpen((v) => !v)}
            aria-label="Open menu"
            aria-expanded={menuOpen}
          >
            <Menu />
          </Button>
        </div>
      </div>

      {/* Mobile sheet */}
      {menuOpen ? (
        <div className="fixed inset-0 z-40 md:hidden" role="dialog" aria-modal="true">
          <button
            type="button"
            aria-label="Close menu"
            onClick={() => setMenuOpen(false)}
            className="absolute inset-0 bg-background/80 backdrop-blur-sm"
          />
          <div className="relative ml-auto flex h-full w-full max-w-sm flex-col gap-4 border-l border-border bg-background p-4 shadow-xl animate-in slide-in-from-right">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Activity className="size-5 text-chart-1" aria-hidden />
                <span className="text-lg font-bold tracking-tight">Fastcom Monitor</span>
              </div>
              <Button
                variant="ghost"
                size="icon-sm"
                onClick={() => setMenuOpen(false)}
                aria-label="Close menu"
              >
                <X />
              </Button>
            </div>

            {role ? (
              <div className="flex items-center gap-2">
                <span className="rounded bg-muted px-2 py-0.5 text-xs font-bold uppercase tracking-wide text-muted-foreground">
                  {role}
                </span>
                {session?.user?.email ? (
                  <span className="truncate text-sm text-muted-foreground">
                    {session.user.email}
                  </span>
                ) : null}
              </div>
            ) : null}

            <div className="rounded-md border border-border bg-card p-3">
              <div className="flex items-center gap-2 text-sm">
                <LiveDot running={isBusy} connected={connected} />
                <span className="font-medium">{label}</span>
              </div>
              <p className="mt-1 text-xs text-muted-foreground">
                {connected
                  ? isBusy
                    ? 'Running a measurement now…'
                    : 'Live connection active.'
                  : 'Reconnecting to live feed…'}
              </p>
              <Button
                variant="outline"
                size="sm"
                onClick={async () => {
                  await handleRun();
                }}
                disabled={isBusy || !connected}
                className="mt-3 w-full border-chart-1/50 text-primary hover:bg-chart-1/10 hover:text-primary"
              >
                <Play className="text-chart-1" />
                Run now
              </Button>
            </div>

            <div>
              <div className="mb-2 text-xs font-medium uppercase tracking-wide text-muted-foreground">
                Theme
              </div>
              <ThemeSegmented
                mounted={mounted}
                theme={theme}
                setTheme={setTheme}
                withLabels
                fullWidth
              />
            </div>

            <Link
              href="/settings"
              onClick={() => setMenuOpen(false)}
              className="flex items-center gap-3 rounded-md border border-border px-3 py-2 text-sm font-medium hover:bg-accent"
            >
              <Settings className="size-4" />
              Settings
            </Link>

            <button
              type="button"
              onClick={handleLogout}
              className="flex items-center gap-3 rounded-md border border-border px-3 py-2 text-sm font-medium text-destructive hover:bg-destructive/10"
            >
              <LogOut className="size-4" />
              Log out
            </button>
          </div>
        </div>
      ) : null}
    </header>
  );
}
