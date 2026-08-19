'use client';
import { Banner } from '@astryxdesign/core/Banner';
import { Button } from '@astryxdesign/core/Button';
import { Card } from '@astryxdesign/core/Card';
import { Heading } from '@astryxdesign/core/Text';
import { TextInput } from '@astryxdesign/core/TextInput';
import { useRouter } from 'next/navigation';
import { useRef, useState } from 'react';

import { LogoMark } from '@/components/logo-mark';
import { authClient } from '@/lib/auth/client';
import type { NativeInputAttrs } from '@/lib/native-input-attrs';

const LOGIN_ERROR_ID = 'login-error';

// TextInput always computes its own aria-describedby internally (from label,
// description, and status.message) and applies it to the <input> *after* the
// ...rest spread, so passing aria-describedby as a prop is silently
// overridden - associating a field with the separate error Banner can only be
// done imperatively, via ref, once TextInput has rendered. TextInput's
// internal mergeRefs is unmemoized (verified in TextInput.js), so this ref
// callback re-fires on every render - relied on here, not fought: it keeps
// the attribute in sync as `describedById` flips between the Banner's id and
// null when the error appears/clears.
function syncErrorDescribedBy(describedById: string | null) {
  return (el: HTMLInputElement | null) => {
    if (!el) {
      return;
    }
    if (describedById) {
      el.setAttribute('aria-describedby', describedById);
    } else {
      el.removeAttribute('aria-describedby');
    }
  };
}

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
    const res = await authClient.signIn.email({ email, password });
    if (res.error) {
      setError('Invalid email or password');
      setPending(false);
      requestAnimationFrame(() => errorRef.current?.focus());
      return;
    }
    setRedirecting(true);
    router.replace(callbackUrl);
    router.refresh();
  }

  async function onOidc() {
    setError(null);
    setPending(true);
    const res = await authClient.signIn.social({
      provider: 'oidc',
      callbackURL: callbackUrl,
    });
    if (res.error) {
      setError('SSO sign-in failed. Try again.');
      setPending(false);
    }
  }

  return (
    <main
      id="main"
      tabIndex={-1}
      className="relative mx-auto flex min-h-[100dvh] w-full max-w-sm scroll-mt-16 flex-col justify-center px-4 py-8 outline-none"
    >
      <div aria-hidden className="pointer-events-none fixed inset-0 -z-10 app-backdrop" />
      <Card variant="transparent" padding={0} className="rounded-2xl border border-border/60 bg-card/80 p-8 shadow-sm">
        <div className="mb-6 flex flex-col items-center gap-3">
          <LogoMark size={48} />
          <div className="flex flex-col items-center gap-1">
            <span className="font-mono text-[10px] font-medium uppercase tracking-[0.22em] text-muted-foreground">
              Speedtest·Monitor
            </span>
            <Heading level={1} className="text-2xl font-semibold tracking-tight">
              Welcome back<span className="text-brand">.</span>
            </Heading>
            <p className="text-sm text-muted-foreground">Sign in to view your network telemetry.</p>
          </div>
        </div>
        <form onSubmit={onSubmit} className="flex flex-col gap-4">
          <TextInput
            label="Email"
            type="email"
            value={email}
            onChange={setEmail}
            isRequired
            status={error ? { type: 'error' } : undefined}
            ref={syncErrorDescribedBy(error ? LOGIN_ERROR_ID : null)}
            {...({ autoComplete: 'email', required: true } satisfies NativeInputAttrs)}
          />
          <TextInput
            label="Password"
            type="password"
            value={password}
            onChange={setPassword}
            isRequired
            status={error ? { type: 'error' } : undefined}
            ref={syncErrorDescribedBy(error ? LOGIN_ERROR_ID : null)}
            {...({ autoComplete: 'current-password', required: true } satisfies NativeInputAttrs)}
          />
          {error ? (
            <Banner
              id={LOGIN_ERROR_ID}
              ref={errorRef}
              tabIndex={-1}
              status="error"
              title={error}
              className="outline-none"
            />
          ) : null}
          <Button
            type="submit"
            label="Sign in"
            isLoading={pending}
            variant="primary"
            width="100%"
            className="brand-glow"
          />
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
                variant="secondary"
                isDisabled={pending}
                label={`Sign in with ${oidcName}`}
                onClick={onOidc}
              />
            </>
          )}
        </form>
      </Card>
    </main>
  );
}
