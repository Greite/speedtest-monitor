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
      return;
    }
    setRedirecting(true);
    router.replace(callbackUrl);
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
          <h1 className="text-2xl font-semibold tracking-tight">Sign in to Speedtest</h1>
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
            aria-invalid={error ? true : undefined}
            aria-describedby={error ? 'login-error' : undefined}
          />
        </div>
        <div className="flex flex-col gap-2">
          <Label htmlFor="password">Password</Label>
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
          <Alert id="login-error" variant="destructive">
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        ) : null}
        <Button type="submit" disabled={pending}>
          {pending ? 'Signing in...' : 'Sign in'}
        </Button>
        <p className="sr-only" aria-live="polite" role="status">
          {redirecting ? 'Signed in, redirecting…' : ''}
        </p>
        {oidcAvailable && (
          <Button type="button" variant="outline" onClick={() => signIn('oidc', { callbackUrl })}>
            Sign in with {oidcName}
          </Button>
        )}
      </form>
    </main>
  );
}
