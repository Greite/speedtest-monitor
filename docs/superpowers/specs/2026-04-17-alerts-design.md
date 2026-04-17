# Alerts — Design Spec

Date: 2026-04-17
Status: approved — ready for implementation plan

## Goal

Turn fastcom-monitor from a "nice dashboard" into a monitoring brick that actually tells the user when their connection degrades. First-class requirement for open-source adoption with r/selfhosted audience.

## Scope

In-scope (v1):
- Threshold alerts on download, upload, latency, bufferbloat (condition A)
- Failure-streak alert on N consecutive non-success measurements (condition C)
- Recovery alerts when a previously-firing condition clears (condition E)
- Destinations: generic webhook, ntfy, Discord, Slack, Email (SMTP)
- Hybrid config: destination secrets in env, rules in DB/UI
- State-based dispatch (per-condition OK/ALERTING state, fire on transition only — no spam during prolonged outages)
- Test endpoint to validate destination wiring without waiting for an incident

Out of scope (v2+):
- Sustained-threshold alerts (N consecutive breaches) — condition A with a sensible streak subsumes 80% of use cases
- Statistical deviation alerts (>2σ vs rolling baseline)
- Quiet hours / mute / acknowledge / severity
- Cooldown / re-fire reminders
- Multiple named rule sets (e.g., weekday/weekend)
- Per-destination severity routing
- Alert history as a dedicated page

## Conditions (chosen: A + C + E)

Five `AlertKind`s, each with independent OK / ALERTING state:

| Kind | Triggers when | Observed value | Threshold source |
|---|---|---|---|
| `download_below` | `measurement.status==='success' && downloadMbps < rules.thresholds.downloadMbps` | `downloadMbps` | `rules.thresholds.downloadMbps` |
| `upload_below` | idem with `uploadMbps` | `uploadMbps` | `rules.thresholds.uploadMbps` |
| `latency_above` | `latencyUnloadedMs > rules.thresholds.latencyMs` | `latencyUnloadedMs` | `rules.thresholds.latencyMs` |
| `bufferbloat_above` | `bufferBloatMs > rules.thresholds.bufferBloatMs` | `bufferBloatMs` | `rules.thresholds.bufferBloatMs` |
| `failure_streak` | `streakCount >= rules.failureStreak` where streak counts consecutive non-success measurements ending at current | `streakCount` | `rules.failureStreak` |

Recovery (condition E) is implicit in the state machine: `ALERTING` → `OK` emits event `resolved` for the same kind.

A `null` threshold disables that condition. Changing a threshold while ALERTING: the next measurement compares against the new threshold; if it passes, a natural `resolved` fires. No synthetic resolve on PATCH. Disabling alerts globally (`enabled: false`) skips evaluation entirely; re-enabling lets the next measurement normalise state via natural transitions.

Measurements with `status !== 'success'` cannot evaluate conditions A (values are null), so those kinds' state stays unchanged. Only `failure_streak` can transition from a failed measurement.

## Architecture

```
lib/alerts/
  types.ts            AlertKind, AlertEvent, AlertState, AlertRules, AlertPayload, DeliveryResult
  config.ts           loadAlertConfig() — zod-validated env parsing for destinations
  rules.ts            getAlertRules() / setAlertRules() — reads/writes the `alertRules` key in `settings`
  state.ts            readAlertState() — last event per kind → OK|ALERTING
  streak.ts           computeFailureStreak() — counts consecutive non-success ending at current
  evaluate.ts         evaluateAlerts({measurement, streakCount, currentState, rules}) → AlertTransition[]
                      Pure function. 100% unit-testable.
  format.ts           formatMessage(transition, measurement, rules) → {title, body}
                      Pure function. TZ-aware timestamps (container TZ, e.g. Europe/Paris).
  dispatch.ts         dispatchAlert(transition, destinations, rules) → Record<name, DeliveryResult>
                      Promise.allSettled + per-destination 10s timeout.
  handle.ts           handleAlertsForMeasurement(measurement) — top-level glue called after
                      broadcastMeasurement() in lib/fastcli/runner.ts
  destinations/
    index.ts          Destination interface + factory returning all 5 destinations
    webhook.ts        POST with configurable headers
    ntfy.ts           POST + X-Title/X-Priority/X-Tags headers
    discord.ts        POST with embed (color, timestamp, footer)
    slack.ts          POST with blocks + text fallback
    smtp.ts           nodemailer.createTransport(...).sendMail(...)
```

