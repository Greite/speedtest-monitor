ARG BUN_IMAGE=oven/bun:1.3.12-debian
ARG NODE_IMAGE=node:24-trixie-slim
ARG TARGETPLATFORM=linux/amd64

# ---------- deps ----------
FROM --platform=${TARGETPLATFORM} ${BUN_IMAGE} AS deps
WORKDIR /app
# No Chromium download during build — we use the Debian-packaged chromium
# from the runtime stage instead (saves ~370 MB of bundled browser).
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

# ---------- runtime (Debian slim + system Chromium) ----------
FROM --platform=${TARGETPLATFORM} ${NODE_IMAGE} AS runner
WORKDIR /app
ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1
ENV HOSTNAME=0.0.0.0
ENV PORT=3000
ENV FASTCOM_DB_PATH=/data/fastcom.db
ENV FASTCOM_INTERVAL_MINUTES=15
# Route every puppeteer.launch() to the apt-installed Chromium.
ENV PUPPETEER_SKIP_DOWNLOAD=true
ENV PUPPETEER_EXECUTABLE_PATH=/usr/bin/chromium

RUN apt-get update && apt-get install -y --no-install-recommends \
      ca-certificates dumb-init \
      chromium fonts-liberation \
 && rm -rf /var/lib/apt/lists/*

RUN groupadd --system --gid 1001 nodejs \
 && useradd  --system --uid 1001 --gid nodejs --create-home --home /home/nodejs nodejs

# Next.js standalone provides a minimal node_modules traced from server code.
COPY --from=builder --chown=nodejs:nodejs /app/.next/standalone ./
COPY --from=builder --chown=nodejs:nodejs /app/.next/static ./.next/static
COPY --from=builder --chown=nodejs:nodejs /app/public ./public
COPY --from=builder --chown=nodejs:nodejs /app/drizzle ./drizzle
COPY --from=builder --chown=nodejs:nodejs /app/dist ./dist
# Overlay with production-only node_modules so fast-cli / puppeteer / better-sqlite3
# are resolvable from /app/node_modules at runtime.
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
