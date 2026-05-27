import { createRequire } from 'node:module';

// bun:sqlite and drizzle-orm/bun-sqlite are Bun-only modules. Next 16
// (Turbopack) spins up Node workers at build time to collect page data; those
// workers cannot resolve these specifiers. The `new Function` wrapper hides
// the specifier from Turbopack's static module-graph tracer so no build-time
// resolution happens; `createRequire` provides the CJS require in ESM modules
// (package.json sets "type": "module"). Callers must defer the call to
// runtime — `next build` must never hit it.
const cjsRequire = createRequire(import.meta.url);
const lazyRequireFn = new Function('r', 's', 'return r(s)') as <T>(r: NodeJS.Require, s: string) => T;

export function lazyRequire<T>(specifier: string): T {
  return lazyRequireFn<T>(cjsRequire, specifier);
}
