export type OidcConfig = {
  issuer: string;
  clientId: string;
  clientSecret: string;
  displayName: string;
  adminEmail: string | null;
  allowNewUsers: boolean;
};

export type SeedAdmin = { email: string; password: string };

export type AuthConfig = {
  secret: string;
  oidc: OidcConfig | null;
  seed: SeedAdmin | null;
};

export function loadAuthConfig(): AuthConfig {
  const secret = process.env.AUTH_SECRET;
  if (!secret) {
    throw new Error(
      'AUTH_SECRET is required. Generate one with `openssl rand -base64 32` and set it in the environment.',
    );
  }

  const issuer = process.env.SPEEDTEST_OIDC_ISSUER?.trim();
  const clientId = process.env.SPEEDTEST_OIDC_CLIENT_ID?.trim();
  const clientSecret = process.env.SPEEDTEST_OIDC_CLIENT_SECRET?.trim();
  let oidc: OidcConfig | null = null;
  if (issuer && clientId && clientSecret) {
    oidc = {
      issuer,
      clientId,
      clientSecret,
      displayName: process.env.SPEEDTEST_OIDC_DISPLAY_NAME?.trim() || 'SSO',
      adminEmail: process.env.SPEEDTEST_OIDC_ADMIN_EMAIL?.toLowerCase().trim() || null,
      allowNewUsers: process.env.SPEEDTEST_OIDC_ALLOW_NEW_USERS !== 'false',
    };
  } else if (issuer || clientId || clientSecret) {
    console.warn(
      '[auth] OIDC partially configured - set all of SPEEDTEST_OIDC_ISSUER/CLIENT_ID/CLIENT_SECRET or none. OIDC disabled.',
    );
  }

  const seedEmail = process.env.SPEEDTEST_ADMIN_EMAIL?.toLowerCase().trim();
  const seedPass = process.env.SPEEDTEST_ADMIN_PASSWORD;
  const seed: SeedAdmin | null =
    seedEmail && seedPass ? { email: seedEmail, password: seedPass } : null;

  return { secret, oidc, seed };
}
