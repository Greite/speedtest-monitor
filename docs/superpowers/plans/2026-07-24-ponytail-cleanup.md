# Ponytail Cleanup Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Apply the 2026-07-24 ponytail audit: remove ~1,300 lines of dead code and speculative abstraction, and drop 3 dependencies (mjml, @types/mjml, node-cron), with zero behavior change visible to users. (axe-audit/knip/lighthouse findings were withdrawn after checking the SDD ledger — see Task 1.)

**Architecture:** Pure deletion/refactor under the existing test suite. No new features. Each task is independently committable on `main` (repo convention: commit directly on main, single-line commit titles, no body, no trailers).

**Tech Stack:** Next.js 16 (custom Bun server), Bun test, drizzle + bun:sqlite, better-auth, Astryx design system.

## Global Constraints

- Commit messages: single title line only, no body, no `Claude-Session` trailer. Commit directly on `main`.
- After every task: `bun test` green, `bun run tsc` green, `bun run biome:check` green (husky pre-commit also runs lint + test + build).
- Never weaken: input validation at API boundaries, password hashing, `safeHref` link sanitization, a11y attributes.
- Existing test expectations define behavior. When a source file is folded/moved, update test imports; do not delete assertions unless the tested export is itself deleted by this plan.
- Deliberate corner cuts get a `ponytail:` comment naming the ceiling and upgrade path.

### Audit findings deliberately skipped (do not implement)

- `dispatchAlert`'s `timeoutMs?` param stays: it is the seam that makes the timeout branch testable without a 10s sleep.
- Topbar's `useLiveMeasurements` buffer waste (0-line fix doesn't exist; tolerated).
- "Unify dialogs on useDialogA11yIds": the aria-label vs aria-labelledby difference is deliberate (documented in reset-password-dialog.tsx); instead the hook is inlined and deleted (Task 8).

---

### Task 1: Drop dead tooling

**AMENDED after ledger check (.superpowers/sdd/progress.md):** `scripts/axe-audit.ts` + `puppeteer-core` + `axe-core` are KEPT (built deliberately in Astryx P3 Task 4 — the axe CLI silently audits dark mode on macOS; a P4 follow-up plans to expand its CI use). `knip` + `knip.json` are KEPT (used manually per ledger P2). The Lighthouse `|| true` step + `.lighthouserc.json` are KEPT (documented CSS-payload watch, ledger P1 follow-up). Only the shadcn relic and stale trustedDependencies go.

**Files:**
- Delete: `components.json`
- Modify: `package.json`

**Interfaces:** none (nothing imports these; verified by audit greps).

- [ ] **Step 1: Delete file**

```bash
rm components.json
```

- [ ] **Step 2: Clean package.json**

- Remove from `trustedDependencies`: `"better-sqlite3"`, `"puppeteer"` (absent from bun.lock; keep `esbuild`, `sharp`, `@biomejs/biome`).
- Run `bun install` to refresh the lockfile.

- [ ] **Step 3: Verify**

Run: `bun test && bun run tsc && bun run biome:check` — all green.

- [ ] **Step 4: Commit**

```bash
git add -A && git commit -m "chore: drop shadcn relic and stale trustedDependencies entries"
```

---

### Task 2: Replace node-cron with setInterval, inline scheduler/external.ts

**Files:**
- Rewrite: `lib/scheduler/index.ts`
- Delete: `lib/scheduler/external.ts`, `lib/scheduler/cron-expr.test.ts`
- Modify: `app/api/settings/route.ts`, `package.json` (remove `node-cron`)

**Interfaces:**
- Produces: `bootScheduler(): Promise<void>`, `rescheduleFromSettings(): void`, `stopScheduler(): void` (same names as before; `cronExprForMinutes` is deleted). `globalThis.__speedtestReschedule` declaration moves into `lib/scheduler/index.ts`.
- Consumers to check: `grep -rn "scheduler/external\|cronExprForMinutes\|requestReschedule" app lib server.ts` — only `app/api/settings/route.ts` and the deleted test.

- [ ] **Step 1: Rewrite `lib/scheduler/index.ts`**

```ts
import { ensureSeededAdmin } from '../auth/bootstrap';
import { migrateLegacyAuth } from '../auth/migrate-legacy';
import { runMigrations } from '../db/migrate';
import { runMeasurementSafe } from '../measurement/runner';
import { purgeByRetention } from '../measurements';
import { getIntervalMinutes, getRetentionDays } from '../settings';

declare global {
  var __speedtestScheduler: { timer: ReturnType<typeof setInterval>; minutes: number } | undefined;
  var __speedtestPurge: ReturnType<typeof setInterval> | undefined;
  var __speedtestReschedule: (() => void) | undefined;
}

const DAY_MS = 24 * 60 * 60 * 1000;

export async function bootScheduler() {
  runMigrations();
  migrateLegacyAuth();
  await ensureSeededAdmin();
  rescheduleFromSettings();
  startPurgeTimer();
  globalThis.__speedtestReschedule = rescheduleFromSettings;
}

// ponytail: setInterval, no wall-clock alignment (old cron ticked at :00/:15) —
// bring back a cron lib only if aligned ticks become a real need.
export function rescheduleFromSettings() {
  const minutes = getIntervalMinutes();
  if (globalThis.__speedtestScheduler?.minutes === minutes) {
    return;
  }
  if (globalThis.__speedtestScheduler) {
    clearInterval(globalThis.__speedtestScheduler.timer);
  }
  const timer = setInterval(() => {
    runMeasurementSafe().catch(() => {});
  }, minutes * 60_000);
  globalThis.__speedtestScheduler = { timer, minutes };
}

function startPurgeTimer() {
  if (globalThis.__speedtestPurge) {
    return;
  }
  const purge = () => {
    try {
      purgeByRetention(getRetentionDays());
    } catch {}
  };
  // Run once at boot (covers deployments that restart more often than daily),
  // then every 24h. Old behavior was daily at 03:00; exact hour never mattered.
  purge();
  globalThis.__speedtestPurge = setInterval(purge, DAY_MS);
}

export function stopScheduler() {
  if (globalThis.__speedtestScheduler) {
    clearInterval(globalThis.__speedtestScheduler.timer);
  }
  globalThis.__speedtestScheduler = undefined;
  if (globalThis.__speedtestPurge) {
    clearInterval(globalThis.__speedtestPurge);
  }
  globalThis.__speedtestPurge = undefined;
  globalThis.__speedtestReschedule = undefined;
}
```

