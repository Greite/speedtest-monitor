export function getTrustedOrigins(): string[] {
  const port = process.env.PORT ?? '3003';
  const baseURL =
    process.env.BETTER_AUTH_URL ?? process.env.AUTH_URL ?? process.env.NEXTAUTH_URL ?? `http://localhost:${port}`;
  return [baseURL, `http://localhost:${port}`, `http://127.0.0.1:${port}`];
}
