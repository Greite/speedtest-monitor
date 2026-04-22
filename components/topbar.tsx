'use client';

import { LogOut, Menu, Monitor, Moon, Play, Settings, Sun } from 'lucide-react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { signOut, useSession } from 'next-auth/react';
import { useTheme } from 'next-themes';
import { useEffect, useState } from 'react';
import { LogoMark } from '@/components/logo-mark';
import { Button } from '@/components/ui/button';
import { ConfirmDialog } from '@/components/ui/confirm-dialog';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
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
        'inline-block size-2 rounded-full motion-safe:transition-colors motion-safe:duration-300',
        !connected && 'bg-destructive',
        connected && running && 'bg-latency-ok motion-safe:animate-pulse',
        connected && !running && 'bg-latency-ok',
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
    <fieldset
      aria-label="Theme"
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
              'inline-flex items-center justify-center gap-1.5 rounded-sm text-xs font-medium transition-colors',
              withLabels ? 'h-9 flex-1 px-2' : 'size-9 md:size-7',
              active ? 'bg-accent text-foreground' : 'text-muted-foreground hover:text-foreground',
            )}
          >
            <Icon className="size-3.5" aria-hidden />
            {withLabels ? <span>{label}</span> : null}
          </button>
        );
      })}
    </fieldset>
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

  // Auto-close the mobile sheet when crossing the md breakpoint (the trigger is
  // `md:hidden` so desktop users wouldn't reach it otherwise).
  useEffect(() => {
    if (typeof window === 'undefined') return;
    const mq = window.matchMedia('(min-width: 768px)');
    const onChange = (e: MediaQueryListEvent) => {
      if (e.matches) setMenuOpen(false);
    };
    mq.addEventListener('change', onChange);
    return () => mq.removeEventListener('change', onChange);
  }, []);

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
        <Link
          href="/"
          className="flex items-center gap-2 shrink-0"
          aria-label="Speedtest Monitor home"
        >
          <LogoMark size={28} />
          <span className="text-lg font-bold tracking-tight">
            <span className="hidden md:inline">Speedtest Monitor</span>
            <span className="md:hidden">Speedtest</span>
          </span>
        </Link>

        <div className="flex-1" />

        {/* Desktop/tablet cluster */}
        <nav aria-label="Main" className="hidden items-center gap-3 md:flex md:gap-4">
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
            className="border-brand/50 text-brand hover:bg-brand/10 hover:text-brand"
            title={connected ? undefined : 'Waiting for live connection…'}
          >
            <Play className="text-brand" aria-hidden />
            <span>Run now</span>
          </Button>

          <span aria-hidden className="h-6 w-px bg-border" />

          <Button variant="ghost" size="icon-sm" asChild aria-label="Settings">
            <Link href="/settings">
              <Settings aria-hidden />
            </Link>
          </Button>

          <ThemeSegmented mounted={mounted} theme={theme} setTheme={setTheme} />

          <span aria-hidden className="h-6 w-px bg-border" />

          {role ? (
            <span className="rounded bg-muted px-2 py-0.5 text-xs font-bold uppercase tracking-wide text-muted-foreground">
              {role}
            </span>
          ) : null}

          <ConfirmDialog
            trigger={
              <Button
                variant="ghost"
                size="icon-sm"
                aria-label="Log out"
                className="text-destructive hover:bg-destructive/10 hover:text-destructive"
              >
                <LogOut aria-hidden />
              </Button>
            }
            title="Log out?"
            description="You will be signed out and returned to the login page."
            confirmLabel="Log out"
            destructive
            onConfirm={handleLogout}
          />
        </nav>

        {/* Mobile cluster */}
        <div className="flex items-center gap-2 md:hidden">
          <LiveDot running={isBusy} connected={connected} />
          <Button
            variant="outline"
            size="icon-sm"
            onClick={handleRun}
            disabled={isBusy || !connected}
            aria-label="Run now"
            className="border-brand/50 text-brand hover:bg-brand/10 hover:text-brand"
          >
            <Play className="text-brand" aria-hidden />
          </Button>
          <Dialog open={menuOpen} onOpenChange={setMenuOpen}>
            <DialogTrigger asChild>
              <Button
                variant="ghost"
                size="icon-sm"
                aria-label="Open menu"
                aria-expanded={menuOpen}
              >
                <Menu aria-hidden />
              </Button>
            </DialogTrigger>
            <DialogContent className="left-auto right-0 top-0 translate-x-0 translate-y-0 h-full w-full max-w-sm rounded-none border-0 border-l p-4 data-[state=closed]:slide-out-to-right data-[state=open]:slide-in-from-right">
              <DialogHeader className="text-left">
                <DialogTitle className="flex items-center gap-2">
                  <LogoMark size={28} />
                  <span className="text-lg font-bold tracking-tight">Speedtest Monitor</span>
                </DialogTitle>
                <DialogDescription className="sr-only">Main navigation menu</DialogDescription>
              </DialogHeader>

              <nav aria-label="Main" className="flex flex-col gap-4">
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
                    <Play className="text-brand" aria-hidden />
                    Run now
                  </Button>
                </div>

                <div>
                  <div
                    id="theme-label"
                    className="mb-2 text-xs font-medium uppercase tracking-wide text-muted-foreground"
                  >
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
                  <Settings className="size-4" aria-hidden />
                  Settings
                </Link>

                <ConfirmDialog
                  trigger={
                    <button
                      type="button"
                      className="flex items-center gap-3 rounded-md border border-border px-3 py-2 text-sm font-medium text-destructive hover:bg-destructive/10"
                    >
                      <LogOut className="size-4" aria-hidden />
                      Log out
                    </button>
                  }
                  title="Log out?"
                  description="You will be signed out and returned to the login page."
                  confirmLabel="Log out"
                  destructive
                  onConfirm={async () => {
                    setMenuOpen(false);
                    await handleLogout();
                  }}
                />
              </nav>
            </DialogContent>
          </Dialog>
        </div>
      </div>
    </header>
  );
}
