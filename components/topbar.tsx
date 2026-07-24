'use client';

import { Button } from '@astryxdesign/core/Button';
import { Dialog } from '@astryxdesign/core/Dialog';
import { IconButton } from '@astryxdesign/core/IconButton';
import { Heading, Text } from '@astryxdesign/core/Text';
import { Token } from '@astryxdesign/core/Token';
import { ChevronRight, LogOut, Menu, Monitor, Moon, Play, Settings, Sun, X } from 'lucide-react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useTheme } from 'next-themes';
import { type ReactNode, useEffect, useId, useState } from 'react';

import { useLiveMeasurements } from './use-live-measurements';

import { LogoMark } from '@/components/logo-mark';
import { authClient } from '@/lib/auth/client';
import { cn } from '@/lib/utils';

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
        className={cn('absolute inset-0 rounded-full motion-safe:transition-colors motion-safe:duration-300', tone)}
      />
      {connected && running ? (
        <span className={cn('pulse-ring absolute inset-0 rounded-full', 'text-latency-ok')} />
      ) : null}
    </span>
  );
}

function liveLabel({ running, connected }: { running: boolean; connected: boolean }) {
  if (!connected) {
    return 'Disconnected';
  }
  if (running) {
    return 'Measuring…';
  }
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

// Replaces the old shadcn ConfirmDialog (which only wrapped the shadcn Dialog
// + Button). Topbar is its sole consumer, so it's kept local rather than
// promoted to a shared component - mirrors the pattern already established by
// components/users/delete-user-dialog.tsx (Astryx Dialog does not
// auto-generate aria-labelledby/aria-describedby, so title/description are
// linked explicitly via useId()).
function LogoutConfirmDialog({
  open,
  onOpenChange,
  onConfirm,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onConfirm: () => void | Promise<void>;
}) {
  const titleId = useId();
  const descriptionId = useId();
  const [busy, setBusy] = useState(false);

  async function handleConfirm() {
    setBusy(true);
    try {
      await onConfirm();
      onOpenChange(false);
    } finally {
      setBusy(false);
    }
  }

  return (
    <Dialog
      isOpen={open}
      onOpenChange={onOpenChange}
      purpose="form"
      role="alertdialog"
      width={400}
      aria-labelledby={titleId}
      aria-describedby={descriptionId}
    >
      <div className="flex flex-col gap-4">
        <div className="flex flex-col gap-1">
          <Heading level={2} id={titleId}>
            Log out?
          </Heading>
          <Text type="body" color="secondary" id={descriptionId}>
            You will be signed out and returned to the login page.
          </Text>
        </div>
        <div className="flex justify-end gap-2">
          <Button variant="ghost" label="Cancel" isDisabled={busy} onClick={() => onOpenChange(false)} />
          <Button
            variant="destructive"
            label={busy ? 'Working…' : 'Log out'}
            isLoading={busy}
            onClick={handleConfirm}
          />
        </div>
      </div>
    </Dialog>
  );
}

function DrawerSection({
  id,
  title,
  delay,
  children,
}: {
  id: string;
  title: string;
  delay: number;
  children: ReactNode;
}) {
  return (
    <section aria-labelledby={id} className="drawer-section" style={{ animationDelay: `${delay}ms` }}>
      <h3 id={id} className="mb-2 text-[10px] font-medium uppercase tracking-[0.18em] text-muted-foreground">
        {title}
      </h3>
      {children}
    </section>
  );
}

export function Topbar() {
  const { data: session } = authClient.useSession();
  const role = (session?.user as { role?: 'admin' | 'viewer' } | undefined)?.role ?? null;
  const { running, connected, triggerRun } = useLiveMeasurements([], '24h');
  const { theme, setTheme } = useTheme();
  const router = useRouter();
  const pathname = usePathname();

  const [mounted, setMounted] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [logoutOpen, setLogoutOpen] = useState(false);

  useEffect(() => setMounted(true), []);

  useEffect(() => {
    if (typeof window === 'undefined') {
      return;
    }
    const mq = window.matchMedia('(min-width: 768px)');
    const onChange = (e: MediaQueryListEvent) => {
      if (e.matches) {
        setMenuOpen(false);
      }
    };
    mq.addEventListener('change', onChange);
    return () => mq.removeEventListener('change', onChange);
  }, []);

  const isBusy = running;

  async function handleRun() {
    if (isBusy || !connected) {
      return;
    }
    try {
      await triggerRun();
    } catch {
      /* swallow: surfaced elsewhere if needed */
    }
  }

  async function handleLogout() {
    await authClient.signOut();
    router.replace('/login');
    router.refresh();
  }

  async function onLogoutConfirmed() {
    setMenuOpen(false);
    await handleLogout();
  }

  const label = liveLabel({ running: isBusy, connected });
  const runClassName = cn('bg-brand text-brand-foreground hover:bg-brand-hover', !isBusy && connected && 'brand-glow');
  const runProps = {
    label: isBusy ? 'Running…' : 'Run now',
    isLoading: isBusy,
    isDisabled: isBusy || !connected,
    onClick: handleRun,
    variant: 'primary',
  } as const;

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
          <div aria-live="polite">
            <Token
              label={label}
              icon={<LiveDot running={isBusy} connected={connected} />}
              size="sm"
              className="border border-border/60 bg-card/40 text-muted-foreground"
            />
          </div>

          <Button
            {...runProps}
            icon={<Play aria-hidden className={cn('size-3.5', isBusy && 'animate-pulse')} />}
            tooltip={connected ? undefined : 'Waiting for live connection…'}
            size="sm"
            className={runClassName}
          />

          <span aria-hidden className="mx-1 h-6 w-px bg-border/70" />

          <IconButton
            icon={<Settings aria-hidden className="size-4" />}
            label="Settings"
            href="/settings"
            variant="ghost"
            size="sm"
            className="min-h-11 min-w-11 md:min-h-7 md:min-w-7"
          />

          <ThemeSegmented mounted={mounted} theme={theme} setTheme={setTheme} />

          {role ? (
            <Token
              label={role}
              icon={<span className="size-1 rounded-full bg-brand" aria-hidden />}
              size="sm"
              className="ml-1 font-mono text-[10px] font-semibold uppercase tracking-[0.14em]"
            />
          ) : null}

          <IconButton
            icon={<LogOut aria-hidden className="size-4" />}
            label="Log out"
            variant="ghost"
            size="sm"
            className="min-h-11 min-w-11 md:min-h-7 md:min-w-7 text-muted-foreground hover:bg-destructive/10 hover:text-destructive"
            onClick={() => setLogoutOpen(true)}
          />
        </nav>

        {/* Mobile cluster */}
        <div className="flex items-center gap-2 md:hidden">
          <LiveDot running={isBusy} connected={connected} />
          <IconButton
            {...runProps}
            icon={<Play aria-hidden className={cn('size-4', isBusy && 'animate-pulse')} />}
            size="sm"
            className={cn('min-h-11 min-w-11', runClassName)}
          />
          <IconButton
            icon={<Menu aria-hidden className="size-4" />}
            label="Open menu"
            aria-expanded={menuOpen}
            onClick={() => setMenuOpen(true)}
            variant="ghost"
            size="sm"
            className="min-h-11 min-w-11"
          />
          <Dialog
            isOpen={menuOpen}
            onOpenChange={setMenuOpen}
            variant="fullscreen"
            purpose="info"
            padding={0}
            aria-label="Main menu"
          >
            <div className="relative flex h-full flex-col bg-background/95 backdrop-blur-xl">
              <div aria-hidden className="pointer-events-none absolute inset-0 -z-10 app-backdrop" />
              <div className="flex items-center justify-between border-b border-border/50 px-5 py-4">
                <div className="flex items-center gap-2.5">
                  <LogoMark size={28} />
                  <span aria-hidden className="text-lg font-semibold leading-none tracking-tight">
                    Speedtest<span className="text-muted-foreground">·</span>Monitor
                  </span>
                </div>
                <IconButton
                  icon={<X aria-hidden className="size-4" />}
                  label="Close menu"
                  variant="ghost"
                  size="sm"
                  className="min-h-11 min-w-11"
                  onClick={() => setMenuOpen(false)}
                />
              </div>

              <nav aria-label="Main" className="flex flex-1 flex-col gap-5 overflow-y-auto px-5 py-5">
                {role ? (
                  <DrawerSection id="m-account" title="Account" delay={0}>
                    <div className="flex items-center gap-2 rounded-md border border-border/60 bg-card/70 px-3 py-2">
                      <Token
                        label={role}
                        icon={<span className="size-1 rounded-full bg-brand" aria-hidden />}
                        size="sm"
                        className="shrink-0 font-mono text-[10px] font-semibold uppercase tracking-[0.14em]"
                      />
                      {session?.user?.email ? (
                        <span className="min-w-0 truncate text-sm text-muted-foreground" title={session.user.email}>
                          {session.user.email}
                        </span>
                      ) : null}
                    </div>
                  </DrawerSection>
                ) : null}

                <DrawerSection id="m-live" title="Live status" delay={40}>
                  <div
                    className={cn(
                      'rounded-md border border-border/60 bg-card/70 p-3 transition-shadow duration-300',
                      isBusy && 'live-glow',
                    )}
                  >
                    <div className="flex items-center gap-2 text-sm">
                      <LiveDot running={isBusy} connected={connected} />
                      <span className="font-medium">{label}</span>
                    </div>
                    <p className="mt-1 text-xs text-muted-foreground">
                      {!connected && 'Reconnecting to live feed…'}
                      {connected && isBusy && 'Running a measurement now…'}
                      {connected && !isBusy && 'Live connection active.'}
                    </p>
                    <Button
                      {...runProps}
                      icon={<Play aria-hidden className={cn('size-4', isBusy && 'animate-pulse')} />}
                      width="100%"
                      className={cn('mt-3 min-h-11', runClassName)}
                    />
                  </div>
                </DrawerSection>

                <DrawerSection id="m-theme" title="Theme" delay={80}>
                  <ThemeSegmented mounted={mounted} theme={theme} setTheme={setTheme} withLabels fullWidth />
                </DrawerSection>

                <DrawerSection id="m-nav" title="Navigation" delay={120}>
                  <ul className="flex flex-col gap-2">
                    {[
                      { href: '/settings', label: 'Settings', icon: Settings },
                      { href: '/changelog', label: 'Changelog', icon: null },
                    ].map(({ href, label: navLabel, icon: Icon }) => {
                      const active = pathname === href;
                      return (
                        <li key={href}>
                          <Link
                            href={href}
                            onClick={() => setMenuOpen(false)}
                            aria-current={active ? 'page' : undefined}
                            className={cn(
                              'group flex min-h-[44px] items-center justify-between gap-3 rounded-md border px-3 py-3 text-sm font-medium transition-colors',
                              'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background',
                              active
                                ? 'border-brand/40 bg-brand/10 text-foreground'
                                : 'border-border/60 bg-card/70 hover:bg-accent',
                            )}
                          >
                            <span className="flex items-center gap-2.5">
                              {Icon ? (
                                <Icon
                                  className={cn(
                                    'size-4',
                                    active ? 'text-brand' : 'text-muted-foreground group-hover:text-foreground',
                                  )}
                                  aria-hidden
                                />
                              ) : null}
                              {navLabel}
                            </span>
                            <ChevronRight
                              aria-hidden
                              className={cn(
                                'size-4 transition-transform',
                                active ? 'text-brand' : 'text-muted-foreground group-hover:translate-x-0.5',
                              )}
                            />
                          </Link>
                        </li>
                      );
                    })}
                  </ul>
                </DrawerSection>

                <div className="drawer-section mt-auto pt-2" style={{ animationDelay: '160ms' }}>
                  <Button
                    label="Log out"
                    icon={<LogOut aria-hidden className="size-4" />}
                    variant="ghost"
                    width="100%"
                    onClick={() => setLogoutOpen(true)}
                    className="min-h-11 justify-start border border-destructive/30 bg-destructive/5 text-destructive hover:bg-destructive/10"
                  />
                </div>
              </nav>
            </div>
          </Dialog>
        </div>
      </div>

      <LogoutConfirmDialog open={logoutOpen} onOpenChange={setLogoutOpen} onConfirm={onLogoutConfirmed} />
    </header>
  );
}
