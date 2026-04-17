ARG BUN_IMAGE=oven/bun:1.3.12-debian
ARG NODE_IMAGE=node:24-trixie-slim
ARG TARGETPLATFORM=linux/amd64

# ---------- deps ----------
FROM --platform=${TARGETPLATFORM} ${BUN_IMAGE} AS deps
WORKDIR /app
ENV PUPPETEER_SKIP_DOWNLOAD=true
RUN apt-get update && apt-get install -y --no-install-recommends \
      ca-certificates python3 make g++ \
 && rm -rf /var/lib/apt/lists/*
COPY package.json bun.lock* .puppeteerrc.cjs ./
RUN bun install --frozen-lockfile

# ---------- build ----------
FROM --platform=${TARGETPLATFORM} ${BUN_IMAGE} AS builder
WORKDIR /app
ENV NEXT_TELEMETRY_DISABLED=1
ENV PUPPETEER_SKIP_DOWNLOAD=true
COPY --from=deps /app/node_modules ./node_modules
COPY . .
# Build, then prune off-platform native variants Next NFT-traced into the
# standalone output (Next keeps every sharp/@img platform folder "just in case").
RUN bun run build \
 && rm -rf -- \
      .next/standalone/node_modules/@img/*-linuxmusl-* \
      .next/standalone/node_modules/@img/*-linux-arm* \
      .next/standalone/node_modules/@img/*-darwin-* \
      .next/standalone/node_modules/@img/*-wasm32* \
      .next/standalone/node_modules/@img/*-win32-* \
      .next/standalone/node_modules/sharp/vendor \
      .next/standalone/node_modules/@next/swc-*-musl* \
      .next/standalone/node_modules/@next/swc-*-arm* \
      .next/standalone/node_modules/@next/swc-darwin-* \
      .next/standalone/node_modules/@next/swc-win32-* \
 && find .next/standalone/node_modules \
      \( -name '*.map' -o -name '*.md' -o -name 'CHANGELOG*' \
         -o -name 'README*' -o -name 'HISTORY*' -o -name 'AUTHORS*' \
         -o -name 'tsconfig*.json' -o -name '*.tsbuildinfo' \) \
      -type f -delete 2>/dev/null || true

# ---------- runtime-deps: minimal node_modules needed by dist/server.js.
# Pruning happens inline so the final COPY layer only carries the trimmed tree.
FROM --platform=${TARGETPLATFORM} ${BUN_IMAGE} AS runtime-deps
WORKDIR /app
ENV PUPPETEER_SKIP_DOWNLOAD=true
RUN apt-get update && apt-get install -y --no-install-recommends \
      python3 make g++ binutils \
 && rm -rf /var/lib/apt/lists/*
COPY .puppeteerrc.cjs ./
RUN set -eux \
 && echo '{"name":"runtime","version":"0.0.0","trustedDependencies":["better-sqlite3"]}' > package.json \
 && bun add \
      better-sqlite3@^12.9.0 \
      drizzle-orm@^0.45.2 \
      execa@^9.6.1 \
      fast-cli@^5.2.0 \
      next@^16.2.4 \
      node-cron@^4.2.1 \
      ws@^8.20.0 \
      zod@^4.3.6 \
 # Off-platform native packages. Shell globs (not find) — in the bun debian
 # image /bin/sh is bash-derived and expands globs; non-matches are passed
 # literally and `rm -rf -- ...` with -f silently ignores nonexistent paths.
 && rm -rf -- \
      node_modules/@img/*-linuxmusl-* \
      node_modules/@img/*-linux-arm* \
      node_modules/@img/*-darwin-* \
      node_modules/@img/*-wasm32* \
      node_modules/@img/*-win32-* \
      node_modules/@next/swc-*-musl* \
      node_modules/@next/swc-*-arm* \
      node_modules/@next/swc-darwin-* \
      node_modules/@next/swc-win32-* \
      node_modules/@next/swc-*-freebsd-* \
      node_modules/better-sqlite3/prebuilds/darwin-* \
      node_modules/better-sqlite3/prebuilds/linux-arm* \
      node_modules/better-sqlite3/prebuilds/linuxmusl-* \
      node_modules/better-sqlite3/prebuilds/win32-* \
      node_modules/better-sqlite3/prebuilds/freebsd-* \
 # Delete the 125 MB @next/swc native binary — Next.js standalone ships a
 # fallback JS stub (preserved in the merged /app/node_modules from the
 # builder's standalone output) that covers what a production custom server
 # actually calls. SWC is only needed for dev compilation / next build, not
 # for serving pre-built pages.
 && rm -rf node_modules/@next/swc-linux-x64-gnu \
 && find node_modules/better-sqlite3 -name '*.node' -exec strip --strip-unneeded {} + 2>/dev/null || true \
 && find node_modules/@img -name '*.so*' -exec strip --strip-unneeded {} + 2>/dev/null || true \
 # Dev-only / tooling / cache. DO NOT touch node_modules/.bin — it holds the
 # `fast` binary that execa('fast', ...) in lib/fastcli/runner.ts spawns.
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

# ---------- runtime (Debian slim + system Chromium) ----------
FROM --platform=${TARGETPLATFORM} ${NODE_IMAGE} AS runner
WORKDIR /app
ENV NODE_ENV=production \
    NEXT_TELEMETRY_DISABLED=1 \
    HOSTNAME=0.0.0.0 \
    PORT=3000 \
    FASTCOM_DB_PATH=/data/fastcom.db \
    FASTCOM_INTERVAL_MINUTES=15 \
    PUPPETEER_SKIP_DOWNLOAD=true \
    PUPPETEER_EXECUTABLE_PATH=/usr/bin/chromium

# Install Chromium + purge locales / docs / icons inside the SAME layer so
# the deleted bytes never land in history. Create the runtime user here too.
RUN apt-get update \
 && apt-get install -y --no-install-recommends \
      ca-certificates dumb-init chromium fonts-liberation \
 && rm -rf /var/lib/apt/lists/* \
 # Chromium-side pruning: Vulkan validation layer (21 MB, dev-only) + mock ICD.
 # We run headless with software rasterizer via swiftshader (kept).
 && rm -f \
      /usr/lib/chromium/libVkLayer_khronos_validation.so \
      /usr/lib/chromium/libVkLayer_khronos_validation.so.TOC \
      /usr/lib/chromium/libVkICD_mock_icd.so \
      /usr/lib/chromium/libVkICD_mock_icd.so.TOC \
 && for d in /usr/lib/chromium/locales /usr/share/chromium/locales; do \
      if [ -d "$d" ]; then \
        find "$d" -type f ! -name 'en-US.pak' ! -name 'en.pak' ! -name 'fr.pak' -delete; \
      fi; \
    done \
 && rm -rf \
      /usr/share/doc/* \
      /usr/share/man/* \
      /usr/share/info/* \
      /usr/share/locale/* \
      /usr/share/icons/hicolor \
      /var/cache/apt/archives/* \
      /var/cache/debconf/*-old \
      /var/lib/dpkg/info/*.md5sums \
 && groupadd --system --gid 1001 nodejs \
 && useradd  --system --uid 1001 --gid nodejs --create-home --home /home/nodejs nodejs \
 && mkdir -p /data \
 && chown nodejs:nodejs /data /app

# All COPYs carry --chown, no recursive chown needed afterwards (avoids
# duplicating node_modules into a 340 MB "fix-ownership" layer).
COPY --from=builder    --chown=nodejs:nodejs /app/.next/standalone ./
COPY --from=builder    --chown=nodejs:nodejs /app/.next/static     ./.next/static
COPY --from=builder    --chown=nodejs:nodejs /app/public           ./public
COPY --from=builder    --chown=nodejs:nodejs /app/drizzle          ./drizzle
COPY --from=builder    --chown=nodejs:nodejs /app/dist             ./dist
COPY --from=runtime-deps --chown=nodejs:nodejs /app/node_modules   ./node_modules

USER nodejs
EXPOSE 3000
HEALTHCHECK --interval=30s --timeout=5s --start-period=30s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:3000/api/settings').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"

ENTRYPOINT ["dumb-init", "--"]
CMD ["node", "dist/server.js"]
