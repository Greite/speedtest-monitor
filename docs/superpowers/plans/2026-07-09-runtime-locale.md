# Runtime-Configurable Locale and Timezone Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make dashboard date/time formatting configurable at runtime via `SPEEDTEST_LOCALE` and `SPEEDTEST_TIMEZONE` env vars (defaults `en-US` / `UTC`), replacing the build-time-inlined `NEXT_PUBLIC_LOCALE` / `NEXT_PUBLIC_TIMEZONE`.

**Architecture:** A new `lib/runtime-config.ts` resolves and validates locale/timezone: on the server from `process.env` at request time, on the client from `window.__SPEEDTEST_CONFIG__` injected by the root layout via an inline script before hydration. `lib/format.ts` creates its `Intl` formatters lazily from that config; its public API is unchanged so no component changes. Alert timestamps reuse the configured timezone.

**Tech Stack:** Next.js 16 (App Router, `connection()` from `next/server`), Bun runtime, `bun:test`, Biome.

**Spec:** `docs/superpowers/specs/2026-07-09-runtime-locale-design.md`

## Global Constraints

- Env var names exactly `SPEEDTEST_LOCALE` (default `en-US`) and `SPEEDTEST_TIMEZONE` (default `UTC`).
- Invalid values fall back to defaults with a `console.warn`; never crash.
- `NEXT_PUBLIC_LOCALE` / `NEXT_PUBLIC_TIMEZONE` must not remain anywhere in the repo.
- Public signatures of `formatDateTime`, `formatTime`, `formatShortDate`, `formatRelativeTime` unchanged; `components/*.tsx` untouched.
- Prefix every shell command with `rtk` (e.g. `rtk bun test`).
- Commits: directly on `main`, single-line message, no body, no trailers.
- Code and comments in English; match existing style (Biome-formatted, 2-space indent, single quotes).
- Tests run with `rtk bun test` (bun:test). Dev server: `bun server.ts`, port `3003`.

---

### Task 1: `lib/runtime-config.ts` — validated runtime display config

**Files:**
- Create: `lib/runtime-config.ts`
- Test: `lib/runtime-config.test.ts`

**Interfaces:**
- Consumes: nothing (leaf module).
- Produces: `resolveDisplayConfig(): DisplayConfig` where `type DisplayConfig = { locale: string; timeZone: string }`; constants `DEFAULT_LOCALE = 'en-US'`, `DEFAULT_TIMEZONE = 'UTC'`; global type `window.__SPEEDTEST_CONFIG__?: DisplayConfig`. Tasks 2, 3, 4 import these.

- [ ] **Step 1: Write the failing test**

Create `lib/runtime-config.test.ts`:

```ts
import { afterEach, describe, expect, it } from 'bun:test';

import { DEFAULT_LOCALE, DEFAULT_TIMEZONE, resolveDisplayConfig } from './runtime-config';

const ORIGINAL_LOCALE = process.env.SPEEDTEST_LOCALE;
const ORIGINAL_TIMEZONE = process.env.SPEEDTEST_TIMEZONE;

function restoreEnv(): void {
  if (ORIGINAL_LOCALE === undefined) {
    delete process.env.SPEEDTEST_LOCALE;
  } else {
    process.env.SPEEDTEST_LOCALE = ORIGINAL_LOCALE;
  }
  if (ORIGINAL_TIMEZONE === undefined) {
    delete process.env.SPEEDTEST_TIMEZONE;
  } else {
    process.env.SPEEDTEST_TIMEZONE = ORIGINAL_TIMEZONE;
  }
}

describe('resolveDisplayConfig', () => {
  afterEach(restoreEnv);

  it('defaults to en-US / UTC when env vars are unset', () => {
    delete process.env.SPEEDTEST_LOCALE;
    delete process.env.SPEEDTEST_TIMEZONE;
    expect(resolveDisplayConfig()).toEqual({ locale: DEFAULT_LOCALE, timeZone: DEFAULT_TIMEZONE });
  });

  it('uses configured values when valid', () => {
    process.env.SPEEDTEST_LOCALE = 'fr-FR';
    process.env.SPEEDTEST_TIMEZONE = 'Europe/Paris';
    expect(resolveDisplayConfig()).toEqual({ locale: 'fr-FR', timeZone: 'Europe/Paris' });
  });

  it('falls back to defaults on invalid values', () => {
    process.env.SPEEDTEST_LOCALE = 'not a locale!';
    process.env.SPEEDTEST_TIMEZONE = 'Mars/Olympus';
    expect(resolveDisplayConfig()).toEqual({ locale: DEFAULT_LOCALE, timeZone: DEFAULT_TIMEZONE });
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `rtk bun test lib/runtime-config.test.ts`
Expected: FAIL, cannot resolve module `./runtime-config`.

- [ ] **Step 3: Write the implementation**

Create `lib/runtime-config.ts`:

```ts
export type DisplayConfig = { locale: string; timeZone: string };

