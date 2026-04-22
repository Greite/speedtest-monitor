ARG BUN_IMAGE=oven/bun:1-slim

# ---------- deps: full install for building ----------
FROM ${BUN_IMAGE} AS deps
WORKDIR /app
COPY package.json bun.lock* ./
RUN bun install --frozen-lockfile

# ---------- build: next build ----------
FROM ${BUN_IMAGE} AS builder
ARG TARGETARCH
# Version baked into the client bundle (footer pill). `.git` is excluded from
# the build context, so `next.config.ts` cannot derive it from `git describe`
# here - CI must pass `--build-arg APP_VERSION=v1.x.y` on tag builds.
ARG APP_VERSION=dev
WORKDIR /app
ENV NEXT_TELEMETRY_DISABLED=1 \
    APP_VERSION=${APP_VERSION}
# Next's page-data collection evaluates route handlers at build time, which
# imports handler.ts -> loadAuthConfig() and throws without AUTH_SECRET.
# Dummy value used only during `next build`; runtime requires a real
# AUTH_SECRET supplied via `docker run -e AUTH_SECRET=...`.
ENV AUTH_SECRET=build-time-placeholder-not-used-at-runtime
COPY --from=deps /app/node_modules ./node_modules
COPY . .
RUN set -eux \
 && bun run build \
 && case "$TARGETARCH" in \
      amd64) KEEP_NODEARCH=x64 ;; \
      arm64) KEEP_NODEARCH=arm64 ;; \
      *) echo "unsupported TARGETARCH: $TARGETARCH"; exit 1 ;; \
    esac \
 # Keep only the target-arch sharp / libvips variants (Next NFT-traced every
 # platform into the standalone output).
 && find .next/standalone/node_modules/@img -mindepth 1 -maxdepth 1 -type d \
      ! -name "sharp-libvips-linux-$KEEP_NODEARCH" \
      ! -name "sharp-linux-$KEEP_NODEARCH" \
      ! -name 'colour' \
      -exec rm -rf {} + \
 # Drop every @next/swc native binary (~125 MB per arch). Next at production
 # runtime falls back to the JS stub; SWC is only used by `next build`.
 && rm -rf -- \
      .next/standalone/node_modules/sharp/vendor \
      .next/standalone/node_modules/@next/swc-* \
 && find .next/standalone/node_modules \
      \( -name '*.map' -o -name '*.md' -o -name 'CHANGELOG*' \
         -o -name 'README*' -o -name 'HISTORY*' -o -name 'AUTHORS*' \
         -o -name 'tsconfig*.json' -o -name '*.tsbuildinfo' \) \
      -type f -delete 2>/dev/null || true

