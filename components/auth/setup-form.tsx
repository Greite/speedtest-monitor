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
import { parseApiError } from '@/lib/api-client';

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
    const signInRes = await signIn('credentials', { email, password, redirect: false });
    if (signInRes?.error) {
      setError('Account created but sign-in failed. Go to /login.');
      setPending(false);
      return;
    }
    router.replace('/');
    router.refresh();
  }

  return (
    <main
      id="main"
      tabIndex={-1}
      className="mx-auto flex min-h-[100dvh] max-w-sm scroll-mt-16 flex-col justify-center px-4 py-8 outline-none"
    >
      <form onSubmit={onSubmit} className="flex flex-col gap-4" noValidate>
        <div className="mb-2 flex flex-col items-center gap-3">
          <LogoMark size={44} />
          <h1 className="text-2xl font-semibold tracking-tight">Create the first admin</h1>
          <p className="text-center text-sm text-muted-foreground">
            This page is only accessible until the first user is created.
          </p>
        </div>
        <p className="text-xs text-muted-foreground">
          Fields marked with <span className="text-destructive">*</span> are required.
        </p>
        {error || Object.keys(fieldErrors).length > 0 ? (
          <Alert
            ref={summaryRef}
            tabIndex={-1}
            variant="destructive"
            role="alert"
            className="outline-none"
          >
            <AlertDescription>
              <p className="font-medium">Please fix the following:</p>
              <ul className="mt-1 list-disc pl-5 text-sm">
                {error && Object.keys(fieldErrors).length === 0 ? <li>{error}</li> : null}
                {fieldErrors.email ? (
                  <li>
                    <a href="#email" className="underline">
                      Email: {fieldErrors.email.join(' ')}
                    </a>
                  </li>
                ) : null}
                {fieldErrors.password ? (
                  <li>
                    <a href="#password" className="underline">
                      Password: {fieldErrors.password.join(' ')}
                    </a>
                  </li>
                ) : null}
                {fieldErrors.confirm ? (
                  <li>
                    <a href="#confirm" className="underline">
                      Confirm password: {fieldErrors.confirm.join(' ')}
                    </a>
                  </li>
                ) : null}
              </ul>
            </AlertDescription>
          </Alert>
        ) : null}
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
            aria-invalid={fieldErrors.email ? true : undefined}
            aria-describedby={fieldErrors.email ? 'email-error' : undefined}
          />
          {fieldErrors.email ? (
            <p id="email-error" className="text-xs text-destructive">
              {fieldErrors.email.join(' ')}
            </p>
          ) : null}
        </div>
        <div className="flex flex-col gap-2">
          <Label htmlFor="password">
            Password (min 10 chars)
            <RequiredMark />
          </Label>
          <PasswordInput
            id="password"
            required
            autoComplete="new-password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            aria-invalid={fieldErrors.password ? true : undefined}
            aria-describedby={fieldErrors.password ? 'password-error' : undefined}
          />
          {fieldErrors.password ? (
            <p id="password-error" className="text-xs text-destructive">
              {fieldErrors.password.join(' ')}
            </p>
          ) : null}
        </div>
        <div className="flex flex-col gap-2">
          <Label htmlFor="confirm">
            Confirm password
            <RequiredMark />
          </Label>
          <PasswordInput
            id="confirm"
            required
            autoComplete="new-password"
            value={confirm}
            onChange={(e) => setConfirm(e.target.value)}
            aria-invalid={fieldErrors.confirm ? true : undefined}
            aria-describedby={fieldErrors.confirm ? 'confirm-error' : undefined}
          />
          {fieldErrors.confirm ? (
            <p id="confirm-error" className="text-xs text-destructive">
              {fieldErrors.confirm.join(' ')}
            </p>
          ) : null}
        </div>
        <Button type="submit" disabled={pending}>
          {pending ? 'Creating...' : 'Create admin'}
        </Button>
      </form>
    </main>
  );
}
