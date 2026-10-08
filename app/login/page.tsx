import { connection } from 'next/server';

import { LoginForm } from '@/components/auth/login-form';
import { loadAuthConfig } from '@/lib/auth/config';

// Rendered per request from runtime env, by design.
export const instant = false;

export default async function LoginPage({ searchParams }: { searchParams: Promise<{ callbackUrl?: string }> }) {
  // Auth config comes from runtime env: never let a prerender bake it.
  await connection();
  const cfg = loadAuthConfig();
  const { callbackUrl = '/' } = await searchParams;
  return (
    <LoginForm
      passwordEnabled={!cfg.passwordLoginDisabled}
      oidcAvailable={cfg.oidc !== null}
      oidcName={cfg.oidc?.displayName ?? 'SSO'}
      callbackUrl={callbackUrl}
    />
  );
}
