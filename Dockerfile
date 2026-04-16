ARG BUN_IMAGE=oven/bun:1.3.12-debian
ARG NODE_IMAGE=node:24-trixie-slim
# Pin all stages to the same arch so Puppeteer's downloaded Chromium matches
# the runtime kernel. Override with --build-arg TARGETPLATFORM=linux/arm64 if needed.
ARG TARGETPLATFORM=linux/amd64

# ---------- deps (full tree + Chromium download for the build stage) ----------
FROM --platform=${TARGETPLATFORM} ${BUN_IMAGE} AS deps
WORKDIR /app
ENV PUPPETEER_CACHE_DIR=/app/.cache/puppeteer
# Chromium runtime libs so puppeteer's postinstall can download+verify Chromium
# here. Build-only so we don't carry python/gcc into the runtime image.
RUN apt-get update && apt-get install -y --no-install-recommends \
      ca-certificates wget python3 make g++ \
      libnss3 libatk-bridge2.0-0 libatk1.0-0 libcups2 libdrm2 libxkbcommon0 \
      libxcomposite1 libxdamage1 libxfixes3 libxrandr2 libgbm1 \
      libasound2t64 libpango-1.0-0 libcairo2 fonts-liberation \
 && rm -rf /var/lib/apt/lists/*
COPY package.json bun.lock* .puppeteerrc.cjs ./
RUN bun install --frozen-lockfile \
 && rm -rf /app/.cache/puppeteer/chrome-headless-shell

# ---------- build ----------
FROM --platform=${TARGETPLATFORM} ${BUN_IMAGE} AS builder
WORKDIR /app
ENV NEXT_TELEMETRY_DISABLED=1
ENV PUPPETEER_CACHE_DIR=/app/.cache/puppeteer
COPY --from=deps /app/node_modules ./node_modules
COPY --from=deps /app/.cache ./.cache
COPY . .
RUN bun run build

# ---------- runtime-deps: only what the custom server.ts actually requires at
# runtime. Client-only packages (recharts, lucide-react, radix-ui, ...) are
# compiled into .next/static and are not needed here.
FROM --platform=${TARGETPLATFORM} ${BUN_IMAGE} AS runtime-deps
WORKDIR /app
ENV PUPPETEER_SKIP_DOWNLOAD=true
RUN apt-get update && apt-get install -y --no-install-recommends python3 make g++ \
 && rm -rf /var/lib/apt/lists/*
COPY .puppeteerrc.cjs ./
RUN echo '{"name":"runtime","version":"0.0.0","trustedDependencies":["better-sqlite3"]}' > package.json \
 && bun add \
      better-sqlite3@^12.9.0 \
      drizzle-orm@^0.45.2 \
      execa@^9.6.1 \
      fast-cli@^5.2.0 \
      next@^16.2.4 \
      node-cron@^4.2.1 \
      ws@^8.20.0 \
      zod@^4.3.6 \
 && rm -rf \
      node_modules/@img/sharp-libvips-linuxmusl-x64 \
      node_modules/@img/sharp-linuxmusl-x64 \
      node_modules/@next/swc-linux-x64-musl \
      node_modules/better-sqlite3/prebuilds/darwin-* \
      node_modules/better-sqlite3/prebuilds/linux-arm* \
      node_modules/better-sqlite3/prebuilds/linuxmusl-* \
      node_modules/better-sqlite3/prebuilds/win32-* \
      node_modules/typescript \
      node_modules/.cache

# ---------- runtime ----------
FROM --platform=${TARGETPLATFORM} ${NODE_IMAGE} AS runner
WORKDIR /app
ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1
ENV HOSTNAME=0.0.0.0
ENV PORT=3000
ENV FASTCOM_DB_PATH=/data/fastcom.db
ENV FASTCOM_INTERVAL_MINUTES=15
ENV PUPPETEER_CACHE_DIR=/app/.cache/puppeteer

RUN apt-get update && apt-get install -y --no-install-recommends \
      ca-certificates dumb-init \
      libnss3 libatk-bridge2.0-0 libatk1.0-0 libcups2 libdrm2 libxkbcommon0 \
      libxcomposite1 libxdamage1 libxfixes3 libxrandr2 libgbm1 \
      libasound2t64 libpango-1.0-0 libcairo2 fonts-liberation \
 && rm -rf /var/lib/apt/lists/*

RUN groupadd --system --gid 1001 nodejs \
 && useradd  --system --uid 1001 --gid nodejs --create-home --home /home/nodejs nodejs

# Next.js standalone provides a minimal node_modules traced from server code.
COPY --from=builder --chown=nodejs:nodejs /app/.next/standalone ./
COPY --from=builder --chown=nodejs:nodejs /app/.next/static ./.next/static
COPY --from=builder --chown=nodejs:nodejs /app/public ./public
COPY --from=builder --chown=nodejs:nodejs /app/drizzle ./drizzle
COPY --from=builder --chown=nodejs:nodejs /app/dist ./dist
# Bundled Chromium (full chrome only, no headless-shell).
COPY --from=builder --chown=nodejs:nodejs /app/.cache ./.cache
# Overlay with production-only node_modules so fast-cli / puppeteer / better-sqlite3
# are resolvable from /app/node_modules at runtime. This OVERWRITES standalone's
# pruned copies with the full production tree (extra ~40-80 MB but correct).
COPY --from=runtime-deps --chown=nodejs:nodejs /app/node_modules ./node_modules

# Strip maps, docs, changelogs. Dir-name prunes are dangerous (Next vendors
# third-party code under `docs`, `examples` names inside next/dist/compiled),
# so we restrict to file patterns.
RUN find node_modules \
      \( -name '*.map' -o -name '*.md' -o -name '*.markdown' \
         -o -name 'CHANGELOG*' -o -name 'HISTORY*' -o -name 'AUTHORS*' \
         -o -name '.npmignore' -o -name '.editorconfig' -o -name '.eslintrc*' \) \
      -type f -delete 2>/dev/null || true \
 && mkdir -p /data \
 && chown -R nodejs:nodejs /data /app

USER nodejs
EXPOSE 3000
HEALTHCHECK --interval=30s --timeout=5s --start-period=30s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:3000/api/settings').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"

ENTRYPOINT ["dumb-init", "--"]
CMD ["node", "dist/server.js"]