# ---------- runtime-deps: minimal node_modules for the custom server ----------
# The standalone output's node_modules only traces what Next's own server.js
# uses. Our custom server.ts pulls `ws` + `node-cron` that are not reachable
# from Next's API routes, and NFT gets confused by the `bun:sqlite` subpath of
# drizzle-orm. Rather than cherry-picking we install the authoritative set
# here with an explicit list (acts as the runtime contract).
FROM ${BUN_IMAGE} AS runtime-deps
ARG TARGETARCH
WORKDIR /app
RUN set -eux \
 && case "$TARGETARCH" in \
      amd64) KEEP_NODEARCH=x64 ;; \
      arm64) KEEP_NODEARCH=arm64 ;; \
      *) echo "unsupported TARGETARCH: $TARGETARCH"; exit 1 ;; \
    esac \
 && echo '{"name":"runtime","version":"0.0.0"}' > package.json \
 && bun add \
      drizzle-orm@^0.45.2 \
      next@^16.2.4 \
      next-auth@beta \
      node-cron@^4.2.1 \
      nodemailer@^6 \
      ws@^8.20.0 \
      zod@^4.3.6 \
 # Sharp variants: keep target arch only.
 && find node_modules/@img -mindepth 1 -maxdepth 1 -type d \
      ! -name "sharp-libvips-linux-$KEEP_NODEARCH" \
      ! -name "sharp-linux-$KEEP_NODEARCH" \
      ! -name 'colour' \
      -exec rm -rf {} + \
 # Nuke every @next/swc native binary; the JS stub from standalone is enough.
 && find node_modules/@next -mindepth 1 -maxdepth 1 -type d \
      -name 'swc-*' -exec rm -rf {} + \
 && rm -rf \
      node_modules/typescript \
      node_modules/.cache \
 # Next bundles turbopack + experimental variants we do not use with the
 # standalone + custom server combo. Keep @babel (runtime-required) and
 # terser (lazy-loaded).
 && find node_modules/next/dist/compiled -maxdepth 1 -type d \
      \( -name 'react-server-dom-turbopack*' -o -name 'react-experimental' \
         -o -name 'react-dom-experimental' \
         -o -name 'react-server-dom-webpack-experimental' \) \
      -exec rm -rf {} + \
 && find node_modules \
      \( -name '*.map' -o -name '*.md' -o -name '*.markdown' \
         -o -name 'CHANGELOG*' -o -name 'HISTORY*' -o -name 'AUTHORS*' \
         -o -name 'README*' -o -name '.npmignore' -o -name '.editorconfig' \
         -o -name '.eslintrc*' -o -name '.prettierrc*' -o -name '.babelrc*' \
         -o -name '.travis.yml' -o -name 'tsconfig*.json' \
         -o -name '*.tsbuildinfo' -o -name '*.flow' -o -name 'yarn.lock' \
         -o -name 'package-lock.json' -o -name 'pnpm-lock.yaml' \
         -o -name 'bun.lock' -o -name 'bun.lockb' -o -name '.gitattributes' \) \
      -type f -delete 2>/dev/null || true \
 && find node_modules \
      -type d \( -name '__tests__' -o -name '__test__' -o -name 'test' \
         -o -name 'tests' -o -name 'example' -o -name 'examples' \
         -o -name 'docs' -o -name '.github' -o -name '.vscode' -o -name 'coverage' \) \
      -prune -exec rm -rf {} + 2>/dev/null || true

# ---------- runtime (Bun slim) ----------
FROM ${BUN_IMAGE} AS runner
WORKDIR /app
ENV NODE_ENV=production \
    NEXT_TELEMETRY_DISABLED=1 \
    HOSTNAME=0.0.0.0 \
    PORT=3000 \
    SPEEDTEST_DB_PATH=/data/speedtest.db \
    SPEEDTEST_INTERVAL_MINUTES=15 \
    AUTH_TRUST_HOST=true

RUN apt-get update \
 && apt-get install -y --no-install-recommends \
      ca-certificates dumb-init \
 && rm -rf /var/lib/apt/lists/* \
 && rm -rf \
      /usr/share/doc/* \
      /usr/share/man/* \
      /usr/share/info/* \
      /usr/share/locale/* \
      /var/cache/apt/archives/* \
 && groupadd --system --gid 1001 nodejs \
 && useradd  --system --uid 1001 --gid nodejs --create-home --home /home/nodejs nodejs \
 && mkdir -p /data \
 && chown nodejs:nodejs /data /app

# We run server.ts directly (Bun transpiles TS on load) so we ship source,
# not a pre-bundled dist. The standalone output provides .next + traced JS
# for Next's own routes; runtime-deps provides the node_modules our custom
# server imports.
COPY --from=builder      --chown=nodejs:nodejs /app/.next/standalone ./
COPY --from=builder      --chown=nodejs:nodejs /app/.next/static     ./.next/static
COPY --from=builder      --chown=nodejs:nodejs /app/public           ./public
COPY --from=builder      --chown=nodejs:nodejs /app/drizzle          ./drizzle
COPY --from=builder      --chown=nodejs:nodejs /app/server.ts        ./server.ts
COPY --from=builder      --chown=nodejs:nodejs /app/lib              ./lib
COPY --from=builder      --chown=nodejs:nodejs /app/tsconfig.json    ./tsconfig.json
COPY --from=runtime-deps --chown=nodejs:nodejs /app/node_modules     ./node_modules

USER nodejs
VOLUME ["/data"]
EXPOSE 3000
HEALTHCHECK --interval=30s --timeout=5s --start-period=30s --retries=3 \
  CMD bun -e "fetch('http://127.0.0.1:3000/api/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"

ENTRYPOINT ["dumb-init", "--"]
CMD ["bun", "server.ts"]