(`migrateLegacyAuth` import survives until Task 3 removes it.)

- [ ] **Step 2: Delete `lib/scheduler/external.ts` and `lib/scheduler/cron-expr.test.ts`**

- [ ] **Step 3: Update `app/api/settings/route.ts`**

Remove `import { requestReschedule } from '@/lib/scheduler/external';` and replace the call `requestReschedule();` with:

```ts
globalThis.__speedtestReschedule?.();
```

(The `declare global` in `lib/scheduler/index.ts` types it program-wide.)

- [ ] **Step 4: Remove dep**

Remove `node-cron` from `package.json` dependencies, run `bun install`. Verify: `rtk grep -rn "node-cron" lib app server.ts scripts` → no hits.

- [ ] **Step 5: Verify**

Run: `bun test && bun run tsc && bun run biome:check` — green. Smoke: `bun server.ts` boots without throwing (Ctrl-C after "ready").

- [ ] **Step 6: Commit**

```bash
git add -A && git commit -m "refactor: replace node-cron with setInterval and inline scheduler reschedule hook"
```

---

### Task 3: Delete dead auth code (legacy migration, needsRehash, oidc lookup, types file, AuthError.status)

**Files:**
- Delete: `lib/auth/migrate-legacy.ts`, `lib/auth/types.ts`
- Modify: `lib/db/schema.ts`, `lib/scheduler/index.ts`, `lib/auth/hash.ts`, `lib/auth/hash.test.ts`, `lib/auth/users.ts`, `lib/auth/users.test.ts`, `lib/auth/authorize.ts`, plus every importer of `@/lib/auth/types`
- Create (generated): `drizzle/0006_*.sql` via drizzle-kit

**Interfaces:**
- Produces: `lib/auth/authorize.ts` now exports `type SessionUser` (same shape as before: `{ id: string; email: string; name?: string | null; role: UserRole; sessionId?: string }`). `UserRole` stays in `lib/db/schema.ts`.
- Consumers to repoint: `grep -rn "auth/types" app lib components` — every hit switches to `import type { SessionUser } from '@/lib/auth/authorize'` and/or `import type { UserRole } from '@/lib/db/schema'`.

- [ ] **Step 1: Remove legacy table from schema**

In `lib/db/schema.ts` delete the `legacyUsers` table block (lines 60-79 incl. the comment) and `export type LegacyUser`. Keep `UserRole`/`UserProvider`.

- [ ] **Step 2: Delete `lib/auth/migrate-legacy.ts`; remove its import + `migrateLegacyAuth();` call from `lib/scheduler/index.ts`**

- [ ] **Step 3: Generate the drop migration**

Run: `bun run db:generate`
Expected: a new `drizzle/0006_*.sql` containing `DROP TABLE \`users\`;`. Inspect it; if drizzle-kit asks interactively about the deleted table, choose "delete". Then run `bun scripts/migrate.ts` against the local dev DB to confirm it applies.

- [ ] **Step 4: Trim `lib/auth/hash.ts`**

Delete `needsRehash`, the `PARALLELISM` constant, and their doc comments (keep `OPTS`, `hashPassword`, `verifyPassword`, `verifyPasswordPair` — hashing itself untouched). In `lib/auth/hash.test.ts` remove `needsRehash` from the import and delete the `it('needsRehash false for a fresh hash', ...)` block.

- [ ] **Step 5: Trim `lib/auth/users.ts`**

Delete `findUserByOidcSubject` (lines 53-56). In `lib/auth/users.test.ts` remove it from the import and delete the `it('findUserByOidcSubject', ...)` block.

- [ ] **Step 6: Fold `lib/auth/types.ts` into authorize, drop AuthError**

Rewrite `lib/auth/authorize.ts`:

```ts
import { headers } from 'next/headers';

import type { UserRole } from '../db/schema';
import { auth } from './handler';

export type SessionUser = {
  id: string;
  email: string;
  name?: string | null;
  role: UserRole;
  sessionId?: string;
};

export async function requireSession(): Promise<SessionUser> {
  const session = await auth.api.getSession({ headers: await headers() });
  const u = session?.user;
  if (!u?.id || !u.email) {
    throw new Error('unauthorized');
  }
  const role = (u as { role?: UserRole }).role;
  if (!role) {
    throw new Error('unauthorized');
  }
  return {
    id: u.id,
    email: u.email,
    name: u.name ?? null,
    role,
    sessionId: session?.session?.id,
  };
}

export async function requireAdmin(): Promise<SessionUser> {
  const user = await requireSession();
  if (user.role !== 'admin') {
    throw new Error('forbidden');
  }
  return user;
}
```

(No catcher anywhere reads `AuthError.status` — grep confirmed; both paths already end as generic 500s. If a status-mapping catcher is ever written, reintroduce the class then.)

