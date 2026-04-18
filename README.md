# Fast.com Monitor

Self-hosted internet speed monitor. Runs [`@cloudflare/speedtest`](https://www.npmjs.com/package/@cloudflare/speedtest) on a configurable schedule, stores every measurement in SQLite, and serves a dashboard with live updates over WebSocket.

## Stack

- **Runtime**: Node.js 24 LTS
- **Package manager**: Bun 1.3
- **Framework**: Next.js 16 (App Router) + TypeScript 6 + Biome 2 + Tailwind v4
- **Custom server** (`server.ts`): hosts Next.js **and** a `ws` WebSocket endpoint on the same port
- **Scheduler**: `node-cron` 4.x, reprogrammable at runtime from the UI
- **DB**: Drizzle ORM 0.45 + `better-sqlite3` 12
- **Measurement engine**: `@cloudflare/speedtest` (HTTP-only, no browser)
- **Tests**: Vitest 4
- **Runtime image**: `node:24-trixie-slim` (no Chromium, no browser sandbox)

## Run with Docker

```bash
docker compose up -d --build
open http://localhost:3000
```

Configuration:

| Variable | Default | Purpose |
|---|---|---|
| `FASTCOM_INTERVAL_MINUTES` | `15` | Default interval used if the DB has no override |
| `FASTCOM_DB_PATH` | `/data/fastcom.db` | SQLite file path (volume-persisted) |
| `PORT` | `3000` | HTTP + WebSocket port |
| `TZ` | — | Display timezone inside the container |

Change the interval at any time via the UI (`/settings`) — it is persisted in SQLite and takes effect immediately without a restart.

## Alerts

fastcom-monitor can notify you when your connection degrades or fails, and
again when it recovers. Alerts are fully opt-in - nothing fires until you
enable them and set at least one threshold.

### Configure destinations (env vars)

All destinations are optional. A destination is available iff its required
env vars are set.

| Destination | Required env | Optional env |
|---|---|---|
| Webhook (generic) | `FASTCOM_WEBHOOK_URL` | `FASTCOM_WEBHOOK_HEADERS` (JSON) |
| ntfy | `FASTCOM_NTFY_URL` (full URL incl. topic) | `FASTCOM_NTFY_TOKEN` |
| Discord | `FASTCOM_DISCORD_WEBHOOK` | - |
| Slack | `FASTCOM_SLACK_WEBHOOK` | - |
| Email (SMTP) | `FASTCOM_SMTP_HOST`, `FASTCOM_SMTP_FROM`, `FASTCOM_SMTP_TO` | `FASTCOM_SMTP_PORT` (587), `FASTCOM_SMTP_SECURE` (auto), `FASTCOM_SMTP_USER`, `FASTCOM_SMTP_PASS` |
| - | - | `FASTCOM_PUBLIC_URL` (dashboard link in emails) |

### Configure rules (UI)

In `/settings`, toggle "Enable alerts", set any subset of thresholds
(download, upload, latency, bufferbloat, failure streak), and enable the
destinations you want. Each destination has a "Send test" button to verify
wiring without waiting for a real incident.

### Semantics

- **Fire on transition only.** Once a condition enters ALERTING it will not
  re-fire until it first recovers. No spam during prolonged outages.
- **Per-condition state.** Download dropping while latency is fine -> one
  alert. Latency spiking later -> a second independent alert.
- **Failure streak.** Counts consecutive measurements with status
  error/timeout ending at the current one - useful when the connection
  actually goes down.
- **Secrets stay in env.** Destination credentials are never persisted to
  the SQLite DB and never returned by `/api/alerts/rules`.

## Authentication

fastcom-monitor requires authentication for all routes. Two roles exist:

- **admin** - full access, can manage users, change settings, configure alerts, trigger manual measurements
- **viewer** - read-only access: dashboard, history, settings in read-only mode

### Required environment

```
AUTH_SECRET=<run: openssl rand -base64 32>
AUTH_TRUST_HOST=true      # set when behind a reverse proxy (Traefik, Caddy, Nginx, ...)
```

Missing `AUTH_SECRET` is a fatal boot error.

### First run: create the first admin

Pick one of the following three paths. They are independent; the most recent write wins.

**Path A: env seed (recommended for docker-compose)**

```
FASTCOM_ADMIN_EMAIL=admin@example.com
FASTCOM_ADMIN_PASSWORD=<at least 10 chars>
```

The seed runs at every boot and is idempotent: the admin is created if absent, promoted
to admin if demoted, and rehashed if the password env var has changed.

**Path B: setup wizard**

Visit `/setup` on first boot. The page is only accessible while no user exists. You can
create your admin account from the form.

**Path C: OIDC admin claim**

Set `FASTCOM_OIDC_ADMIN_EMAIL=you@example.com` in addition to the OIDC env vars below.
On first OIDC sign-in with that email, the account is auto-promoted to admin.

### OIDC single sign-on (optional)

```
FASTCOM_OIDC_ISSUER=https://auth.example.com
FASTCOM_OIDC_CLIENT_ID=fastcom
FASTCOM_OIDC_CLIENT_SECRET=...
FASTCOM_OIDC_DISPLAY_NAME=SSO           # label on the sign-in button
FASTCOM_OIDC_ADMIN_EMAIL=you@example.com
FASTCOM_OIDC_ALLOW_NEW_USERS=true       # "false" = only admin-created users may sign in via OIDC
```

Tested with Authelia, Authentik, and Keycloak (any OIDC-compliant provider should work).

### User management

Admins manage users from `/settings` under the "Users" card. Add a user with an initial
password (no email invite in v1). Admins can change roles, reset passwords, and delete
users. The last remaining admin cannot be demoted or deleted.

### Upgrading from a pre-auth version

1. Set `AUTH_SECRET` in your environment before starting the upgraded container.
2. Pick a bootstrap path (A, B, or C above).
3. Scripts and cURL commands that previously called `/api/*` anonymously will now receive
   `401 Unauthorized`. Add an authenticated session cookie or migrate to the session-aware
   clients.

### Upgrading the measurement engine

The 0.2+ release swaps the measurement backend from fast.com (via the
`fast-cli` + Chromium browser) to Cloudflare Speed Test (HTTP only). On
first boot after the upgrade:

- Three new nullable columns (`jitter_ms`, `packet_loss_pct`, `user_isp`)
  are added to the `measurements` table. Historical rows keep them
  `null` - the data was never captured.
- Post-upgrade rows record the Cloudflare edge code (e.g. `CDG`) in
  `server_locations` instead of Netflix Fast's location strings (e.g.
  `Paris, FR | Saint Denis, FR`).
