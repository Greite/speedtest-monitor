ARG BUN_IMAGE=oven/bun:1.3.12-debian
ARG NODE_IMAGE=node:24-trixie-slim

# ---------- deps ----------
FROM ${BUN_IMAGE} AS deps
WORKDIR /app
RUN apt-get update && apt-get install -y --no-install-recommends \
      ca-certificates python3 make g++ \
 && rm -rf /var/lib/apt/lists/*
COPY package.json bun.lock* ./
RUN bun install --frozen-lockfile

# ---------- build ----------
FROM ${BUN_IMAGE} AS builder
ARG TARGETARCH
WORKDIR /app
ENV NEXT_TELEMETRY_DISABLED=1
# Next.js page-data collection evaluates the next-auth route at build time,
# which imports handler.ts → loadAuthConfig() and throws without AUTH_SECRET.
# Inject a dummy value used only during `next build`; runtime requires a real
# AUTH_SECRET supplied via `docker run -e AUTH_SECRET=...`.
ENV AUTH_SECRET=build-time-placeholder-not-used-at-runtime
COPY --from=deps /app/node_modules ./node_modules
COPY . .
# Build, then prune off-platform native variants Next NFT-traced into the
# standalone output. Keep only the variant for the build target (TARGETARCH
# is auto-set by buildx: amd64 → linux-x64, arm64 → linux-arm64).
RUN set -eux \
 && bun run build \
 && case "$TARGETARCH" in \
      amd64) KEEP_NODEARCH=x64 ;; \
      arm64) KEEP_NODEARCH=arm64 ;; \
      *) echo "unsupported TARGETARCH: $TARGETARCH"; exit 1 ;; \
    esac \
 && find .next/standalone/node_modules/@img -mindepth 1 -maxdepth 1 -type d \
      ! -name "sharp-libvips-linux-$KEEP_NODEARCH" \
      ! -name "sharp-linux-$KEEP_NODEARCH" \
      ! -name 'colour' \
      -exec rm -rf {} + \
 && rm -rf -- \
      .next/standalone/node_modules/sharp/vendor \
      .next/standalone/node_modules/@next/swc-*-musl* \
      .next/standalone/node_modules/@next/swc-darwin-* \
      .next/standalone/node_modules/@next/swc-win32-* \
 && find .next/standalone/node_modules \
      \( -name '*.map' -o -name '*.md' -o -name 'CHANGELOG*' \
         -o -name 'README*' -o -name 'HISTORY*' -o -name 'AUTHORS*' \
         -o -name 'tsconfig*.json' -o -name '*.tsbuildinfo' \) \
      -type f -delete 2>/dev/null || true

# ---------- runtime-deps: minimal node_modules needed by dist/server.js.
# Pruning happens inline so the final COPY layer only carries the trimmed tree.
FROM ${BUN_IMAGE} AS runtime-deps
ARG TARGETARCH
WORKDIR /app
RUN apt-get update && apt-get install -y --no-install-recommends \
      python3 make g++ binutils \
 && rm -rf /var/lib/apt/lists/*
RUN set -eux \
 && case "$TARGETARCH" in \
      amd64) KEEP_NODEARCH=x64; KEEP_PREBUILD=linux-x64 ;; \
      arm64) KEEP_NODEARCH=arm64; KEEP_PREBUILD=linux-arm64 ;; \
      *) echo "unsupported TARGETARCH: $TARGETARCH"; exit 1 ;; \
    esac \
 && echo '{"name":"runtime","version":"0.0.0","trustedDependencies":["better-sqlite3"]}' > package.json \
 && bun add \
      @cloudflare/speedtest@^1 \
      @node-rs/argon2@^2 \
      better-sqlite3@^12.9.0 \
      drizzle-orm@^0.45.2 \
      execa@^9.6.1 \
      next@^16.2.4 \
      next-auth@beta \
      node-cron@^4.2.1 \
      nodemailer@^6 \
      ws@^8.20.0 \
      zod@^4.3.6 \
 # @img: keep only the target arch (both the libvips and the sharp wrapper).
 && find node_modules/@img -mindepth 1 -maxdepth 1 -type d \
      ! -name "sharp-libvips-linux-$KEEP_NODEARCH" \
      ! -name "sharp-linux-$KEEP_NODEARCH" \
      ! -name 'colour' \
      -exec rm -rf {} + \
 # @next/swc: nuke every platform variant. Next.js standalone ships a JS
 # fallback stub (preserved via the builder's standalone COPY) that covers
 # what a production custom server actually calls — SWC is only needed for
 # dev compilation / next build, not for serving pre-built pages.
 && find node_modules/@next -mindepth 1 -maxdepth 1 -type d \
      -name 'swc-*' -exec rm -rf {} + \
 # better-sqlite3 prebuilds: keep only the target platform.
 && find node_modules/better-sqlite3/prebuilds -mindepth 1 -maxdepth 1 -type d \
      ! -name "$KEEP_PREBUILD" -exec rm -rf {} + 2>/dev/null || true \
 && find node_modules/better-sqlite3 -name '*.node' -exec strip --strip-unneeded {} + 2>/dev/null || true \
 && find node_modules/@img -name '*.so*' -exec strip --strip-unneeded {} + 2>/dev/null || true \
 # Dev-only tooling/cache.
 && rm -rf \
      node_modules/typescript \
      node_modules/.cache \
 # Next.js bundles turbopack + experimental variants we don't use with the
 # standalone + custom server combo. Keep `@babel` (runtime-required) and
 # `terser` (lazy-loaded on some paths) to avoid module-not-found crashes.
 && find node_modules/next/dist/compiled -maxdepth 1 -type d \
      \( -name 'react-server-dom-turbopack*' -o -name 'react-experimental' \
         -o -name 'react-dom-experimental' \
         -o -name 'react-server-dom-webpack-experimental' \) \
      -exec rm -rf {} + \
 && find node_modules \
      \( -name '*.map' -o -name '*.md' -o -name '*.markdown' \
         -o -name 'CHANGELOG*' -o -name 'HISTORY*' -o -name 'AUTHORS*' \
         -o -name 'readme' -o -name 'README' -o -name 'README.*' \
         -o -name '.npmignore' -o -name '.editorconfig' -o -name '.eslintrc*' \
         -o -name '.prettierrc*' -o -name '.babelrc*' -o -name '.travis.yml' \
         -o -name 'tsconfig*.json' -o -name '*.tsbuildinfo' -o -name '*.flow' \
         -o -name 'yarn.lock' -o -name 'package-lock.json' -o -name 'pnpm-lock.yaml' \
         -o -name 'bun.lock' -o -name 'bun.lockb' -o -name '.gitattributes' \) \
      -type f -delete 2>/dev/null || true \
 && find node_modules \
      -type d \( -name '__tests__' -o -name '__test__' -o -name 'test' \
         -o -name 'tests' -o -name 'example' -o -name 'examples' \
         -o -name 'docs' -o -name '.github' -o -name '.vscode' -o -name 'coverage' \) \
      -prune -exec rm -rf {} + 2>/dev/null || true

# ---------- runtime (Debian slim) ----------
FROM ${NODE_IMAGE} AS runner
WORKDIR /app
ENV NODE_ENV=production \
    NEXT_TELEMETRY_DISABLED=1 \
    HOSTNAME=0.0.0.0 \
    PORT=3000 \
    FASTCOM_DB_PATH=/data/fastcom.db \
    FASTCOM_INTERVAL_MINUTES=15

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

# All COPYs carry --chown, no recursive chown needed afterwards (avoids
# duplicating node_modules into a 340 MB "fix-ownership" layer).
COPY --from=builder      --chown=nodejs:nodejs /app/.next/standalone ./
COPY --from=builder      --chown=nodejs:nodejs /app/.next/static     ./.next/static
COPY --from=builder      --chown=nodejs:nodejs /app/public           ./public
COPY --from=builder      --chown=nodejs:nodejs /app/drizzle          ./drizzle
COPY --from=builder      --chown=nodejs:nodejs /app/dist             ./dist
COPY --from=runtime-deps --chown=nodejs:nodejs /app/node_modules     ./node_modules

USER nodejs
EXPOSE 3000
HEALTHCHECK --interval=30s --timeout=5s --start-period=30s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:3000/api/settings').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"

ENTRYPOINT ["dumb-init", "--"]
CMD ["node", "dist/server.js"]
