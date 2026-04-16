ARG BUN_IMAGE=oven/bun:1.3.12-debian
ARG NODE_IMAGE=node:24-trixie-slim
# Pin all stages to the same arch so Puppeteer's downloaded Chromium matches
# the runtime kernel. Override with --build-arg TARGETPLATFORM=linux/arm64 if needed.
ARG TARGETPLATFORM=linux/amd64

# ---------- deps (bun install) ----------
FROM --platform=${TARGETPLATFORM} ${BUN_IMAGE} AS deps
WORKDIR /app
ENV PUPPETEER_CACHE_DIR=/app/.cache/puppeteer
# Chromium runtime deps so puppeteer's postinstall can download+verify Chromium here.
# These are also needed in the runner stage below — duplicated to keep layers minimal.
RUN apt-get update && apt-get install -y --no-install-recommends \
    ca-certificates wget python3 make g++ \
    libnss3 libatk-bridge2.0-0 libatk1.0-0 libcups2 libdrm2 libxkbcommon0 \
    libxcomposite1 libxdamage1 libxfixes3 libxrandr2 libgbm1 \
    libasound2t64 libpango-1.0-0 libcairo2 fonts-liberation \
    && rm -rf /var/lib/apt/lists/*
COPY package.json bun.lock* bun.lockb* ./
RUN bun install --frozen-lockfile

# ---------- build ----------
FROM --platform=${TARGETPLATFORM} ${BUN_IMAGE} AS builder
WORKDIR /app
ENV NEXT_TELEMETRY_DISABLED=1
ENV PUPPETEER_CACHE_DIR=/app/.cache/puppeteer
COPY --from=deps /app/node_modules ./node_modules
COPY --from=deps /app/.cache ./.cache
COPY . .
RUN bun run build

# ---------- runtime (Node 24 + Chromium deps) ----------
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

# Non-root user to run Chromium + Node
RUN groupadd --system --gid 1001 nodejs \
 && useradd --system --uid 1001 --gid nodejs --create-home --home /home/nodejs nodejs

COPY --from=builder --chown=nodejs:nodejs /app/.next/standalone ./
COPY --from=builder --chown=nodejs:nodejs /app/.next/static ./.next/static
COPY --from=builder --chown=nodejs:nodejs /app/public ./public
COPY --from=builder --chown=nodejs:nodejs /app/drizzle ./drizzle
COPY --from=builder --chown=nodejs:nodejs /app/dist ./dist
COPY --from=builder --chown=nodejs:nodejs /app/.cache ./.cache
COPY --from=builder --chown=nodejs:nodejs /app/node_modules ./node_modules

RUN mkdir -p /data && chown -R nodejs:nodejs /data /app

USER nodejs

EXPOSE 3000
HEALTHCHECK --interval=30s --timeout=5s --start-period=30s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:3000/api/settings').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"

ENTRYPOINT ["dumb-init", "--"]
CMD ["node", "dist/server.js"]