- Absolute speed numbers may differ slightly vs. pre-upgrade runs
  because the CDN behind the test is different. The trend is still
  directly comparable.
- The container image shrinks by roughly 700 MB; no Chromium, no
  `fonts-liberation`, no sandbox requirement.

## Development

```bash
bun install
bun run db:generate        # generate drizzle migrations
bun run dev                # tsx watch server.ts -> http://localhost:3000
bun run test               # vitest unit tests
bun run lint               # biome check
bun run typecheck          # tsc --noEmit
bun run build              # next build + tsup bundle for server.ts
```

> **Use `bun run test`, not `bun test`.** Bun's native test runner cannot
> load `better-sqlite3` (tracked at [oven-sh/bun#4290][bun-4290]), and most
> of the suite is DB-backed. `bun test` is blocked via `bunfig.toml` with a
> hint message pointing here; the full suite runs under vitest (Node).
>
> [bun-4290]: https://github.com/oven-sh/bun/issues/4290

### End-to-end check

```bash
# trigger one measurement (~20s)
curl -X POST http://localhost:3000/api/measurements/run

# read history
curl 'http://localhost:3000/api/measurements?range=24h' | jq

# tail the WebSocket stream
websocat ws://localhost:3000/ws

# change interval (live)
curl -X PATCH http://localhost:3000/api/settings \
  -H 'content-type: application/json' \
  -d '{"intervalMinutes":5}'
```

## API

| Route | Method | Description |
|---|---|---|
| `/api/measurements?range=1h\|6h\|24h\|7d\|30d` | GET | History for the given range |
| `/api/measurements/run` | POST | Trigger a manual run (409 if already running) |
| `/api/settings` | GET | Current interval + env default |
| `/api/settings` | PATCH | `{ intervalMinutes: 1..1440 }` |
| `/ws` | WebSocket | Pushes `measurement`, `running`, `settings_updated` events |

## Tests

Unit tests live next to the code they cover (`lib/**/*.test.ts`). Run with:

```bash
bun run test
```

Covered areas: formatting helpers, latency thresholds, cron expression generation, range validation, PATCH settings schema.

## Reverse proxy

The WebSocket lives on `/ws`. Make sure your proxy forwards the `Upgrade` header:

```nginx
location /ws {
  proxy_pass http://fastcom:3000;
  proxy_http_version 1.1;
  proxy_set_header Upgrade $http_upgrade;
  proxy_set_header Connection "upgrade";
}
```

## Mockups

See `mockups/dashboard.pen` (Pencil) for the dashboard + settings wireframes used to design the UI.
