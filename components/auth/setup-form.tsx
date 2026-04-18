'use client';
import { signIn } from 'next-auth/react';
import { useState } from 'react';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';

export function SetupForm() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
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
      const body = await res.json().catch(() => ({}));
      setError(String(body.error ?? `HTTP ${res.status}`));
      setPending(false);
      return;
    }
    await signIn('credentials', { email, password, redirect: true, callbackUrl: '/' });
  }

  return (
    <form onSubmit={onSubmit} className="mx-auto mt-24 flex max-w-sm flex-col gap-4">
      <h1 className="text-center text-2xl font-semibold">Create the first admin</h1>
      <p className="text-center text-sm text-muted-foreground">
        This page is only accessible until the first user is created.
      </p>
      <div className="flex flex-col gap-2">
        <Label htmlFor="email">Email</Label>
        <Input
          id="email"
          type="email"
          required
          autoComplete="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
        />
      </div>
      <div className="flex flex-col gap-2">
        <Label htmlFor="password">Password (min 10 chars)</Label>
        <Input
          id="password"
          type="password"
          required
          autoComplete="new-password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
        />
      </div>
      <div className="flex flex-col gap-2">
        <Label htmlFor="confirm">Confirm password</Label>
        <Input
          id="confirm"
          type="password"
          required
          autoComplete="new-password"
          value={confirm}
          onChange={(e) => setConfirm(e.target.value)}
        />
      </div>
      {error && <p className="text-sm text-destructive">{error}</p>}
      <Button type="submit" disabled={pending}>
        {pending ? 'Creating...' : 'Create admin'}
      </Button>
    </form>
  );
}
