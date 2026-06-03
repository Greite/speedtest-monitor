// Server-only env helpers. Kept free of UI deps (clsx/tailwind-merge) so the
// custom-server runtime graph never drags styling libs into the standalone
// image - see outputFileTracingIncludes in next.config.ts.
export function envInt(name: string, fallback: number, min: number, max: number): number {
  const raw = process.env[name];
  if (!raw) {
    return fallback;
  }
  const n = Number.parseInt(raw, 10);
  if (Number.isNaN(n) || n < min || n > max) {
    return fallback;
  }
  return n;
}
