'use client';
import { useRouter } from 'next/navigation';
import { signIn } from 'next-auth/react';
import { useState } from 'react';

import { LogoMark } from '@/components/logo-mark';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { PasswordInput } from '@/components/ui/password-input';
import { parseApiError } from '@/lib/api-client';

export function SetupForm() {
  const router = useRouter();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string[]>>({});
  const [pending, setPending] = useState(false);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setFieldErrors({});
    if (password !== confirm) {
      setError('Passwords do not match');
      return;
    }
    if (password.length < 10) {
      setError('Password must be at least 10 characters');
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
      className="mx-auto flex min-h-[100dvh] max-w-sm flex-col justify-center px-4 py-8"
    >
      <form onSubmit={onSubmit} className="flex flex-col gap-4">
        <div className="mb-2 flex flex-col items-center gap-3">
          <LogoMark size={44} />
          <h1 className="text-2xl font-semibold tracking-tight">Create the first admin</h1>
          <p className="text-center text-sm text-muted-foreground">
            This page is only accessible until the first user is created.
          </p>
        </div>
        <div className="flex flex-col gap-2">
          <Label htmlFor="email">Email</Label>
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
          <Label htmlFor="password">Password (min 10 chars)</Label>
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
          <Label htmlFor="confirm">Confirm password</Label>
          <PasswordInput
            id="confirm"
            required
            autoComplete="new-password"
            value={confirm}
            onChange={(e) => setConfirm(e.target.value)}
          />
        </div>
        {error ? (
          <Alert id="form-error" variant="destructive">
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        ) : null}
        <Button type="submit" disabled={pending}>
          {pending ? 'Creating...' : 'Create admin'}
        </Button>
      </form>
    </main>
  );
}