Integration point — exactly one call added to `lib/fastcli/runner.ts`:

```ts
// in runMeasurement(), after broadcastMeasurement(row)
await handleAlertsForMeasurement(row);
```

`handleAlertsForMeasurement` is fire-and-forget conceptually, but awaits the `insertAlertRow` step so the alert persists before returning. Destination dispatch is non-blocking and updates `delivery_status` asynchronously via `.then(...)`; the measurement pipeline never waits on SMTP/HTTP.

## Data model

New table `alerts`:

```ts
alerts = sqliteTable('alerts', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  timestamp: integer('timestamp', { mode: 'timestamp_ms' }).notNull()
    .default(sql`(unixepoch() * 1000)`),
  kind: text('kind', { enum: [
    'download_below', 'upload_below',
    'latency_above', 'bufferbloat_above', 'failure_streak',
  ] }).notNull(),
  event: text('event', { enum: ['fired', 'resolved'] }).notNull(),
  measurementId: integer('measurement_id')
    .references(() => measurements.id, { onDelete: 'set null' }),
  threshold: real('threshold'),        // snapshot of the configured threshold
  observed: real('observed'),          // value that triggered
  deliveryStatus: text('delivery_status', { mode: 'json' })
    .$type<Record<string, DeliveryResult>>(),
});
// Index for state lookups (last event per kind)
CREATE INDEX alerts_kind_timestamp_idx ON alerts(kind, timestamp DESC);
```

Rules stored as a single JSON value in the existing `settings` key-value table under `key = 'alertRules'`:

```ts
type AlertRules = {
  enabled: boolean;
  thresholds: {
    downloadMbps: number | null;   // null disables the condition
    uploadMbps: number | null;
    latencyMs: number | null;
    bufferBloatMs: number | null;
  };
  failureStreak: number | null;    // N consecutive non-success measurements
  destinations: {
    webhook: boolean;
    ntfy: boolean;
    discord: boolean;
    slack: boolean;
    smtp: boolean;
  };
};
```

Default on fresh install: `enabled: false`, all thresholds `null`, all destinations `false`. Zero alerts fire until the user opts in.

Retention: the daily purge cron in `lib/measurements.ts::purgeByRetention` is extended to also purge `alerts` older than `retentionDays`. `ON DELETE SET NULL` on `measurement_id` keeps alerts alive when their originating measurement is purged.

## Destinations

Common payload:

```ts
type AlertPayload = {
  event: 'fired' | 'resolved';
  kind: AlertKind;
  title: string;           // pre-formatted
  body: string;            // pre-formatted
  observed: number | null;
  threshold: number | null;
  timestamp: number;       // ms epoch
  measurementId: number | null;
  alertId: number;
};
```

Per-destination mapping:

**webhook** — `POST $FASTCOM_WEBHOOK_URL` with `Content-Type: application/json`, headers merged from `FASTCOM_WEBHOOK_HEADERS` (JSON string, zod-validated, invalid → warn + destination treated as unconfigured). Body = the full `AlertPayload`.

**ntfy** — `POST $FASTCOM_NTFY_URL` (URL includes the topic). Headers: `X-Title: <title>`, `X-Priority: urgent` (fired) or `default` (resolved), `X-Tags: warning,rotating_light` (fired) or `white_check_mark` (resolved), `Authorization: Bearer $FASTCOM_NTFY_TOKEN` when set. Body = plain text `<body>`.

**discord** — `POST $FASTCOM_DISCORD_WEBHOOK`. Body: `{ embeds: [{ title, description: body, color: 15548997 (red, fired) | 5763719 (green, resolved), timestamp: ISO, footer: { text: "fastcom-monitor" } }] }`.

**slack** — `POST $FASTCOM_SLACK_WEBHOOK`. Body: `{ text: title (fallback for mobile), blocks: [header + mrkdwn section with observed/threshold/at] }`.

