'use client';
import { useRouter } from 'next/navigation';
import { signIn } from 'next-auth/react';
import { useRef, useState } from 'react';

import { LogoMark } from '@/components/logo-mark';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { PasswordInput } from '@/components/ui/password-input';
import { RequiredMark } from '@/components/ui/required-mark';

export function LoginForm({
  oidcAvailable,
  oidcName,
  callbackUrl,
}: {
  oidcAvailable: boolean;
  oidcName: string;
  callbackUrl: string;
}) {
  const router = useRouter();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const [redirecting, setRedirecting] = useState(false);
  const errorRef = useRef<HTMLDivElement | null>(null);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setPending(true);
    const res = await signIn('credentials', {
      email,
      password,
      redirect: false,
    });
    if (res?.error) {
      setError('Invalid email or password');
      setPending(false);
      requestAnimationFrame(() => errorRef.current?.focus());
      return;
    }
    setRedirecting(true);
    router.replace(callbackUrl);
    router.refresh();
  }

  return (
    <main
      id="main"
      tabIndex={-1}
      className="relative mx-auto flex min-h-[100dvh] w-full max-w-sm scroll-mt-16 flex-col justify-center px-4 py-8 outline-none"
    >
      <div aria-hidden className="pointer-events-none fixed inset-0 -z-10 app-backdrop" />
      <div className="rounded-2xl border border-border/60 bg-card/80 p-8 shadow-sm backdrop-blur-sm">
        <div className="mb-6 flex flex-col items-center gap-3">
          <LogoMark size={48} />
          <div className="flex flex-col items-center gap-1">
            <span className="font-mono text-[10px] font-medium uppercase tracking-[0.22em] text-muted-foreground">
              Speedtest · Monitor
            </span>
            <h1 className="text-2xl font-semibold tracking-tight">
              Welcome back<span className="text-brand">.</span>
            </h1>
            <p className="text-sm text-muted-foreground">Sign in to view your network telemetry.</p>
          </div>
        </div>
        <form onSubmit={onSubmit} className="flex flex-col gap-4">
          <p className="text-xs text-muted-foreground">
            Fields marked with <span className="text-destructive">*</span> are required.
          </p>
          <div className="flex flex-col gap-2">
            <Label htmlFor="email">
              Email
              <RequiredMark />
            </Label>
            <Input
              id="email"
              type="email"
              required
              autoComplete="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              aria-invalid={error ? true : undefined}
              aria-describedby={error ? 'login-error' : undefined}
            />
          </div>
          <div className="flex flex-col gap-2">
            <Label htmlFor="password">
              Password
              <RequiredMark />
            </Label>
            <PasswordInput
              id="password"
              required
              autoComplete="current-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              aria-invalid={error ? true : undefined}
              aria-describedby={error ? 'login-error' : undefined}
            />
          </div>
          {error ? (
            <Alert
              id="login-error"
              ref={errorRef}
              tabIndex={-1}
              role="alert"
              variant="destructive"
              className="outline-none"
            >
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          ) : null}
          <Button
            type="submit"
            disabled={pending}
            className="bg-brand text-brand-foreground hover:bg-brand/90 brand-glow"
          >
            {pending ? 'Signing in…' : 'Sign in'}
          </Button>
          <p className="sr-only" aria-live="polite" role="status">
            {redirecting ? 'Signed in, redirecting…' : ''}
          </p>
          {oidcAvailable && (
            <>
              <div className="relative my-1 flex items-center gap-3 text-[10px] font-medium uppercase tracking-[0.18em] text-muted-foreground">
                <span className="h-px flex-1 bg-border/70" />
                <span>or</span>
                <span className="h-px flex-1 bg-border/70" />
              </div>
              <Button
                type="button"
                variant="outline"
                onClick={() => signIn('oidc', { callbackUrl })}
              >
                Sign in with {oidcName}
              </Button>
            </>
          )}
        </form>
      </div>
    </main>
  );
}
