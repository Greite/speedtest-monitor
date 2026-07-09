# Runtime-configurable locale and timezone

**Date:** 2026-07-09
**Status:** Approved
**Context:** GitHub issue asking whether the metrics section language can be switched to English.

## Problem

The UI copy is already fully English (`Download`, `Upload`, `Latency`, `<html lang="en">`). What reads as French is date/time formatting: relative times ("il y a 2 minutes") under the KPI cards and dd/mm dates in the history chart and table, produced by `lib/format.ts`:

```ts
const LOCALE = process.env.NEXT_PUBLIC_LOCALE ?? 'fr-FR';
const TIMEZONE = process.env.NEXT_PUBLIC_TIMEZONE ?? 'Europe/Paris';
```

`NEXT_PUBLIC_*` variables are inlined at build time by Next.js. The published Docker image is built in CI without them, so `fr-FR` / `Europe/Paris` is frozen into the bundle. Users of the image cannot change it at runtime, and the variables are documented nowhere.

Related pre-existing quirk: alert emails/webhooks (`lib/alerts/format.ts`, `lib/alerts/templates/render.ts`) format timestamps with `toLocaleString('sv-SE')` using the container's default timezone (UTC in Docker), so alert timestamps do not match the dashboard.

## Decision

Make locale and timezone runtime-configurable via environment variables, defaulting to `en-US` / `UTC`.

Approaches considered and rejected:

- **Flip the default to `en-US` only:** one-line change but the locale stays frozen at build time for Docker users; does not fix the root cause.
- **Settings-page option stored in SQLite:** best UX but a larger effort (client provider, DB migration, cache invalidation); can be layered on top of this design later.
- **Accept-Language detection:** zero config but unpredictable with caching and multiple viewers, and reintroduces hydration risk.

## Design

### 1. Environment variables

- `SPEEDTEST_LOCALE` (default `en-US`) and `SPEEDTEST_TIMEZONE` (default `UTC`), consistent with `SPEEDTEST_DB_PATH` and `SPEEDTEST_INTERVAL_MINUTES`.
- Read at runtime server-side; never inlined (no `NEXT_PUBLIC_` prefix).
- `NEXT_PUBLIC_LOCALE` / `NEXT_PUBLIC_TIMEZONE` are removed. They were undocumented, so no migration path is needed beyond a release-notes mention.
- Validation at first use: an invalid locale or timezone (rejected by `Intl`) falls back to the default with a console warning; the app never crashes on bad config.

### 2. Server-to-client config flow

- The root layout (server component) calls `connection()` from `next/server` before reading the env vars, forcing dynamic rendering so values are never baked at build time into static pages (e.g. login).
- The layout injects an inline `<script>` setting `window.__SPEEDTEST_CONFIG__ = { locale, timeZone }` before hydration scripts run. The JSON is escaped (`<` becomes `\u003c`).
- Server HTML and client hydration therefore use identical values: the SSR/client-consistency guarantee the old build-time inlining provided is preserved.
- `<html lang>` reflects the language subtag of the configured locale (a11y bonus).

### 3. `lib/format.ts` refactor

- Module-level `LOCALE` / `TIMEZONE` constants and eagerly-created `Intl` formatter singletons become lazy: on first call, config is resolved (server from `process.env`, client from `window.__SPEEDTEST_CONFIG__`) and `Intl` instances are cached.
- Public function signatures are unchanged: `formatDateTime`, `formatTime`, `formatShortDate`, `formatRelativeTime`. Consumers (`kpi-cards.tsx`, `history-chart.tsx`, `history-table.tsx`) require no changes.

### 4. Alerts

- `lib/alerts/format.ts` and `lib/alerts/templates/render.ts` keep their ISO-like `sv-SE` format but render in `SPEEDTEST_TIMEZONE` instead of the container default, so alert timestamps match the dashboard.

### 5. Docs and Docker

- README: add both variables to the environment-variable table.
- `docker-compose.yml`: add both as commented example entries.
- `Dockerfile` runner stage: add `SPEEDTEST_LOCALE=en-US` and `SPEEDTEST_TIMEZONE=UTC` to the `ENV` block, matching how `SPEEDTEST_INTERVAL_MINUTES` is surfaced.
- Release notes: flag the default change (`fr-FR` to `en-US`); existing instances that want French set `SPEEDTEST_LOCALE=fr-FR` and `SPEEDTEST_TIMEZONE=Europe/Paris`.

### 6. Testing

- `lib/format.test.ts`: adapt to config resolution; add cases for fallback on invalid locale/timezone and for output changing with the configured locale.
- Manual verification: run `SPEEDTEST_LOCALE=en-US bun server.ts` and check dates in the KPI cards, history chart, and history table; repeat with `fr-FR` to confirm runtime switching.

## Out of scope

- UI string translation / i18n framework (UI is already English).
- Per-user or settings-page locale selection (possible follow-up on top of this design).
- Changelog page formatting (already hardcoded `en-US`).
