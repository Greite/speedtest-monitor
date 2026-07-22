'use client';
import { Banner } from '@astryxdesign/core/Banner';
import { Button } from '@astryxdesign/core/Button';
import { Card } from '@astryxdesign/core/Card';
import { Heading } from '@astryxdesign/core/Text';
import { TextInput } from '@astryxdesign/core/TextInput';
import { useRouter } from 'next/navigation';
import { useRef, useState } from 'react';

import { LogoMark } from '@/components/logo-mark';
import { parseApiError } from '@/lib/api-client';
import { authClient } from '@/lib/auth/client';
import type { NativeInputAttrs } from '@/lib/native-input-attrs';

export function SetupForm() {
  const router = useRouter();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string[]>>({});
  const [pending, setPending] = useState(false);
  const summaryRef = useRef<HTMLDivElement | null>(null);

  function focusSummary() {
    requestAnimationFrame(() => summaryRef.current?.focus());
  }

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setFieldErrors({});
    if (password !== confirm) {
      setError('Passwords do not match');
      setFieldErrors({ confirm: ['Passwords do not match'] });
      focusSummary();
      return;
    }
    if (password.length < 10) {
      setError('Password must be at least 10 characters');
      setFieldErrors({ password: ['Password must be at least 10 characters'] });
      focusSummary();
      return;
    }
    setPending(true);
    const res = await fetch('/api/auth/setup', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password }),
    });
    if (!res.ok) {
      const apiErr = await parseApiError(res);
      if (apiErr.code === 'validation_failed' && apiErr.fields) {
        setFieldErrors(apiErr.fields);
      }
      setError(apiErr.message);
      setPending(false);
      focusSummary();
      return;
    }
    const signInRes = await authClient.signIn.email({ email, password });
    if (signInRes.error) {
      setError('Account created but sign-in failed. Go to /login.');
      setPending(false);
      return;
    }
    router.replace('/');
    router.refresh();
  }

  const hasErrors = error != null || Object.keys(fieldErrors).length > 0;

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
              Create the first admin<span className="text-brand">.</span>
            </Heading>
            <p className="text-center text-sm text-muted-foreground">
              This page is only accessible until the first user is created.
            </p>
          </div>
        </div>
        <form onSubmit={onSubmit} className="flex flex-col gap-4" noValidate>
          {hasErrors ? (
            <Banner
              ref={summaryRef}
              tabIndex={-1}
              status="error"
              title="Please fix the following:"
              className="outline-none"
              description={
                Object.keys(fieldErrors).length > 0 ? (
                  <ul className="mt-1 list-disc pl-5 text-sm">
                    {fieldErrors.email ? (
                      <li>
                        <a href="#email-field" className="underline">
                          Email: {fieldErrors.email.join(' ')}
                        </a>
                      </li>
                    ) : null}
                    {fieldErrors.password ? (
                      <li>
                        <a href="#password-field" className="underline">
                          Password: {fieldErrors.password.join(' ')}
                        </a>
                      </li>
                    ) : null}
                    {fieldErrors.confirm ? (
                      <li>
                        <a href="#confirm-field" className="underline">
                          Confirm password: {fieldErrors.confirm.join(' ')}
                        </a>
                      </li>
                    ) : null}
                  </ul>
                ) : (
                  error
                )
              }
            />
          ) : null}
          <div id="email-field">
            <TextInput
              label="Email"
              type="email"
              value={email}
              onChange={setEmail}
              isRequired
              status={fieldErrors.email ? { type: 'error', message: fieldErrors.email.join(' ') } : undefined}
              {...({ autoComplete: 'email' } satisfies NativeInputAttrs)}
            />
          </div>
          <div id="password-field">
            <TextInput
              label="Password (min 10 chars)"
              type="password"
              value={password}
              onChange={setPassword}
              isRequired
              status={fieldErrors.password ? { type: 'error', message: fieldErrors.password.join(' ') } : undefined}
              {...({ autoComplete: 'new-password' } satisfies NativeInputAttrs)}
            />
          </div>
          <div id="confirm-field">
            <TextInput
              label="Confirm password"
              type="password"
              value={confirm}
              onChange={setConfirm}
              isRequired
              status={fieldErrors.confirm ? { type: 'error', message: fieldErrors.confirm.join(' ') } : undefined}
              {...({ autoComplete: 'new-password' } satisfies NativeInputAttrs)}
            />
          </div>
          <Button
            type="submit"
            label="Create admin"
            isLoading={pending}
            variant="primary"
            width="100%"
            className="brand-glow"
          />
        </form>
      </Card>
    </main>
  );
}
