ARG BUN_IMAGE=oven/bun:1-alpine

# ---------- deps: full install for the builder ----------
FROM ${BUN_IMAGE} AS deps
WORKDIR /app
COPY package.json bun.lock* ./
RUN bun install --frozen-lockfile

# ---------- builder: next build ----------
FROM ${BUN_IMAGE} AS builder
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
# Bun 1.3.10-1.3.14 crashes (SIGILL/SIGTRAP) building Next 16.3.x
# (oven-sh/bun#36866). A real node in /usr/bin outranks the image's
# node->bun fallback shim (last in PATH), so `next`, whose shebang is
# `#!/usr/bin/env node`, builds under Node while bun handles the rest.
# Drop once the upstream bug is fixed.
RUN apk add --no-cache nodejs
COPY --from=deps /app/node_modules ./node_modules
COPY . .
# `next build` + pattern trim of build-only/experimental variants Next ships
# in dist/compiled (kept in the standalone trace by outputFileTracingIncludes
# but never used at runtime).
RUN bun run build \
 && find .next/standalone/node_modules/next/dist/compiled -maxdepth 1 -type d \
      -name '*experimental*' -exec rm -rf {} +

# ---------- runtime ----------
FROM ${BUN_IMAGE} AS runner
WORKDIR /app
ENV NODE_ENV=production \
    NEXT_TELEMETRY_DISABLED=1 \
    HOSTNAME=0.0.0.0 \
    PORT=3000 \
    SPEEDTEST_DB_PATH=/data/speedtest.db \
    SPEEDTEST_LOG_DIR=/data/logs \
    SPEEDTEST_INTERVAL_MINUTES=15 \
    SPEEDTEST_LOCALE=en-US \
    SPEEDTEST_TIMEZONE=UTC \
    AUTH_TRUST_HOST=true

RUN apk add --no-cache ca-certificates dumb-init \
 && addgroup -S -g 1001 nodejs \
 && adduser  -S -u 1001 -G nodejs -h /home/nodejs nodejs \
 && mkdir -p /data \
 && chown nodejs:nodejs /data /app

# We run server.ts directly (Bun transpiles TS on load). Next's standalone
# output gives us the compiled .next/ AND a complete NFT-traced
# node_modules (next.config.ts -> outputFileTracingIncludes lists the
# extras our custom server needs that NFT can't statically discover).
COPY --from=builder --chown=nodejs:nodejs /app/.next/standalone ./
COPY --from=builder --chown=nodejs:nodejs /app/.next/static    ./.next/static
COPY --from=builder --chown=nodejs:nodejs /app/public          ./public
COPY --from=builder --chown=nodejs:nodejs /app/drizzle         ./drizzle
COPY --from=builder --chown=nodejs:nodejs /app/server.ts       ./server.ts
COPY --from=builder --chown=nodejs:nodejs /app/lib             ./lib
COPY --from=builder --chown=nodejs:nodejs /app/tsconfig.json   ./tsconfig.json

USER nodejs
VOLUME ["/data"]
EXPOSE 3000
HEALTHCHECK --interval=30s --timeout=5s --start-period=30s --retries=3 \
  CMD bun -e "fetch('http://127.0.0.1:3000/api/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"

ENTRYPOINT ["dumb-init", "--"]
CMD ["bun", "server.ts"]