**smtp** — nodemailer `createTransport({ host, port, secure, auth })` where `secure` is `true` if port=465 else `false` unless `FASTCOM_SMTP_SECURE` overrides. Subject: `[Fastcom] <title>`. Plain-text body with observed/threshold/at + optional dashboard link from `FASTCOM_PUBLIC_URL`.

Dispatch logic:

```ts
const active = destinations.filter(d => d.isConfigured() && rules.destinations[d.name]);
const results = await Promise.allSettled(
  active.map(d => withTimeout(d.send(payload), 10_000))
);
// normalize settled results → Record<name, DeliveryResult>
```

One destination failing (timeout, bad creds, 5xx) must never block the others. The full `delivery_status` map is persisted on the alert row for debugging.

## Env vars

All optional. A destination is "configured" iff its required vars are present.

```
# Generic webhook
FASTCOM_WEBHOOK_URL
FASTCOM_WEBHOOK_HEADERS       # JSON string, e.g. {"Authorization":"Bearer xxx"}

# ntfy
FASTCOM_NTFY_URL              # https://ntfy.sh/my-topic or self-hosted
FASTCOM_NTFY_TOKEN            # optional, for private instances

# Discord
FASTCOM_DISCORD_WEBHOOK

# Slack
FASTCOM_SLACK_WEBHOOK

# SMTP
FASTCOM_SMTP_HOST
FASTCOM_SMTP_PORT             # default 587
FASTCOM_SMTP_SECURE           # auto (default: true if port=465) | true | false
FASTCOM_SMTP_USER             # optional (no-auth relays supported)
FASTCOM_SMTP_PASS
FASTCOM_SMTP_FROM             # e.g. "Fastcom <alerts@example.com>"
FASTCOM_SMTP_TO               # comma-separated recipients

# Common
FASTCOM_PUBLIC_URL            # optional, used in SMTP body as dashboard link
```

Parsed at boot by `loadAlertConfig()` with zod. Invalid values log a warning and mark the destination unconfigured; they never crash the server.

## API

| Method | Path | Body / Query | Returns |
|---|---|---|---|
| GET | `/api/alerts/rules` | — | `{...AlertRules, destinationsConfigured: Record<name, boolean>}` — **never** returns secrets |
| PATCH | `/api/alerts/rules` | `Partial<AlertRules>` (zod-validated) | updated rules |
| POST | `/api/alerts/test` | `{destination?: name}` — if absent tests all configured | `Record<name, DeliveryResult>` |
| GET | `/api/alerts?limit=50` | `limit` query (default 50, max 500) | `{alerts: Alert[]}` |

WebSocket broadcast: after a dispatch completes, `broadcastAlert({id, kind, event, deliveryStatus, ...})` pushes to connected clients so the UI history panel updates live.

## UI

`/settings/page.tsx` gets a new "Alerts" card under the existing Measurement interval / Data retention cards. Layout:

```
┌─ Alerts ──────────────────────────────────────────┐
│ [●] Enable alerts                                  │
│                                                    │
│ Thresholds (leave empty to disable a condition)    │
│   Download below      [__] Mbps                    │
│   Upload below        [__] Mbps                    │
│   Latency above       [__] ms                      │
│   Bufferbloat above   [__] ms                      │
│   Failure streak      [__] consecutive failures    │
│                                                    │
│ Destinations                                       │
│   [✓] Webhook   ○ configured in env   [Send test]  │
│   [✓] ntfy      ○ configured in env   [Send test]  │
│   [ ] Discord   ● missing env var     [Send test]  │
│   [ ] Slack     ● missing env var     [Send test]  │
│   [ ] SMTP      ○ configured in env   [Send test]  │
│                                                    │
│ Save                                               │
└────────────────────────────────────────────────────┘
```

`[Send test]` is enabled only when the destination has env vars set. It triggers `POST /api/alerts/test` with `destination: <name>` and surfaces the result inline. A "Recent alerts" collapsible panel at the bottom of the card shows the last 10 alerts via `GET /api/alerts?limit=10`.

Reuses existing form patterns from the Measurement interval / Data retention cards (same spacing, buttons, layout primitives).

## Testing

Colocated `.test.ts` files, vitest. Pure modules first, then adapters, then integration.