export const DEFAULT_LOCALE = 'en-US';
export const DEFAULT_TIMEZONE = 'UTC';

declare global {
  interface Window {
    __SPEEDTEST_CONFIG__?: DisplayConfig;
  }
}

function validLocale(value: string | undefined): string {
  if (!value) {
    return DEFAULT_LOCALE;
  }
  try {
    void Intl.DateTimeFormat.supportedLocalesOf(value);
    return value;
  } catch {
    console.warn(`[config] invalid SPEEDTEST_LOCALE "${value}", falling back to ${DEFAULT_LOCALE}`);
    return DEFAULT_LOCALE;
  }
}

function validTimeZone(value: string | undefined): string {
  if (!value) {
    return DEFAULT_TIMEZONE;
  }
  try {
    void new Intl.DateTimeFormat(DEFAULT_LOCALE, { timeZone: value });
    return value;
  } catch {
    console.warn(`[config] invalid SPEEDTEST_TIMEZONE "${value}", falling back to ${DEFAULT_TIMEZONE}`);
    return DEFAULT_TIMEZONE;
  }
}

// Server: read env at request time (no NEXT_PUBLIC_ prefix, so Next.js never
// inlines the values at build time - the published Docker image is built
// without them). Client: read the config the root layout injects before
// hydration, so SSR and client always format with identical values.
export function resolveDisplayConfig(): DisplayConfig {
  if (typeof window !== 'undefined' && window.__SPEEDTEST_CONFIG__) {
    return window.__SPEEDTEST_CONFIG__;
  }
  return {
    locale: validLocale(process.env.SPEEDTEST_LOCALE),
    timeZone: validTimeZone(process.env.SPEEDTEST_TIMEZONE),
  };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `rtk bun test lib/runtime-config.test.ts`
Expected: PASS (3 tests). Two `console.warn` lines from the invalid-values test are expected output, not failures.

- [ ] **Step 5: Commit**

```bash
rtk git add lib/runtime-config.ts lib/runtime-config.test.ts
rtk git commit -m "feat(config): runtime display config with locale/timezone validation"
```

---

### Task 2: `lib/format.ts` — lazy locale-aware formatters

**Files:**
- Modify: `lib/format.ts` (replace lines 25-49 constants/formatters and line 78 `RELATIVE_FMT`; function bodies of `formatDateTime`, `formatTime`, `formatShortDate`, `formatRelativeTime`)
- Test: `lib/format.test.ts`

**Interfaces:**
- Consumes: `resolveDisplayConfig()` from `lib/runtime-config.ts` (Task 1).
- Produces: unchanged public API (`formatMbps`, `formatMs`, `formatDateTime`, `formatTime`, `formatShortDate`, `formatRelativeTime`, `latencyLevel`, `computeDelta`, types) plus new test-only export `resetFormatCache(): void`. Task 3's manual verification and existing components rely on the unchanged API.

- [ ] **Step 1: Write the failing tests**

In `lib/format.test.ts`, replace the import block at the top:

```ts
import { afterEach, describe, expect, it } from 'bun:test';

import {
  formatMbps,
  formatMs,
  formatRelativeTime,
  formatTime,
  latencyLevel,
  resetFormatCache,
} from './format';
```

Append at the end of the file:

```ts
describe('locale and timezone configuration', () => {
  const ORIGINAL_LOCALE = process.env.SPEEDTEST_LOCALE;
  const ORIGINAL_TIMEZONE = process.env.SPEEDTEST_TIMEZONE;

  afterEach(() => {
    if (ORIGINAL_LOCALE === undefined) {
      delete process.env.SPEEDTEST_LOCALE;
    } else {
      process.env.SPEEDTEST_LOCALE = ORIGINAL_LOCALE;
    }
    if (ORIGINAL_TIMEZONE === undefined) {
      delete process.env.SPEEDTEST_TIMEZONE;
    } else {
      process.env.SPEEDTEST_TIMEZONE = ORIGINAL_TIMEZONE;
    }
    resetFormatCache();
  });

  const NOW = new Date('2024-06-15T14:30:00Z').getTime();

  it('formats relative time in English by default', () => {
    delete process.env.SPEEDTEST_LOCALE;
    resetFormatCache();
    expect(formatRelativeTime(NOW - 5 * 60_000, NOW)).toBe('5 minutes ago');
  });

  it('formats relative time in French when SPEEDTEST_LOCALE=fr-FR', () => {
    process.env.SPEEDTEST_LOCALE = 'fr-FR';
    resetFormatCache();
    expect(formatRelativeTime(NOW - 5 * 60_000, NOW)).toBe('il y a 5 minutes');
  });

  it('falls back to en-US on invalid locale', () => {
    process.env.SPEEDTEST_LOCALE = 'not a locale!';
    resetFormatCache();
    expect(formatRelativeTime(NOW - 5 * 60_000, NOW)).toBe('5 minutes ago');
  });

  it('renders times in the configured timezone', () => {
    delete process.env.SPEEDTEST_LOCALE;
    process.env.SPEEDTEST_TIMEZONE = 'America/New_York';
    resetFormatCache();
    expect(formatTime(NOW)).toBe('10:30 AM');
  });

  it('falls back to UTC on invalid timezone', () => {
    delete process.env.SPEEDTEST_LOCALE;
    process.env.SPEEDTEST_TIMEZONE = 'Mars/Olympus';
    resetFormatCache();
    expect(formatTime(NOW)).toBe('02:30 PM');
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `rtk bun test lib/format.test.ts`
Expected: FAIL, `resetFormatCache` is not exported (and/or French/English assertions fail because the current code pins `fr-FR`).

- [ ] **Step 3: Implement the lazy formatters**

In `lib/format.ts`, add the import at the top of the file:

```ts
import { resolveDisplayConfig } from './runtime-config';
```

Replace this entire block (currently lines 25-49, the comment plus `LOCALE`, `TIMEZONE`, `DATE_TIME_FMT`, `TIME_FMT`, `SHORT_DATE_FMT` constants):

```ts
// Formatters are created lazily so locale/timezone are resolved at runtime:
// on the server from SPEEDTEST_LOCALE / SPEEDTEST_TIMEZONE, on the client
// from the config the root layout injects before hydration. Both sides see
// the same values, so SSR and client hydrate identically.
type Formatters = {
  dateTime: Intl.DateTimeFormat;
  time: Intl.DateTimeFormat;
  shortDate: Intl.DateTimeFormat;
  relative: Intl.RelativeTimeFormat;
};

let cached: Formatters | null = null;

function formatters(): Formatters {
  if (cached === null) {
    const { locale, timeZone } = resolveDisplayConfig();
    cached = {
      dateTime: new Intl.DateTimeFormat(locale, { dateStyle: 'short', timeStyle: 'medium', timeZone }),
      time: new Intl.DateTimeFormat(locale, { hour: '2-digit', minute: '2-digit', timeZone }),
      shortDate: new Intl.DateTimeFormat(locale, { day: '2-digit', month: '2-digit', timeZone }),
      relative: new Intl.RelativeTimeFormat(locale, { numeric: 'auto' }),
    };
  }
  return cached;
}

// Test-only: drop cached formatters so env changes take effect.
export function resetFormatCache(): void {
  cached = null;
}
```

Update the three date functions to use the lazy formatters:

```ts
export function formatDateTime(timestamp: number | string | Date): string {
  return formatters().dateTime.format(asDate(timestamp));
}

export function formatTime(timestamp: number | string | Date): string {
  return formatters().time.format(asDate(timestamp));
}

export function formatShortDate(timestamp: number | string | Date): string {
  return formatters().shortDate.format(asDate(timestamp));
}
```

Delete the `const RELATIVE_FMT = new Intl.RelativeTimeFormat(LOCALE, { numeric: 'auto' });` line and update `formatRelativeTime` to call `formatters().relative` in all four branches:

```ts
export function formatRelativeTime(timestamp: number | string | Date, now: number = Date.now()): string {
  const then = asDate(timestamp).getTime();
  const diffSec = Math.round((then - now) / 1000);
  const abs = Math.abs(diffSec);
  if (abs < 45) {
    return formatters().relative.format(diffSec, 'second');
  }
  if (abs < 45 * 60) {
    return formatters().relative.format(Math.round(diffSec / 60), 'minute');
  }
  if (abs < 22 * 3600) {
    return formatters().relative.format(Math.round(diffSec / 3600), 'hour');
  }
  return formatters().relative.format(Math.round(diffSec / 86_400), 'day');
}
```

Everything else in the file (`formatMbps`, `formatMs`, `asDate`, `latencyLevel`, `computeDelta`, types) stays as is.

- [ ] **Step 4: Run tests to verify they pass**

Run: `rtk bun test lib/format.test.ts`
Expected: PASS (all describe blocks, including the pre-existing ones).

- [ ] **Step 5: Verify no NEXT_PUBLIC_ references remain**

Run: `rtk grep -rn "NEXT_PUBLIC_LOCALE\|NEXT_PUBLIC_TIMEZONE" . --include="*.ts" --include="*.tsx" --include="*.md" --include="Dockerfile" --include="*.yml"`
Expected: no matches outside `docs/superpowers/` (spec/plan may mention the old names historically).

- [ ] **Step 6: Run the full test suite**

Run: `rtk bun test`
Expected: PASS, no regressions.

- [ ] **Step 7: Commit**

```bash
rtk git add lib/format.ts lib/format.test.ts
rtk git commit -m "refactor(format): lazy locale-aware formatters from runtime config"
```

---

### Task 3: `app/layout.tsx` — inject config before hydration, force dynamic rendering

**Files:**
- Modify: `app/layout.tsx`

**Interfaces:**
- Consumes: `resolveDisplayConfig()` from `lib/runtime-config.ts` (Task 1); the `window.__SPEEDTEST_CONFIG__` global type it declares.
- Produces: `window.__SPEEDTEST_CONFIG__` set in every rendered document before hydration scripts run; `<html lang>` reflecting the configured locale's language.

- [ ] **Step 1: Modify the layout**

Replace `app/layout.tsx` lines 30-46 (the `RootLayout` function) with:

```tsx
export default async function RootLayout({ children }: { children: ReactNode }) {
  // Force dynamic rendering so the config reflects runtime env vars, never
  // values captured during `next build` (the Docker image is built without
  // SPEEDTEST_LOCALE / SPEEDTEST_TIMEZONE).
  await connection();
  const displayConfig = resolveDisplayConfig();
  const configScript = `window.__SPEEDTEST_CONFIG__=${JSON.stringify(displayConfig).replace(/</g, '\\u003c')}`;

  return (
    <html
      lang={new Intl.Locale(displayConfig.locale).language}
      dir="ltr"
      suppressHydrationWarning
      className={`${sans.variable} ${mono.variable}`}
    >
      <body className="font-sans antialiased">
        {/* Must run before hydration so client formatters resolve the same
            locale/timezone the server rendered with. */}
        {/* biome-ignore lint/security/noDangerouslySetInnerHtml: operator-controlled env values, JSON-encoded with < escaped */}
        <script dangerouslySetInnerHTML={{ __html: configScript }} />
        <a href="#main" className="skip-link">
          Skip to main content
        </a>
        <div aria-hidden className="pointer-events-none fixed inset-0 -z-10 app-backdrop" />
        <ThemeProvider attribute="class" defaultTheme="system" enableSystem>
          <FocusMainOnNavigate />
          <SessionShell>{children}</SessionShell>
          <Toaster position="top-right" richColors closeButton />
        </ThemeProvider>
      </body>
    </html>
  );
}
```

Add the two imports at the top of the file (keep existing imports):

```tsx
import { connection } from 'next/server';

import { resolveDisplayConfig } from '@/lib/runtime-config';
```

Note: the `biome-ignore` comment is only needed if `rtk bun run lint` flags `noDangerouslySetInnerHtml`; if lint passes without it, omit it.

- [ ] **Step 2: Typecheck and lint**

Run: `rtk bun run lint`
Expected: PASS (tsc + biome clean).

- [ ] **Step 3: Verify the production build stays green**

Run: `rtk bun run build`
Expected: build completes; routes are reported as dynamic (`ƒ`), which is correct - no page may bake the config at build time.

- [ ] **Step 4: Verify runtime injection end-to-end**

Start the dev server in the background with French config, give Next time to compile, then inspect the HTML:

```bash
SPEEDTEST_LOCALE=fr-FR SPEEDTEST_TIMEZONE=Europe/Paris bun server.ts   # run in background
curl -s http://localhost:3003/login | grep -o 'window.__SPEEDTEST_CONFIG__={[^}]*}'
curl -s http://localhost:3003/login | grep -o '<html lang="[a-z-]*"'
```

Expected output:

```
window.__SPEEDTEST_CONFIG__={"locale":"fr-FR","timeZone":"Europe/Paris"}
<html lang="fr"
```

The first request may take 10-20 s while Next compiles the page. Stop the background server afterwards.

- [ ] **Step 5: Commit**

```bash
rtk git add app/layout.tsx
rtk git commit -m "feat(layout): inject runtime locale/timezone config before hydration"
```

---

### Task 4: Alerts render timestamps in the configured timezone

**Files:**
- Modify: `lib/alerts/format.ts:5-8` (`formatTime`)
- Modify: `lib/alerts/templates/render.ts:66-68` (`formatTimestamp`)
- Test: `lib/alerts/format.test.ts`

**Interfaces:**
- Consumes: `resolveDisplayConfig()` from `lib/runtime-config.ts` (Task 1).
- Produces: no signature changes; alert bodies/emails keep the ISO-like `sv-SE` format but in `SPEEDTEST_TIMEZONE` instead of the container's default timezone.

- [ ] **Step 1: Write the failing test**

In `lib/alerts/format.test.ts`, update the import line and add an env-restoring describe block at the end:

```ts
import { afterEach, describe, expect, it } from 'bun:test';
```

```ts
describe('formatMessage timezone', () => {
  const ORIGINAL_TIMEZONE = process.env.SPEEDTEST_TIMEZONE;

  afterEach(() => {
    if (ORIGINAL_TIMEZONE === undefined) {
      delete process.env.SPEEDTEST_TIMEZONE;
    } else {
      process.env.SPEEDTEST_TIMEZONE = ORIGINAL_TIMEZONE;
    }
  });

  it('renders the timestamp in the configured timezone', () => {
    process.env.SPEEDTEST_TIMEZONE = 'Europe/Paris';
    const { body } = formatMessage({
      transition: { kind: 'download_below', event: 'fired', observed: 50, threshold: 100 },
      timestamp: Date.UTC(2026, 0, 15, 12, 0, 0),
    });
    // Paris is UTC+1 in January.
    expect(body).toContain('2026-01-15 13:00:00');
  });

  it('renders the timestamp in UTC by default', () => {
    delete process.env.SPEEDTEST_TIMEZONE;
    const { body } = formatMessage({
      transition: { kind: 'download_below', event: 'fired', observed: 50, threshold: 100 },
      timestamp: Date.UTC(2026, 0, 15, 12, 0, 0),
    });
    expect(body).toContain('2026-01-15 12:00:00');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `rtk bun test lib/alerts/format.test.ts`
Expected: FAIL - current code formats in the machine's local timezone (e.g. `13:00:00` appears for Paris machines even without the env var, or the UTC case shows the local offset). At least one of the two new tests must fail on any machine whose local timezone is not the one under test.

- [ ] **Step 3: Implement**

In `lib/alerts/format.ts`, add the import and change `formatTime`:

```ts
import { resolveDisplayConfig } from '../runtime-config';
```

```ts
function formatTime(ms: number): string {
  const d = new Date(ms);
  return d.toLocaleString('sv-SE', { timeZone: resolveDisplayConfig().timeZone }).replace('T', ' ');
}
```

In `lib/alerts/templates/render.ts`, add the import and change `formatTimestamp`:

```ts
import { resolveDisplayConfig } from '../../runtime-config';
```

```ts
function formatTimestamp(ms: number): string {
  return new Date(ms).toLocaleString('sv-SE', { timeZone: resolveDisplayConfig().timeZone }).replace('T', ' ');
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `rtk bun test lib/alerts`
Expected: PASS (all alert test files, including the pre-existing ones - they assert titles and metric strings, not timestamps).

- [ ] **Step 5: Run the full test suite**

Run: `rtk bun test`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
rtk git add lib/alerts/format.ts lib/alerts/format.test.ts lib/alerts/templates/render.ts
rtk git commit -m "fix(alerts): render timestamps in configured timezone"
```

---

### Task 5: Documentation and Docker defaults

**Files:**
- Modify: `README.md:30-37` (env table)
- Modify: `docker-compose.yml:7-10` (environment block)
- Modify: `Dockerfile:35-41` (runner ENV block)

**Interfaces:**
- Consumes: the env var names/defaults implemented in Tasks 1-4.
- Produces: user-facing documentation; no code.

- [ ] **Step 1: Update the README env table**

In `README.md`, insert two rows after the `SPEEDTEST_PARALLEL_STREAMS` row and replace the `TZ` row:

```markdown
| `SPEEDTEST_LOCALE` | `en-US` | BCP 47 locale for dates/times in the dashboard and alert emails (e.g. `fr-FR`, `de-DE`) |
| `SPEEDTEST_TIMEZONE` | `UTC` | IANA timezone for dates/times in the dashboard and alert emails (e.g. `Europe/Paris`) |
```

```markdown
| `TZ` | - | Container system timezone (log lines only; display uses `SPEEDTEST_TIMEZONE`) |
```

- [ ] **Step 2: Update docker-compose.yml**

Replace the `environment:` block with:

```yaml
    environment:
      SPEEDTEST_INTERVAL_MINUTES: "15"
      # SPEEDTEST_LOCALE: "en-US"
      # SPEEDTEST_TIMEZONE: "Europe/Paris"
      TZ: "Europe/Paris"
      AUTH_SECRET: ${AUTH_SECRET:-}
```

- [ ] **Step 3: Update the Dockerfile runner ENV block**

Replace the runner-stage `ENV` block with:

```dockerfile
ENV NODE_ENV=production \
    NEXT_TELEMETRY_DISABLED=1 \
    HOSTNAME=0.0.0.0 \
    PORT=3000 \
    SPEEDTEST_DB_PATH=/data/speedtest.db \
    SPEEDTEST_INTERVAL_MINUTES=15 \
    SPEEDTEST_LOCALE=en-US \
    SPEEDTEST_TIMEZONE=UTC \
    AUTH_TRUST_HOST=true
```

- [ ] **Step 4: Lint and full test suite**

Run: `rtk bun run lint && rtk bun test`
Expected: both PASS.

- [ ] **Step 5: Commit**

```bash
rtk git add README.md docker-compose.yml Dockerfile
rtk git commit -m "docs: document SPEEDTEST_LOCALE and SPEEDTEST_TIMEZONE"
```

---

## Post-implementation notes (not tasks)

- **Release notes for the next tag:** flag the display default change from `fr-FR` / `Europe/Paris` to `en-US` / `UTC`; existing instances that want French dates set `SPEEDTEST_LOCALE=fr-FR` and `SPEEDTEST_TIMEZONE=Europe/Paris`.
- **GitHub issue reply:** once released, answer that dates/times (the only non-English part - UI copy was already English) now default to `en-US` and are configurable via `SPEEDTEST_LOCALE` / `SPEEDTEST_TIMEZONE`.
