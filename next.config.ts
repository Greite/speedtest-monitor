import { execSync } from 'node:child_process';

import type { NextConfig } from 'next';

function resolveAppVersion(): string {
  if (process.env.APP_VERSION) {
    return process.env.APP_VERSION;
  }
  try {
    return execSync('git describe --tags --exact-match HEAD', {
      stdio: ['ignore', 'pipe', 'ignore'],
    })
      .toString()
      .trim();
  } catch {
    return 'dev';
  }
}

const config: NextConfig = {
  output: 'standalone',
  reactStrictMode: true,
  typescript: {
    ignoreBuildErrors: true,
  },
  env: {
    NEXT_PUBLIC_APP_VERSION: resolveAppVersion(),
  },
  // NFT only traces what Next's own routes statically import. Our custom
  // server.ts (run by Bun, outside Next's build) pulls in `ws` + `node-cron`,
  // and lib/db/client.ts hides `drizzle-orm/bun-sqlite` behind `new Function`
  // to dodge Turbopack's static analyzer. Force these into the standalone
  // trace so the runtime image needs no separate prod-deps install.
  outputFileTracingIncludes: {
    '*': [
      // better-auth >=1.6.14 split its code into sibling scoped packages
      // (@better-auth/core, /drizzle-adapter, /utils...) whose entrypoints are
      // re-export shims that import the rest of the runtime closure at load
      // time. Forced includes copy matched files WITHOUT re-tracing their
      // imports, and `lib/auth/handler.ts` (our custom-server source, outside
      // Next's route trace) is what pulls drizzleAdapter + betterAuth in - so
      // NFT never sees this graph. The whole runtime dep closure of
      // better-auth must therefore be globbed explicitly or the standalone
      // image 404s on a transitive package (better-call, jose, ...). Recompute
      // with a closure walk over node_modules if a major bump changes deps.
      './node_modules/better-auth/**',
      './node_modules/@better-auth/**',
      './node_modules/@better-fetch/**',
      './node_modules/@noble/**',
      './node_modules/@opentelemetry/semantic-conventions/**',
      './node_modules/@standard-schema/spec/**',
      './node_modules/better-call/**',
      './node_modules/defu/**',
      './node_modules/jose/**',
      './node_modules/kysely/**',
      './node_modules/nanostores/**',
      './node_modules/rou3/**',
      './node_modules/set-cookie-parser/**',
      './node_modules/drizzle-orm/**',
      './node_modules/node-cron/**',
      './node_modules/nodemailer/**',
      './node_modules/ws/**',
      './node_modules/zod/**',
      // Our custom server.ts calls `next({...})` which re-loads the config
      // at runtime via next/dist/server/config-utils.js. That puller pulls
      // many `next/dist/compiled/*` submodules (webpack-lib, @babel/runtime,
      // etc.) that Next's own server.js bakes in and skips, so NFT never
      // traces them. Easier to include the whole compiled bag and exclude
      // the build-only / experimental / turbopack variants below.
      './node_modules/next/dist/compiled/**',
    ],
  },
};

export default config;