| File | Coverage |
|---|---|
| `lib/alerts/evaluate.test.ts` | Table-driven: 5 kinds × {OK→ALERTING, ALERTING→OK, OK→OK, ALERTING→ALERTING} + edge cases (status=error, threshold=null, null measurement values) |
| `lib/alerts/format.test.ts` | title + body per kind, fired vs resolved, TZ-correct timestamps |
| `lib/alerts/destinations/webhook.test.ts` | URL, header merge from FASTCOM_WEBHOOK_HEADERS, body shape, non-2xx → DeliveryResult.ok=false |
| `lib/alerts/destinations/ntfy.test.ts` | X-Title/X-Priority/X-Tags correctness, optional auth |
| `lib/alerts/destinations/discord.test.ts` | embed color/timestamp/description shape |
| `lib/alerts/destinations/slack.test.ts` | blocks + text fallback shape |
| `lib/alerts/destinations/smtp.test.ts` | nodemailer mocked: subject, from/to, secure/port logic |
| `lib/alerts/dispatch.test.ts` | parallel dispatch, per-destination timeout, partial failures don't bubble |
| `lib/alerts/streak.test.ts` | fixtures (alternating success/fail, all-fail, all-success, empty) |
| `lib/alerts/handle.test.ts` | integration with `:memory:` sqlite — insert → evaluate → dispatch stub → update delivery_status |
| `app/api/alerts/rules.test.ts` | GET never returns secrets, PATCH zod-valid, destinationsConfigured correctness |
| `app/api/alerts/test/route.test.ts` | dispatches to all configured when no body, or to specified one |

## Migration & dependencies

Drizzle migration:
1. Add `alerts` table + index in `lib/db/schema.ts`
2. `bunx drizzle-kit generate` → `drizzle/XXXX_alerts.sql`
3. Review generated SQL, confirm index syntax
4. `runMigrations()` picks it up on boot; idempotent and safe for existing installs

New dependency: `nodemailer@^6` (stable, ~500 KB). Added to `package.json` `dependencies` and to the `bun add` list in the `runtime-deps` stage of `Dockerfile`.

Backwards compat: schema change is additive only; no changes to `measurements` or `settings` tables. No env var made mandatory. Default rules after migration = alerts disabled.

Rollback: `DROP TABLE alerts; DELETE FROM settings WHERE key='alertRules';`

## Non-goals / decisions deferred

- **Quiet hours / mute / ack / severity levels** — YAGNI for v1; the "fire on transition only" model already prevents the main pain (spam). Revisit if users ask.
- **Cooldown / re-fire reminders** — same reasoning; users who miss a push have the dashboard.
- **Statistical deviation detection (condition D)** — requires rolling baseline storage, tuning, and anomaly-threshold UX. Separate spec when demand justifies it.
- **Sustained-threshold (condition B)** — immediate threshold + a sensible user-chosen threshold value covers this. If false positives surface, revisit.
- **Multiple named rule sets** — v1 is one global rule set. Multi-rule config surface adds UI/DB complexity we don't need yet.
- **Dedicated `/alerts` history page** — collapsible panel in the Alerts settings card is enough; a full page is worth it once we have filtering/search needs.

## Open questions

None at design time. All major axes resolved during brainstorming.

## Deliverable summary

```
lib/alerts/
  types.ts, config.ts, rules.ts, state.ts, streak.ts, evaluate.ts,
  format.ts, dispatch.ts, handle.ts
  destinations/
    index.ts, webhook.ts, ntfy.ts, discord.ts, slack.ts, smtp.ts
  *.test.ts (12 files)
app/api/alerts/
  route.ts                      (GET list)
  rules/route.ts                (GET / PATCH)
  test/route.ts                 (POST test dispatch)
app/settings/page.tsx           (+ Alerts card)
lib/db/schema.ts                (+ alerts table)
lib/measurements.ts             (purge extended to alerts)
lib/fastcli/runner.ts           (+ handleAlertsForMeasurement call)
lib/ws/broadcast.ts             (+ broadcastAlert)
drizzle/XXXX_alerts.sql
Dockerfile                      (+ nodemailer in runtime-deps)
package.json                    (+ nodemailer)
README.md                       (+ Alerts section)
```