Delete `lib/auth/types.ts`. Repoint every `auth/types` importer (grep from Interfaces above).

- [ ] **Step 7: Verify**

Run: `bun test && bun run tsc && bun run biome:check` — green.

- [ ] **Step 8: Commit**

```bash
git add -A && git commit -m "refactor: drop legacy auth migration, needsRehash, oidc lookup and auth types file"
```

---

### Task 4: Delete dead WS broadcasts, move EngineResult, single Range type

**Files:**
- Modify: `lib/ws/broadcast.ts`, `lib/types.ts`, `lib/alerts/handle.ts`, `lib/alerts/handle.test.ts`, `app/api/settings/route.ts`, `lib/measurement/cloudflare.ts`, `lib/measurement/runner.test.ts`, `lib/measurements.ts`, `components/use-live-measurements.ts`, `components/time-range-picker.tsx`
- Delete: `lib/measurement/types.ts`

**Interfaces:**
- Produces: `WsEventDto` shrinks to the two variants clients actually handle (`measurement`, `running`). `EngineResult` is exported from `lib/measurement/cloudflare.ts`. `Range` (`'6h' | '12h' | '24h' | '7d' | '30d'`) is exported from `lib/measurements.ts` and imported everywhere else.

- [ ] **Step 1: Trim `lib/ws/broadcast.ts`**

Keep only `broadcastMeasurement` and `broadcastRunning`; delete `broadcastSettingsUpdated` and `broadcastAlert` (and the now-unused `Alert` import).

- [ ] **Step 2: Trim `lib/types.ts`**

Delete `AlertDto` and the `'settings_updated'` / `'alert'` variants of `WsEventDto`:

```ts
export type WsEventDto =
  | { type: 'measurement'; payload: MeasurementDto }
  | { type: 'running'; payload: { startedAt: number } };
```

Remove the now-unused `AlertEvent, AlertKind` from the top import.

- [ ] **Step 3: Update callers**

- `lib/alerts/handle.ts`: remove `broadcastAlert` import; in `dispatchAndUpdate` replace the last two lines with `db.update(alerts).set({ deliveryStatus }).where(eq(alerts.id, row.id)).run();`
- `lib/alerts/handle.test.ts`: delete the `mock.module('../ws/broadcast', ...)` line and any assertion on `broadcastAlert`.
- `app/api/settings/route.ts`: remove `broadcastSettingsUpdated` import and call (keep `intervalChanged` driving `globalThis.__speedtestReschedule?.()`; if `intervalChanged` becomes single-use, inline it).

- [ ] **Step 4: Move `EngineResult`**

Move the `EngineResult` type from `lib/measurement/types.ts` into `lib/measurement/cloudflare.ts` (exported), delete `lib/measurement/types.ts`, update the import in `lib/measurement/runner.test.ts` to `./cloudflare`.

- [ ] **Step 5: Single `Range` type**

In `lib/measurements.ts` add `export` to the existing `Range` type. In `components/use-live-measurements.ts` and `components/time-range-picker.tsx` delete the local declaration and `import type { Range } from '@/lib/measurements';`.

- [ ] **Step 6: Verify**

Run: `bun test && bun run tsc && bun run biome:check` — green.

- [ ] **Step 7: Commit**

```bash
git add -A && git commit -m "refactor: drop listener-less ws broadcasts, move EngineResult, dedupe Range type"
```

---

### Task 5: Replace the MJML email chain with a template literal

**Files:**
- Rewrite: `lib/alerts/templates/render.ts`
- Delete: `lib/alerts/templates/alert-email.mjml`, `lib/alerts/templates/alert-email.html.ts`, `scripts/build-email-templates.ts`
- Modify: `package.json` (scripts `build`, `build:email`; deps `mjml`, `@types/mjml`), `lib/alerts/templates/render.test.ts` (only if an assertion targets MJML internals)

