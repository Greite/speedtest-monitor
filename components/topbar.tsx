'use client';

import { Check, LogOut, Menu, Monitor, Moon, Play, Settings, Sun } from 'lucide-react';
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
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { cn } from '@/lib/utils';
import { useLiveMeasurements } from './use-live-measurements';

type ThemeChoice = 'light' | 'dark' | 'system';

const THEMES: { value: ThemeChoice; label: string; icon: typeof Sun }[] = [
  { value: 'light', label: 'Light', icon: Sun },
  { value: 'dark', label: 'Dark', icon: Moon },
  { value: 'system', label: 'System', icon: Monitor },
];

function LiveDot({ running, connected }: { running: boolean; connected: boolean }) {
  const tone = !connected ? 'bg-destructive text-destructive' : 'bg-latency-ok text-latency-ok';
  return (
    <span aria-hidden className="relative inline-flex size-2 items-center justify-center">
      <span
        className={cn(
          'absolute inset-0 rounded-full motion-safe:transition-colors motion-safe:duration-300',
          tone,
        )}
      />
      {connected && running ? (
        <span className={cn('pulse-ring absolute inset-0 rounded-full', 'text-latency-ok')} />
      ) : null}
    </span>
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

function ThemeMenu({
  mounted,
  theme,
  setTheme,
}: {
  mounted: boolean;
  theme: string | undefined;
  setTheme: (t: string) => void;
}) {
  const current = THEMES.find((t) => mounted && t.value === theme) ?? THEMES[2];
  const CurrentIcon = current.icon;
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="icon-sm" aria-label={`Theme: ${current.label}`}>
          <CurrentIcon aria-hidden />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="min-w-[10rem]">
        <DropdownMenuLabel className="text-[10px] font-medium uppercase tracking-[0.14em] text-muted-foreground">
          Theme
        </DropdownMenuLabel>
        <DropdownMenuSeparator />
        {THEMES.map(({ value, label, icon: Icon }) => {
          const active = mounted && theme === value;
          return (
            <DropdownMenuItem
              key={value}
              onSelect={() => setTheme(value)}
              className={cn('gap-2', active && 'bg-accent text-accent-foreground')}
            >
              <Icon className="size-4" aria-hidden />
              <span>{label}</span>
              {active ? <Check className="ml-auto size-3.5" aria-hidden /> : null}
            </DropdownMenuItem>
          );
        })}
      </DropdownMenuContent>
    </DropdownMenu>
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
    <header className="sticky top-0 z-30 border-b border-border/60 bg-background/70 backdrop-blur-xl supports-[backdrop-filter]:bg-background/60">
      <div className="mx-auto flex h-14 max-w-6xl items-center gap-3 px-4 md:gap-4 md:px-6">
        {/* Logo */}
        <Link
          href="/"
          className="group flex items-center gap-2.5 shrink-0 outline-none focus-visible:ring-2 focus-visible:ring-ring rounded-md"
          aria-label="Speedtest Monitor home"
        >
          <LogoMark size={28} className="transition-transform group-hover:scale-105" />
          <span className="text-base font-semibold leading-none tracking-tight">
            <span className="hidden md:inline">Speedtest · Monitor</span>
            <span className="md:hidden">Speedtest</span>
          </span>
        </Link>

        <div className="flex-1" />

        {/* Desktop/tablet cluster */}
        <nav aria-label="Main" className="hidden items-center gap-2 md:flex md:gap-3">
          <div
            className="inline-flex items-center gap-2 rounded-full border border-border/60 bg-card/40 px-2.5 py-1 text-xs text-muted-foreground"
            aria-live="polite"
          >
            <LiveDot running={isBusy} connected={connected} />
            <span className="font-medium tracking-wide">{label}</span>
          </div>

          <Button
            size="sm"
            onClick={handleRun}
            disabled={isBusy || !connected}
            className={cn(
              'bg-brand text-brand-foreground hover:bg-brand/90',
              !isBusy && connected && 'brand-glow',
            )}
            title={connected ? undefined : 'Waiting for live connection…'}
          >
            <Play aria-hidden className={cn('size-3.5', isBusy && 'animate-pulse')} />
            <span>{isBusy ? 'Running…' : 'Run now'}</span>
          </Button>

          <span aria-hidden className="mx-1 h-6 w-px bg-border/70" />

          <Button variant="ghost" size="icon-sm" asChild aria-label="Settings">
            <Link href="/settings">
              <Settings aria-hidden />
            </Link>
          </Button>

          <ThemeMenu mounted={mounted} theme={theme} setTheme={setTheme} />

          {role ? (
            <span className="ml-1 inline-flex items-center gap-1 rounded-full border border-border/60 bg-muted/40 px-2 py-0.5 font-mono text-[10px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">
              <span className="size-1 rounded-full bg-brand" aria-hidden />
              {role}
            </span>
          ) : null}

          <ConfirmDialog
            trigger={
              <Button
                variant="ghost"
                size="icon-sm"
                aria-label="Log out"
                className="text-muted-foreground hover:bg-destructive/10 hover:text-destructive"
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
            size="icon-sm"
            onClick={handleRun}
            disabled={isBusy || !connected}
            aria-label="Run now"
            className={cn(
              'bg-brand text-brand-foreground hover:bg-brand/90',
              !isBusy && connected && 'brand-glow',
            )}
          >
            <Play aria-hidden className={cn(isBusy && 'animate-pulse')} />
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
            <DialogContent
              className={cn(
                'left-auto right-0 top-0 h-full w-full max-w-sm translate-x-0 translate-y-0 rounded-none border-0 border-l border-border/60 bg-background/95 p-0 backdrop-blur-xl',
                'data-[state=closed]:slide-out-to-right data-[state=open]:slide-in-from-right',
              )}
            >
              <div
                aria-hidden
                className="pointer-events-none absolute inset-0 -z-10 app-backdrop"
              />
              <DialogHeader className="border-b border-border/50 px-5 py-4 text-left">
                <DialogTitle className="flex items-center gap-2.5">
                  <LogoMark size={28} />
                  <span className="text-base font-semibold leading-none tracking-tight">
                    Speedtest<span className="text-muted-foreground">·</span>Monitor
                  </span>
                </DialogTitle>
                <DialogDescription className="sr-only">Main navigation menu</DialogDescription>
              </DialogHeader>

              <nav
                aria-label="Main"
                className="flex flex-1 flex-col gap-5 overflow-y-auto px-5 py-5"
              >
                {role ? (
                  <section aria-labelledby="m-account">
                    <h3
                      id="m-account"
                      className="mb-2 text-[10px] font-medium uppercase tracking-[0.18em] text-muted-foreground"
                    >
                      Account
                    </h3>
                    <div className="flex items-center gap-2 rounded-md border border-border/60 bg-card/70 px-3 py-2 backdrop-blur-sm">
                      <span className="inline-flex items-center gap-1 rounded-full border border-border/60 bg-muted/40 px-2 py-0.5 font-mono text-[10px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">
                        <span className="size-1 rounded-full bg-brand" aria-hidden />
                        {role}
                      </span>
                      {session?.user?.email ? (
                        <span className="min-w-0 truncate text-sm text-muted-foreground">
                          {session.user.email}
                        </span>
                      ) : null}
                    </div>
                  </section>
                ) : null}

                <section aria-labelledby="m-live">
                  <h3
                    id="m-live"
                    className="mb-2 text-[10px] font-medium uppercase tracking-[0.18em] text-muted-foreground"
                  >
                    Live status
                  </h3>
                  <div
                    className={cn(
                      'rounded-md border border-border/60 bg-card/80 p-3 backdrop-blur-sm transition-shadow',
                      isBusy && 'live-glow',
                    )}
                  >
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
                      size="sm"
                      onClick={async () => {
                        await handleRun();
                      }}
                      disabled={isBusy || !connected}
                      className={cn(
                        'mt-3 w-full bg-brand text-brand-foreground hover:bg-brand/90',
                        !isBusy && connected && 'brand-glow',
                      )}
                    >
                      <Play aria-hidden className={cn(isBusy && 'animate-pulse')} />
                      {isBusy ? 'Running…' : 'Run now'}
                    </Button>
                  </div>
                </section>

                <section aria-labelledby="m-theme">
                  <h3
                    id="m-theme"
                    className="mb-2 text-[10px] font-medium uppercase tracking-[0.18em] text-muted-foreground"
                  >
                    Theme
                  </h3>
                  <ThemeSegmented
                    mounted={mounted}
                    theme={theme}
                    setTheme={setTheme}
                    withLabels
                    fullWidth
                  />
                </section>

                <section aria-labelledby="m-nav">
                  <h3
                    id="m-nav"
                    className="mb-2 text-[10px] font-medium uppercase tracking-[0.18em] text-muted-foreground"
                  >
                    Navigation
                  </h3>
                  <ul className="flex flex-col gap-2">
                    <li>
                      <Link
                        href="/settings"
                        onClick={() => setMenuOpen(false)}
                        className="group flex items-center justify-between gap-3 rounded-md border border-border/60 bg-card/60 px-3 py-2.5 text-sm font-medium backdrop-blur-sm transition-colors hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                      >
                        <span className="flex items-center gap-2.5">
                          <Settings
                            className="size-4 text-muted-foreground group-hover:text-foreground"
                            aria-hidden
                          />
                          Settings
                        </span>
                        <span
                          aria-hidden
                          className="text-muted-foreground transition-transform group-hover:translate-x-0.5"
                        >
                          →
                        </span>
                      </Link>
                    </li>
                    <li>
                      <Link
                        href="/changelog"
                        onClick={() => setMenuOpen(false)}
                        className="group flex items-center justify-between gap-3 rounded-md border border-border/60 bg-card/60 px-3 py-2.5 text-sm font-medium backdrop-blur-sm transition-colors hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                      >
                        <span className="flex items-center gap-2.5">
                          <span
                            aria-hidden
                            className="inline-block size-1.5 rounded-full bg-latency-ok"
                          />
                          Changelog
                        </span>
                        <span
                          aria-hidden
                          className="text-muted-foreground transition-transform group-hover:translate-x-0.5"
                        >
                          →
                        </span>
                      </Link>
                    </li>
                  </ul>
                </section>

                <div className="mt-auto pt-2">
                  <ConfirmDialog
                    trigger={
                      <button
                        type="button"
                        className="flex w-full items-center justify-center gap-2 rounded-md border border-destructive/30 bg-destructive/5 px-3 py-2.5 text-sm font-medium text-destructive transition-colors hover:bg-destructive/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-destructive/40"
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
                </div>
              </nav>
            </DialogContent>
          </Dialog>
        </div>
      </div>
    </header>
  );
}
