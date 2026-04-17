import { LoginForm } from '@/components/auth/login-form';
import { loadAuthConfig } from '@/lib/auth/config';

export const dynamic = 'force-dynamic';

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ callbackUrl?: string }>;
}) {
  const cfg = loadAuthConfig();
  const { callbackUrl = '/' } = await searchParams;
  return (
    <LoginForm
      oidcAvailable={cfg.oidc !== null}
      oidcName={cfg.oidc?.displayName ?? 'SSO'}
      callbackUrl={callbackUrl}
    />
  );
}