**Interfaces:**
- Produces: `renderAlertEmail(payload: AlertPayload, publicUrl: string | null): RenderedEmail` — unchanged signature. New export `formatAlertTimestamp(ms: number): string` (Task 6's folded `formatMessage` will import it).
- Contract pinned by `render.test.ts`: subject `[Speedtest] <title>`; text lines incl. `Alert ID:`/`Kind:`/`Event:`/optional `Dashboard:`; html contains escaped title/body, `Speedtest Monitor`, uppercase `OBSERVED`/`THRESHOLD` labels with `>42<`-style values only when both metrics are set, dashboard CTA only when `publicUrl` is set, no `__X__` leftovers.

- [ ] **Step 1: Rewrite `lib/alerts/templates/render.ts`**

Keep `unitFor`, `severitySubtitle`, `severityLabel` and the subject/text builders exactly as they are. Delete `escapeHtml` (use `Bun.escapeHTML`), `stripSection`, the `ALERT_EMAIL_HTML` import and the replacements loop. Rename `formatTimestamp` to exported `formatAlertTimestamp`. Build the html with a template literal (email-safe: tables, inline styles, no external fonts):

```ts
export function renderAlertEmail(payload: AlertPayload, publicUrl: string | null): RenderedEmail {
  const severity: Severity = payload.event === 'resolved' ? 'recovered' : 'fired';
  const accent = severity === 'recovered' ? '#16a34a' : '#dc2626';
  const icon = severity === 'recovered' ? '✓' : '!';
  const label = severityLabel(payload.event, payload.kind);
  const sub = severitySubtitle(payload.kind, payload.event);
  const unit = unitFor(payload.kind);
  const timestamp = formatAlertTimestamp(payload.timestamp);
  const showMetrics = payload.observed !== null && payload.threshold !== null;
  const e = Bun.escapeHTML;

  const subject = `[Speedtest] ${payload.title}`;
  const textLines = [payload.body, '', `Alert ID: ${payload.alertId}`, `Kind: ${payload.kind}`, `Event: ${payload.event}`];
  if (publicUrl) {
    textLines.push('', `Dashboard: ${publicUrl}`);
  }
  const text = textLines.join('\n');

  const row = (k: string, v: string) => `
    <tr>
      <td style="padding:4px 12px 4px 0;color:#6b7280;font-size:12px;text-transform:uppercase;letter-spacing:.08em;">${k}</td>
      <td style="padding:4px 0;color:#111827;font-size:14px;font-weight:600;">${v}</td>
    </tr>`;

  const metricsHtml = showMetrics
    ? `<table role="presentation" cellpadding="0" cellspacing="0" style="margin:16px 0;">
        ${row('OBSERVED', `<span>${e(String(payload.observed))}</span> ${e(unit)}`)}
        ${row('THRESHOLD', `<span>${e(String(payload.threshold))}</span> ${e(unit)}`)}
      </table>`
    : '';

  const ctaHtml = publicUrl
    ? `<p style="margin:20px 0 0;">
        <a href="${e(publicUrl)}" style="display:inline-block;background:${accent};color:#ffffff;text-decoration:none;padding:10px 18px;border-radius:6px;font-size:14px;font-weight:600;">Open dashboard</a>
      </p>`
    : '';

  const html = `<!doctype html>
<html lang="en">
  <body style="margin:0;padding:24px;background:#f3f4f6;font-family:-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif;">
    <table role="presentation" cellpadding="0" cellspacing="0" width="100%" style="max-width:560px;margin:0 auto;background:#ffffff;border-radius:8px;border:1px solid #e5e7eb;">
      <tr>
        <td style="padding:20px 24px;border-bottom:3px solid ${accent};">
          <span style="display:inline-block;width:24px;height:24px;line-height:24px;text-align:center;border-radius:12px;background:${accent};color:#ffffff;font-weight:700;">${icon}</span>
          <span style="margin-left:8px;font-size:15px;font-weight:700;color:#111827;">${e(label)}</span>
          <div style="margin-top:4px;color:#6b7280;font-size:13px;">${e(sub)}</div>
        </td>
      </tr>
      <tr>
        <td style="padding:24px;">
          <h1 style="margin:0 0 8px;font-size:18px;color:#111827;">${e(payload.title)}</h1>
          <p style="margin:0;color:#374151;font-size:14px;line-height:1.6;">${e(payload.body)}</p>
          ${metricsHtml}
          <table role="presentation" cellpadding="0" cellspacing="0" style="margin-top:16px;">
            ${row('ALERT', e(`#${payload.alertId}`))}
            ${row('KIND', e(payload.kind))}
            ${row('EVENT', e(payload.event))}
            ${row('TIME', e(timestamp))}
          </table>
          ${ctaHtml}
        </td>
      </tr>
      <tr>
        <td style="padding:14px 24px;border-top:1px solid #e5e7eb;color:#9ca3af;font-size:12px;">Speedtest Monitor</td>
      </tr>
    </table>
  </body>
</html>`;

  return { subject, text, html };
}
```

(ponytail: plain inline-style HTML — old-Outlook VML conditionals dropped; re-add an MJML build only if broken rendering is actually reported.)

- [ ] **Step 2: Delete the chain**

```bash
rm lib/alerts/templates/alert-email.mjml lib/alerts/templates/alert-email.html.ts scripts/build-email-templates.ts
```

In `package.json`: delete the `build:email` script, remove `bun scripts/build-email-templates.ts && ` from the `build` script, remove `mjml` + `@types/mjml` devDeps, `bun install`.

- [ ] **Step 3: Run the render tests**

Run: `bun test lib/alerts/templates` — expected green as-is (the contract above was written against them). Fix the template, not the assertions, unless an assertion targets MJML internals (e.g. Roboto link), in which case delete that assertion.

- [ ] **Step 4: Full verify**

Run: `bun test && bun run tsc && bun run biome:check && bun run build` — green (build proves the pipeline no longer needs the mjml step).

- [ ] **Step 5: Commit**

```bash
git add -A && git commit -m "refactor: replace mjml email chain with a template literal"
```

---

### Task 6: Fold the alerts module (destinations, state/streak/format/dispatch, evaluate table, small deletes)

**Files:**
- Create: `lib/alerts/destinations.ts` (merge of `destinations/*.ts`), merge tests into `lib/alerts/destinations.test.ts`
- Delete: `lib/alerts/destinations/` (7 source files + 5 test files), `lib/alerts/state.ts`, `lib/alerts/streak.ts`, `lib/alerts/format.ts`, `lib/alerts/dispatch.ts`
- Modify: `lib/alerts/handle.ts`, `lib/alerts/evaluate.ts`, `lib/alerts/types.ts`, `lib/alerts/templates/render.ts` (imports only), `app/api/alerts/rules/route.ts`, `components/settings/alerts-card.tsx`, test files: `state.test.ts`, `streak.test.ts`, `format.test.ts`, `dispatch.test.ts` (imports → `./handle`)

**Interfaces:**
- Produces: `lib/alerts/destinations.ts` exports `Destination`, `httpDeliver`, `buildDestinations(cfg)` (the 5 `createXDestination` become non-exported internals unless a test imports them — then keep them exported). `lib/alerts/handle.ts` additionally exports `readAlertState`, `computeFailureStreak`, `formatMessage`, `dispatchAlert` (unchanged signatures).
- `formatMessage` drops its local `formatTime` and imports `formatAlertTimestamp` from `./templates/render` (no cycle: render imports only runtime-config + types).

- [ ] **Step 1: Merge `destinations/` into `lib/alerts/destinations.ts`**

One file containing, in order: `Destination` type, `httpDeliver`, `createWebhookDestination`, `createNtfyDestination`, `createDiscordDestination`, `createSlackDestination`, `createSmtpDestination` (bodies copied verbatim from the current files), then `buildDestinations`. Delete `configuredNames` — inline it in `app/api/alerts/rules/route.ts`:

```ts
function withConfigured() {
  const rules = getAlertRules();
  const cfg = loadAlertConfig();
  return {
    ...rules,
    destinationsConfigured: {
      webhook: cfg.webhook !== null,
      ntfy: cfg.ntfy !== null,
      discord: cfg.discord !== null,
      slack: cfg.slack !== null,
      smtp: cfg.smtp !== null,
    },
  };
}
```

Merge `webhook.test.ts`, `ntfy.test.ts`, `discord.test.ts`, `slack.test.ts`, `smtp.test.ts` into `lib/alerts/destinations.test.ts` (imports from `./destinations`; keep every describe/it). Delete the `lib/alerts/destinations/` directory. Update importers: `grep -rn "alerts/destinations" lib app` (handle.ts, rules route, dispatch types).

- [ ] **Step 2: Fold state/streak/format/dispatch into `lib/alerts/handle.ts`**

Copy `readAlertState`, `computeFailureStreak`, `formatMessage`, `dispatchAlert` (with `withTimeout` and `DEFAULT_TIMEOUT_MS`, keeping the `timeoutMs?` param) into `handle.ts` as exported functions; merge their imports; delete the four source files. In `formatMessage`, replace the local `formatTime(timestamp)` with `formatAlertTimestamp(timestamp)` imported from `./templates/render`. Update the four test files to import from `./handle`. If two test files' `mock.module` calls collide when run together, keep them as separate files (they already are) — only the import path changes.

- [ ] **Step 3: Rewrite `lib/alerts/evaluate.ts` as a table**

```ts
import type { AlertKind, Measurement } from '../db/schema';
import type { AlertRules, AlertState, AlertTransition } from './types';

type Input = {
  measurement: Measurement;
  streakCount: number;
  currentState: AlertState;
  rules: AlertRules;
};

export function evaluateAlerts(input: Input): AlertTransition[] {
  const { measurement, streakCount, currentState, rules } = input;
  if (!rules.enabled) {
    return [];
  }
  const out: AlertTransition[] = [];
  const isSuccess = measurement.status === 'success';

  const transition = (kind: AlertKind, isBreach: boolean, observed: number | null, threshold: number | null) => {
    const current = currentState[kind];
    if (isBreach && current === 'OK') {
      out.push({ kind, event: 'fired', observed, threshold });
    } else if (!isBreach && current === 'ALERTING') {
      out.push({ kind, event: 'resolved', observed, threshold });
    }
  };

  const metrics: { kind: AlertKind; threshold: number | null; observed: number | null; breach: (o: number, t: number) => boolean }[] = [
    { kind: 'download_below', threshold: rules.thresholds.downloadMbps, observed: measurement.downloadMbps, breach: (o, t) => o < t },
    { kind: 'upload_below', threshold: rules.thresholds.uploadMbps, observed: measurement.uploadMbps, breach: (o, t) => o < t },
    { kind: 'latency_above', threshold: rules.thresholds.latencyMs, observed: measurement.latencyUnloadedMs, breach: (o, t) => o > t },
    { kind: 'bufferbloat_above', threshold: rules.thresholds.bufferBloatMs, observed: measurement.bufferBloatMs, breach: (o, t) => o > t },
  ];
  for (const { kind, threshold, observed, breach } of metrics) {
    if (threshold === null || !isSuccess || observed === null) {
      continue;
    }
    transition(kind, breach(observed, threshold), observed, threshold);
  }

  if (rules.failureStreak !== null) {
    transition('failure_streak', streakCount >= rules.failureStreak, streakCount, rules.failureStreak);
  }

  return out;
}
```

Run `bun test lib/alerts/evaluate.test.ts` — must pass unchanged (same semantics: threshold unset, non-success, or null observed → no transition; failure_streak evaluated regardless of measurement status).

- [ ] **Step 4: Small deletes**

- `lib/alerts/types.ts`: delete the `export type { AlertEvent, AlertKind };` re-export (keep the `import type` — the file uses them). Repoint consumers that imported them from `./types` / `../types` (grep `AlertEvent.*from.*alerts/types|from '\.\./types'` in lib/alerts) to `../db/schema` / `../../db/schema`.
- `components/settings/alerts-card.tsx`: delete the `status`/`setStatus` state (line 64), all `setStatus(...)` calls (lines 133, 147, 158, 161, 328), and the `{status ? <span ...>...}` render (line 332). `isLoading`+label on the Save button and the success toast already cover both states.

- [ ] **Step 5: Verify**

Run: `bun test && bun run tsc && bun run biome:check` — green.

- [ ] **Step 6: Commit**

```bash
git add -A && git commit -m "refactor: fold alerts module into fewer files and table-drive evaluate"
```

---

### Task 7: Replace the hand-rolled markdown parser with Astryx Markdown

**Files:**
- Rewrite: `components/markdown.tsx` (369 → ~40 lines)
- Modify: `components/markdown.test.tsx` (keep safeHref coverage, drop parser-internals tests)

**Interfaces:**
- Produces: `Markdown({ source }: { source: string })` — unchanged signature (sole consumer: `app/changelog/page.tsx:151`). `safeHref` becomes exported for its tests.
- `@astryxdesign/core/Markdown` verified present and publicly exported (`dist/Markdown/`, `export * from './Markdown'`), props: `children: string`, `headingLevelStart`, `components.link`, `density`.

- [ ] **Step 1: Rewrite `components/markdown.tsx`**

```tsx
import { Markdown as AstryxMarkdown } from '@astryxdesign/core/Markdown';
import type { ReactNode } from 'react';

// Release notes come from an external source (GitHub), so link targets are
// untrusted: only allow schemes that cannot execute script. Parsing with URL
// mirrors browser behavior (control-character stripping, scheme detection).
export function safeHref(href: string): string | null {
  let url: URL;
  try {
    url = new URL(href, 'https://releases.invalid/');
  } catch {
    return null;
  }
  return url.protocol === 'http:' || url.protocol === 'https:' || url.protocol === 'mailto:' ? href : null;
}

function ReleaseLink({ href, children }: { href: string; children: ReactNode }) {
  const safe = safeHref(href);
  if (safe === null) {
    return <>{children}</>;
  }
  return (
    <a
      href={safe}
      target="_blank"
      rel="noopener noreferrer"
      className="font-medium text-primary underline underline-offset-2 hover:text-primary/80 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
    >
      {children}
    </a>
  );
}

export function Markdown({ source }: { source: string }) {
  // headingLevelStart={2}: release bodies use ## for sections; h1 is the page's.
  return (
    <AstryxMarkdown headingLevelStart={2} density="compact" components={{ link: ReleaseLink }}>
      {source}
    </AstryxMarkdown>
  );
}
```

- [ ] **Step 2: Trim `components/markdown.test.tsx`**

Keep (or add) tests that pin the security contract, e.g.:

```tsx
import { describe, expect, it } from 'bun:test';

import { safeHref } from './markdown';

describe('safeHref', () => {
  it('allows http/https/mailto', () => {
    expect(safeHref('https://github.com/x')).toBe('https://github.com/x');
    expect(safeHref('mailto:a@b.c')).toBe('mailto:a@b.c');
  });
  it('rejects script-capable schemes', () => {
    expect(safeHref('javascript:alert(1)')).toBeNull();
    // biome may flag the literal; keep it — this is the attack string under test
    expect(safeHref('data:text/html,x')).toBeNull();
  });
});
```

Delete tests that exercised the deleted parser internals. If the existing file already renders `<Markdown>` and asserts on output HTML, keep any assertion that still holds against Astryx output and delete the rest.

- [ ] **Step 3: Visual check**

Run: `bun run dev`, open `http://localhost:3003/changelog`. Headings, bullet lists, bold, inline code and links must render; links open in a new tab.

- [ ] **Step 4: Verify + commit**

Run: `bun test && bun run tsc && bun run biome:check` — green.

```bash
git add -A && git commit -m "refactor: replace hand-rolled markdown parser with Astryx Markdown"
```

---

### Task 8: Topbar diet + native route groups instead of SessionShell

**Files:**
- Modify: `components/topbar.tsx`, `app/layout.tsx`, `components/users/delete-user-dialog.tsx`
- Create: `app/(chrome)/layout.tsx`
- Move: `app/page.tsx` → `app/(chrome)/page.tsx`, `app/settings/page.tsx` → `app/(chrome)/settings/page.tsx`, `app/changelog/page.tsx` → `app/(chrome)/changelog/page.tsx` (login/setup stay at `app/`, chrome-less)
- Delete: `components/auth/session-shell.tsx`, `components/use-dialog-a11y-ids.ts`

**Interfaces:** none new — URL space unchanged (route groups don't affect paths).

- [ ] **Step 1: One theme switcher**

In `components/topbar.tsx` delete `ThemeMenu` (lines 99-159 incl. its comment block) and replace its desktop usage (line 331) with `<ThemeSegmented mounted={mounted} theme={theme} setTheme={setTheme} />`. Remove the now-unused imports (`DropdownMenu`, `DropdownMenuItem`, `Check`).

- [ ] **Step 2: Delete `running2`**

Remove the `running2` state, use `running` alone (`triggerRun` already sets `running: true` synchronously and resets it on error/measurement):

```tsx
const isBusy = running;

async function handleRun() {
  if (isBusy || !connected) {
    return;
  }
  try {
    await triggerRun();
  } catch {
    /* swallow: surfaced elsewhere if needed */
  }
}
```

- [ ] **Step 3: Shared run-button props**

Inside `Topbar()` (after `isBusy`), extract what the 3 render sites repeat:

```tsx
const runClassName = cn('bg-brand text-brand-foreground hover:bg-brand-hover', !isBusy && connected && 'brand-glow');
const runProps = {
  label: isBusy ? 'Running…' : 'Run now',
  isLoading: isBusy,
  isDisabled: isBusy || !connected,
  onClick: handleRun,
  variant: 'primary',
} as const;
```

Desktop: `<Button {...runProps} size="sm" icon={...} tooltip={connected ? undefined : 'Waiting for live connection…'} className={runClassName} />`. Mobile: `<IconButton {...runProps} size="sm" icon={...} className={cn('min-h-11 min-w-11', runClassName)} />`. Drawer: `<Button {...runProps} width="100%" icon={...} className={cn('mt-3 min-h-11', runClassName)} />`. (The `icon` stays per-site: sizes differ.)

- [ ] **Step 4: `DrawerSection` wrapper**

Add above `Topbar`:

```tsx
function DrawerSection({ id, title, delay, children }: { id: string; title: string; delay: number; children: ReactNode }) {
  return (
    <section aria-labelledby={id} className="drawer-section" style={{ animationDelay: `${delay}ms` }}>
      <h3 id={id} className="mb-2 text-[10px] font-medium uppercase tracking-[0.18em] text-muted-foreground">
        {title}
      </h3>
      {children}
    </section>
  );
}
```

Replace the four drawer `<section aria-labelledby=... ><h3 .../>` blocks (`m-account`/Account/0, `m-live`/Live status/40, `m-theme`/Theme/80, `m-nav`/Navigation/120) with `<DrawerSection id="m-account" title="Account" delay={0}>...</DrawerSection>` etc. The trailing logout `<div className="drawer-section mt-auto pt-2">` has no heading — leave it as is. Import `ReactNode` from react.

- [ ] **Step 5: Inline the a11y-ids hook**

In `LogoutConfirmDialog` (topbar.tsx) and `components/users/delete-user-dialog.tsx`, replace `const { labelId: titleId, descriptionId } = useDialogA11yIds();` with:

```tsx
const titleId = useId();
const descriptionId = useId();
```

(add `useId` to the react import), delete the `useDialogA11yIds` imports and `components/use-dialog-a11y-ids.ts`.

- [ ] **Step 6: Route groups replace SessionShell**

Create `app/(chrome)/layout.tsx`:

```tsx
import type { ReactNode } from 'react';

import { Footer } from '@/components/footer';
import { Topbar } from '@/components/topbar';

export default function ChromeLayout({ children }: { children: ReactNode }) {
  return (
    <>
      <Topbar />
      {children}
      <Footer />
    </>
  );
}
```

`git mv app/page.tsx app/(chrome)/page.tsx`, same for `settings/page.tsx` and `changelog/page.tsx` (bring along any colocated files in those dirs). In `app/layout.tsx`, replace `<SessionShell>{children}</SessionShell>` with `{children}` and drop the import. Delete `components/auth/session-shell.tsx`. Login/setup pages stay at `app/login`/`app/setup` — outside the group, they render without chrome, same as before.

- [ ] **Step 7: Verify**

Run: `bun test && bun run tsc && bun run biome:check && bun run build` — green (build validates the route-group move). Smoke in dev: `/` and `/settings` show Topbar+Footer; `/login` shows neither; theme switcher works on desktop and in the mobile drawer; Run now still triggers a measurement.

- [ ] **Step 8: Commit**

```bash
git add -A && git commit -m "refactor: slim topbar and replace SessionShell with a route group"
```

---

### Task 9: Shared submit state for the users dialogs

**Files:**
- Create: `components/users/use-dialog-request.ts`
- Modify: `components/users/add-user-dialog.tsx`, `components/users/reset-password-dialog.tsx`, `components/users/delete-user-dialog.tsx`, `components/users/users-card.tsx`

**Interfaces:**
- Produces: `useDialogRequest(): { pending, error, fieldErrors, setError, reset, run }` where `run(url: string, init?: RequestInit): Promise<boolean>` — true on success; on failure it has already set `error`/`fieldErrors` and cleared `pending`. On success `pending` stays true (the dialog closes right after).

- [ ] **Step 1: Write the hook**

```ts
'use client';

import { useState } from 'react';

import { parseApiError } from '@/lib/api-client';

// Shared submit state for the users dialogs. Errors land in the in-dialog
// Banner (not a toast): ToastViewport enters the top layer at mount, then
// dialog.showModal() stacks above it, so toasts render beneath open dialogs.
export function useDialogRequest() {
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string[]>>({});

  function reset() {
    setPending(false);
    setError(null);
    setFieldErrors({});
  }

  async function run(url: string, init?: RequestInit): Promise<boolean> {
    setError(null);
    setFieldErrors({});
    setPending(true);
    let res: Response;
    try {
      res = await fetch(url, init);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Network error.');
      setPending(false);
      return false;
    }
    if (!res.ok && res.status !== 204) {
      const apiErr = await parseApiError(res);
      if (apiErr.code === 'validation_failed' && apiErr.fields) {
        setFieldErrors(apiErr.fields);
      }
      setError(apiErr.message);
      setPending(false);
      return false;
    }
    return true;
  }

  return { pending, error, fieldErrors, setError, reset, run };
}
```

- [ ] **Step 2: Rewire the three dialogs**

Each dialog keeps its local field state (email/password/role/confirm) and its `handleOpenChange` (which now calls the hook's `reset()` plus clears its own fields). Client-side pre-checks (password length, confirm match) keep using `setError`. Submit becomes, e.g. add-user:

```tsx
async function onSubmit(e: React.FormEvent) {
  e.preventDefault();
  if (password.length < MIN_PASSWORD_LEN) {
    setError(`Password must be at least ${MIN_PASSWORD_LEN} characters.`);
    return;
  }
  const ok = await run('/api/users', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: email.trim(), password, role }),
  });
  if (!ok) {
    return;
  }
  toast({ body: 'User created' });
  await onCreated();
  handleOpenChange(false);
}
```

reset-password: `run('/api/users/${user.id}/reset-password', ...)` with its two pre-checks; delete-user: `run('/api/users/${user.id}', { method: 'DELETE' })` with no field state. Field-error rendering (`fieldErrors.email` etc.) and Banner/footer markup stay as-is.

- [ ] **Step 3: Pass `refresh` directly in `users-card.tsx`**

Delete the `onAdded`/`onDeleted` `useCallback`s (lines 132-138) and pass `onCreated={refresh}` / `onDeleted={refresh}` at the call sites.

- [ ] **Step 4: Verify**

Run: `bun test && bun run tsc && bun run biome:check` — green. Smoke in dev (`/settings`): create a user with a bad email (field error shows in dialog), then a valid one (toast + list refresh), reset a password, delete the user.

- [ ] **Step 5: Commit**

```bash
git add -A && git commit -m "refactor: share users dialog submit state via useDialogRequest"
```

---

### Task 10: Small shrinks (parseTableQuery, toSearchParams, z.email, .nums-tab)

**Files:**
- Modify: `lib/measurements-query.ts`, `components/use-table-measurements.ts`, `lib/auth/schema.ts`, `app/globals.css`

**Interfaces:** `parseTableQuery(params: URLSearchParams): TableQuery` unchanged; `lib/measurements-query.test.ts` must pass **without modification** — it is the behavior spec (notably: invalid numbers are silently dropped, invalid enums throw).

- [ ] **Step 1: Rewrite the filter readers in `lib/measurements-query.ts`**

Keep the type exports and the page/pageSize/sort/sortDir parsing as-is. Replace `readNumber`/`readNumericRange`/`readTimeRange`/`readStatuses`/`readServer` and the filters block with:

```ts
function readNumber(params: URLSearchParams, key: string): number | undefined {
  const raw = params.get(key);
  if (raw == null || raw === '') {
    return undefined;
  }
  const n = Number(raw);
  return Number.isFinite(n) ? n : undefined;
}

function range<K extends 'min' | 'max' | 'from' | 'to'>(
  loKey: K,
  lo: number | undefined,
  hiKey: K,
  hi: number | undefined,
): Partial<Record<K, number>> | undefined {
  if (lo === undefined && hi === undefined) {
    return undefined;
  }
  return { ...(lo !== undefined ? { [loKey]: lo } : {}), ...(hi !== undefined ? { [hiKey]: hi } : {}) } as Partial<
    Record<K, number>
  >;
}

export function parseTableQuery(params: URLSearchParams): TableQuery {
  // ... page/pageSize/sort/sortDir unchanged ...

  const filters: TableFilters = {};
  filters.time = range('from', readNumber(params, 'timeFrom'), 'to', readNumber(params, 'timeTo'));
  filters.download = range('min', readNumber(params, 'downloadMin'), 'max', readNumber(params, 'downloadMax'));
  filters.upload = range('min', readNumber(params, 'uploadMin'), 'max', readNumber(params, 'uploadMax'));
  filters.latency = range('min', readNumber(params, 'latencyMin'), 'max', readNumber(params, 'latencyMax'));
  const server = params.get('server')?.trim();
  if (server) {
    filters.server = server;
  }
  const statusRaw = params.get('status');
  const parts = statusRaw
    ? statusRaw
        .split(',')
        .map((s) => s.trim())
        .filter(Boolean)
    : [];
  if (parts.length > 0) {
    filters.status = [...new Set(z.array(z.enum(STATUSES)).parse(parts))];
  }
  for (const k of ['time', 'download', 'upload', 'latency'] as const) {
    if (filters[k] === undefined) {
      delete filters[k];
    }
  }
  return { page, pageSize, sort, sortDir, filters };
}
```

CAUTION: the tests likely assert absent keys (e.g. `filters` deep-equals `{}` when no filter params) — hence the `delete` sweep for `undefined` entries. If a test fails on key presence, adjust the implementation, never the test.

- [ ] **Step 2: Loop in `toSearchParams` (`components/use-table-measurements.ts`)**

```ts
function toSearchParams(q: TableQuery): URLSearchParams {
  const f = q.filters;
  const entries: [string, string | number | undefined][] = [
    ['page', q.page],
    ['pageSize', q.pageSize],
    ['sort', q.sort],
    ['sortDir', q.sortDir],
    ['timeFrom', f.time?.from],
    ['timeTo', f.time?.to],
    ['downloadMin', f.download?.min],
    ['downloadMax', f.download?.max],
    ['uploadMin', f.upload?.min],
    ['uploadMax', f.upload?.max],
    ['latencyMin', f.latency?.min],
    ['latencyMax', f.latency?.max],
    ['server', f.server || undefined],
    ['status', f.status?.length ? f.status.join(',') : undefined],
  ];
  const p = new URLSearchParams();
  for (const [k, v] of entries) {
    if (v !== undefined) {
      p.set(k, String(v));
    }
  }
  return p;
}
```

- [ ] **Step 3: `z.email()` in `lib/auth/schema.ts`**

Replace the hand-rolled email regex on line 3 with zod 4's built-in `z.email()` (keep any `.trim()`/`.toLowerCase()`/max-length chained on it). Run `bun test lib/auth` — the schema tests define accepted/rejected inputs; if one rejects an address `z.email()` accepts (or vice versa), keep the test's verdict by chaining `.refine`, don't loosen the test.

- [ ] **Step 4: Drop `.nums-tab` from `app/globals.css`**

Line ~175: `table, th, td, .nums-tab {` → `table, th, td {` (grep confirmed zero `nums-tab` usage in app/components/lib).

- [ ] **Step 5: Verify + commit**

Run: `bun test && bun run tsc && bun run biome:check` — green.

```bash
git add -A && git commit -m "refactor: shrink table query parsing, email schema and dead css"
```

---

## Final check

- [ ] `bun test && bun run lint && bun run build` all green.
- [ ] `rtk grep -rn "node-cron\|\"mjml\"\|@types/mjml" package.json` → no hits.
- [ ] Dev smoke: dashboard live run, changelog rendering, settings save (interval reschedules), users CRUD, login/setup pages chrome-less.
- [ ] `git log --oneline -12` shows the 10 single-line commits on main.
