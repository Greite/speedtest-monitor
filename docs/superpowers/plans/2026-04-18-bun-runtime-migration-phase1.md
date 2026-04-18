# Bun Runtime Migration Phase 1 - Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Unify dev + prod runtime on Bun. Swap `better-sqlite3` -> `bun:sqlite`, vitest -> `bun:test`, and `oven/bun:1-slim` on every Dockerfile stage.

**Architecture:** The DB driver swap and the test runner swap are orthogonal. Both are driven from `lib/db/client.ts` + `lib/db/migrate.ts` for the app side, and from 30 test fixtures for the test side. We batch test migration in seven incremental commits so the suite stays green between batches.

**Tech Stack:** Bun 1.x, `bun:sqlite`, `drizzle-orm/bun-sqlite`, `bun:test`, Next.js 16 (unchanged).

**Spec:** `docs/superpowers/specs/2026-04-18-bun-runtime-migration-phase1.md`

---

## Task 1: Swap DB driver to `bun:sqlite`

**Files:**
- Modify: `lib/db/client.ts`
- Modify: `lib/db/migrate.ts`
- Modify: `drizzle.config.ts` (if it references `better-sqlite3`)
- Modify: `package.json` (remove `better-sqlite3`, `@types/better-sqlite3`; add `@types/bun`)

- [ ] **Step 1: Add Bun types + remove better-sqlite3**

```bash
bun add -d @types/bun
bun remove better-sqlite3 @types/better-sqlite3
```

- [ ] **Step 2: Rewrite `lib/db/client.ts`**

Replace the whole file with:

```ts
import { mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import { Database } from 'bun:sqlite';
import { drizzle } from 'drizzle-orm/bun-sqlite';
import * as schema from './schema';

declare global {
  // eslint-disable-next-line no-var
  var __fastcomDb: { sqlite: Database; db: ReturnType<typeof drizzle> } | undefined;
}

function getDbPath(): string {
  return process.env.FASTCOM_DB_PATH ?? './fastcom.db';
}

function openDatabase() {
  const path = getDbPath();
  mkdirSync(dirname(path), { recursive: true });
  const sqlite = new Database(path, { create: true });
  sqlite.exec('PRAGMA journal_mode = WAL');
  sqlite.exec('PRAGMA foreign_keys = ON');
  sqlite.exec('PRAGMA synchronous = NORMAL');
  const db = drizzle(sqlite, { schema });
  return { sqlite, db };
}

export function getDb() {
  if (!globalThis.__fastcomDb) {
    globalThis.__fastcomDb = openDatabase();
  }
  return globalThis.__fastcomDb.db;
}

export function closeDb() {
  if (globalThis.__fastcomDb) {
    globalThis.__fastcomDb.sqlite.close();
    globalThis.__fastcomDb = undefined;
  }
}

export { schema };
```

- [ ] **Step 3: Rewrite `lib/db/migrate.ts`**

Open the file. Change the migrator import from:
```ts
import { migrate } from 'drizzle-orm/better-sqlite3/migrator';
```
to:
```ts
import { migrate } from 'drizzle-orm/bun-sqlite/migrator';
```
Every other line stays.

- [ ] **Step 4: Update `drizzle.config.ts` if needed**

Run: `cat drizzle.config.ts`
If the config sets `driver: 'better-sqlite'`, change to `driver: 'bun-sqlite'`. If it only sets `dialect: 'sqlite'`, leave unchanged (dialect drives SQL generation, not the runtime driver).

- [ ] **Step 5: Typecheck**

Run: `bunx tsc --noEmit`
Expected: clean.

- [ ] **Step 6: Smoke-run dev**

Run: `bun run dev &` in one terminal; `sleep 6; curl -sS http://localhost:3003/api/measurements?range=24h; kill %1`.
Expected: server boots without errors, GET returns valid JSON (`{"range":"24h","measurements":[...]}`), no `bun:sqlite` stack trace.

- [ ] **Step 7: Commit**

```bash
git add lib/db/client.ts lib/db/migrate.ts drizzle.config.ts package.json bun.lock
git commit -m "feat(db): swap better-sqlite3 for bun:sqlite + drizzle bun-sqlite adapter"
```

---

## Task 2: Remove `bun test` block (bunfig.toml + script)

**Files:**
- Delete: `bunfig.toml`
- Delete: `scripts/block-bun-test.ts`

- [ ] **Step 1: Delete both files**

```bash
rm bunfig.toml scripts/block-bun-test.ts
# if scripts/ is now empty, remove it too
rmdir scripts 2>/dev/null || true
```

- [ ] **Step 2: Commit**

```bash
git add -A
git commit -m "chore(test): remove bun test block (bun:sqlite works with native runner)"
```

---

## Task 3 - Batch B1: Pure-module tests (no DB, no mocks)

Convert vitest -> bun:test in seven files. Each file only needs the import swap.

**Files:**
- `lib/format.test.ts`
- `lib/scheduler/cron-expr.test.ts`
- `lib/alerts/evaluate.test.ts`
- `lib/alerts/format.test.ts`
- `lib/auth/config.test.ts`
- `lib/auth/hash.test.ts`
- `lib/alerts/config.test.ts`

- [ ] **Step 1: Find + replace the import**

For each file in the list, change the top-line import from:
```ts
import { <names> } from 'vitest';
```
to:
```ts
import { <names> } from 'bun:test';
```

Preserve the imported names verbatim. If the file imports `vi` (it does not in these B1 files - they are pure), stop and re-check; only pure tests are in B1.

Run: `grep -l "from 'vitest'" lib/format.test.ts lib/scheduler/cron-expr.test.ts lib/alerts/evaluate.test.ts lib/alerts/format.test.ts lib/auth/config.test.ts lib/auth/hash.test.ts lib/alerts/config.test.ts`
Expected: (empty output - zero files still reference 'vitest')

- [ ] **Step 2: Run the batch**

Run: `bun test lib/format.test.ts lib/scheduler/cron-expr.test.ts lib/alerts/evaluate.test.ts lib/alerts/format.test.ts lib/auth/config.test.ts lib/auth/hash.test.ts lib/alerts/config.test.ts`
Expected: all tests pass.

- [ ] **Step 3: Commit**

```bash
git add lib/format.test.ts lib/scheduler/cron-expr.test.ts lib/alerts/evaluate.test.ts lib/alerts/format.test.ts lib/auth/config.test.ts lib/auth/hash.test.ts lib/alerts/config.test.ts
git commit -m "test(B1): migrate pure-module tests vitest -> bun:test"
```

---

## Task 4 - Batch B2: DB fixture tests (`:memory:`)

Convert seven files. Each needs (a) vitest -> bun:test import swap and (b) `better-sqlite3` -> `bun:sqlite` + drizzle adapter swap in the fixture block.

**Files:**
- `lib/types.test.ts`
- `lib/measurements.test.ts`
- `lib/auth/users.test.ts`
- `lib/auth/bootstrap.test.ts`
- `lib/alerts/rules.test.ts`
- `lib/alerts/state.test.ts`
- `lib/alerts/streak.test.ts`

- [ ] **Step 1: Patch imports (per-file)**

In each file, perform two swaps. Show the pattern (example taken from `lib/auth/users.test.ts`):

Before:
```ts
import Database from 'better-sqlite3';
import { drizzle } from 'drizzle-orm/better-sqlite3';
import { beforeEach, describe, expect, it } from 'vitest';
```

After:
```ts
import { Database } from 'bun:sqlite';
import { drizzle } from 'drizzle-orm/bun-sqlite';
import { beforeEach, describe, expect, it } from 'bun:test';
```

Apply the same pattern to the other six files. The `Database.Database` type (as in `let sqlite: Database.Database;`) was used in at least one file and must become `let sqlite: Database;`. Search for `Database.Database` across the batch and fix.

Run: `grep -n "Database\.Database\|'vitest'\|'better-sqlite3'" lib/types.test.ts lib/measurements.test.ts lib/auth/users.test.ts lib/auth/bootstrap.test.ts lib/alerts/rules.test.ts lib/alerts/state.test.ts lib/alerts/streak.test.ts`
Expected: (empty output)

- [ ] **Step 2: Run the batch**

Run: `bun test lib/types.test.ts lib/measurements.test.ts lib/auth/users.test.ts lib/auth/bootstrap.test.ts lib/alerts/rules.test.ts lib/alerts/state.test.ts lib/alerts/streak.test.ts`
Expected: all pass.

- [ ] **Step 3: Commit**

```bash
git add lib/types.test.ts lib/measurements.test.ts lib/auth/users.test.ts lib/auth/bootstrap.test.ts lib/alerts/rules.test.ts lib/alerts/state.test.ts lib/alerts/streak.test.ts
git commit -m "test(B2): migrate DB fixture tests vitest+better-sqlite3 -> bun:test+bun:sqlite"
```

---

## Task 5 - Batch B3: Fetch-mock tests + mock.module

Convert seven files. These use `vi.fn()`, `vi.mock()`, and sometimes `vi.useFakeTimers()`.

**Files:**
- `lib/alerts/destinations/webhook.test.ts`
- `lib/alerts/destinations/ntfy.test.ts`
- `lib/alerts/destinations/discord.test.ts`
- `lib/alerts/destinations/slack.test.ts`
- `lib/alerts/destinations/smtp.test.ts`
- `lib/alerts/dispatch.test.ts`
- `lib/alerts/handle.test.ts`

- [ ] **Step 1: Per-file swap rules**

For each file, apply these substitutions:

1. Import line:
   - `import { <...> , vi , <...> } from 'vitest';` -> replace `vi` with `mock, spyOn, jest` as needed. The bun:test module also re-exports `beforeAll`, `afterAll`, `beforeEach`, `afterEach`, `describe`, `it`, `expect`. Import only what the file actually uses.
   - Change source from `'vitest'` to `'bun:test'`.

2. Body rewrites:
   - `vi.fn()` -> `mock()`
   - `vi.fn(impl)` -> `mock(impl)`
   - `vi.mock('./foo', factory)` -> `mock.module('./foo', factory)`
   - `vi.spyOn(obj, 'm')` -> `spyOn(obj, 'm')`
   - `vi.restoreAllMocks()` -> `mock.restore()`
   - `vi.useFakeTimers()` -> `jest.useFakeTimers()`
   - `vi.advanceTimersByTime(ms)` -> `jest.advanceTimersByTime(ms)`
   - `vi.useRealTimers()` -> `jest.useRealTimers()`
   - All `.mockReset()`, `.mockResolvedValueOnce()`, `.mockRejectedValueOnce()`, `.mockImplementation()`, `.mockReturnValueOnce()`, `.mock.calls[...]` -> keep as-is (compatible).

Example for `lib/alerts/handle.test.ts`:
```ts
// before
import { beforeEach, describe, expect, it, vi } from 'vitest';
vi.mock('./destinations', () => ({
  buildDestinations: () => [{ name: 'webhook', send: async () => ({ ok: true }) }],
  configuredNames: () => ({ webhook: true, ntfy: false, discord: false, slack: false, smtp: false }),
}));
vi.mock('../ws/broadcast', () => ({ broadcastAlert: vi.fn() }));
const { handleAlertsForMeasurement } = await import('./handle');

// after
import { beforeEach, describe, expect, it, mock } from 'bun:test';
mock.module('./destinations', () => ({
  buildDestinations: () => [{ name: 'webhook', send: async () => ({ ok: true }) }],
  configuredNames: () => ({ webhook: true, ntfy: false, discord: false, slack: false, smtp: false }),
}));
mock.module('../ws/broadcast', () => ({ broadcastAlert: mock() }));
const { handleAlertsForMeasurement } = await import('./handle');
```

`dispatch.test.ts` uses fake timers:
```ts
// before
import { describe, expect, it, vi } from 'vitest';
// ... vi.useFakeTimers(); vi.advanceTimersByTime(50); ...

// after
import { describe, expect, it, jest, mock } from 'bun:test';
// ... jest.useFakeTimers(); jest.advanceTimersByTime(50); ...
```

`webhook.test.ts` / `ntfy.test.ts` / `discord.test.ts` / `slack.test.ts` mock `globalThis.fetch`:
```ts
// before
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
const fetchMock = vi.fn();
beforeEach(() => { fetchMock.mockReset(); globalThis.fetch = fetchMock as never; });
afterEach(() => vi.restoreAllMocks());

// after
import { afterEach, beforeEach, describe, expect, it, mock } from 'bun:test';
const fetchMock = mock();
beforeEach(() => { fetchMock.mockReset(); globalThis.fetch = fetchMock as never; });
afterEach(() => mock.restore());
```

`smtp.test.ts` uses `vi.mock('nodemailer', () => ...)`:
```ts
// before
import { describe, expect, it, vi } from 'vitest';
const sendMailMock = vi.fn();
vi.mock('nodemailer', () => ({
  default: { createTransport: () => ({ sendMail: sendMailMock }) },
  createTransport: () => ({ sendMail: sendMailMock }),
}));
const { createSmtpDestination } = await import('./smtp');

// after
import { describe, expect, it, mock } from 'bun:test';
const sendMailMock = mock();
mock.module('nodemailer', () => ({
  default: { createTransport: () => ({ sendMail: sendMailMock }) },
  createTransport: () => ({ sendMail: sendMailMock }),
}));
const { createSmtpDestination } = await import('./smtp');
```

Run: `grep -n "'vitest'\|\\bvi\\." lib/alerts/destinations/webhook.test.ts lib/alerts/destinations/ntfy.test.ts lib/alerts/destinations/discord.test.ts lib/alerts/destinations/slack.test.ts lib/alerts/destinations/smtp.test.ts lib/alerts/dispatch.test.ts lib/alerts/handle.test.ts`
Expected: (empty)

- [ ] **Step 2: Run the batch**

Run: `bun test lib/alerts/destinations/ lib/alerts/dispatch.test.ts lib/alerts/handle.test.ts`
Expected: all pass.

- [ ] **Step 3: Commit**

```bash
git add lib/alerts/destinations/ lib/alerts/dispatch.test.ts lib/alerts/handle.test.ts
git commit -m "test(B3): migrate fetch/module-mock + fake-timer tests to bun:test"
```

---

## Task 6 - Batch B4: Measurement tests

Convert two files: `lib/measurement/cloudflare.test.ts` and `lib/measurement/runner.test.ts`.

**Files:**
- `lib/measurement/cloudflare.test.ts`
- `lib/measurement/runner.test.ts`

- [ ] **Step 1: Apply the same vi -> mock/spyOn/jest rewrites**

Apply the same substitutions from Task 5 Step 1. `cloudflare.test.ts` uses `fetchMock = vi.fn()`, `mock.module` is not used there (but if present, swap). `runner.test.ts` uses `vi.mock('./cloudflare', ...)` and `vi.mock('../ws/broadcast', ...)` - swap to `mock.module`.

Concrete diff for `runner.test.ts` preamble:
```ts
// before
import { beforeEach, describe, expect, it, vi } from 'vitest';
const engineMock = vi.fn<() => Promise<EngineResult>>();
vi.mock('./cloudflare', () => ({ runCloudflareSpeedTest: () => engineMock() }));
vi.mock('../ws/broadcast', () => ({ broadcastMeasurement: vi.fn(), broadcastRunning: vi.fn() }));
vi.mock('../alerts/handle', () => ({ handleAlertsForMeasurement: vi.fn() }));

// after
import { beforeEach, describe, expect, it, mock } from 'bun:test';
const engineMock = mock<() => Promise<EngineResult>>();
mock.module('./cloudflare', () => ({ runCloudflareSpeedTest: () => engineMock() }));
mock.module('../ws/broadcast', () => ({ broadcastMeasurement: mock(), broadcastRunning: mock() }));
mock.module('../alerts/handle', () => ({ handleAlertsForMeasurement: mock() }));
```

- [ ] **Step 2: Run the batch**

Run: `bun test lib/measurement/`
Expected: 12 tests pass.

- [ ] **Step 3: Commit**

```bash
git add lib/measurement/cloudflare.test.ts lib/measurement/runner.test.ts
git commit -m "test(B4): migrate measurement engine + runner tests to bun:test"
```

---

## Task 7 - Batch B5: Auth providers

**Files:**
- `lib/auth/providers.test.ts`

- [ ] **Step 1: Apply the swap**

Same rewrite rules as Task 5 Step 1. This file imports `beforeEach`, `describe`, `expect`, `it` from vitest and uses `new Database(':memory:')` fixture (also needs the bun:sqlite + bun-sqlite adapter swap from Task 4 Step 1).

- [ ] **Step 2: Run**

Run: `bun test lib/auth/providers.test.ts`
Expected: all pass.

- [ ] **Step 3: Commit**

```bash
git add lib/auth/providers.test.ts
git commit -m "test(B5): migrate auth/providers.test.ts to bun:test"
```

---

## Task 8 - Batch B6: API routes (users + auth)

**Files:**
- `app/api/users/route.test.ts`
- `app/api/users/[id]/route.test.ts`
- `app/api/users/[id]/reset-password/route.test.ts`
- `app/api/auth/setup/route.test.ts`
- `app/api/account/password/route.test.ts`

- [ ] **Step 1: Apply the swap**

Per-file substitutions from Task 5 Step 1 and Task 4 Step 1 (these files have both DB fixtures and mocks). All five files use the `vi.mock('@/lib/auth/handler', ...)` pattern; each becomes `mock.module('@/lib/auth/handler', ...)`.

Concrete diff for a typical file:
```ts
// before
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import Database from 'better-sqlite3';
import { drizzle } from 'drizzle-orm/better-sqlite3';
const authMock = vi.fn();
vi.mock('@/lib/auth/handler', () => ({
  auth: authMock,
  signIn: vi.fn(),
  signOut: vi.fn(),
  handlers: { GET: vi.fn(), POST: vi.fn() },
}));
const { POST } = await import('./route');

// after
import { afterEach, beforeEach, describe, expect, it, mock } from 'bun:test';
import { Database } from 'bun:sqlite';
import { drizzle } from 'drizzle-orm/bun-sqlite';
const authMock = mock();
mock.module('@/lib/auth/handler', () => ({
  auth: authMock,
  signIn: mock(),
  signOut: mock(),
  handlers: { GET: mock(), POST: mock() },
}));
const { POST } = await import('./route');
```

Run: `grep -rn "'vitest'\|'better-sqlite3'\|\\bvi\\." app/api/users/ app/api/auth/setup/ app/api/account/password/`
Expected: (empty)

- [ ] **Step 2: Run the batch**

Run: `bun test app/api/users/ app/api/auth/setup/ app/api/account/password/`
Expected: all pass.

- [ ] **Step 3: Commit**

```bash
git add app/api/users/ app/api/auth/setup/ app/api/account/password/
git commit -m "test(B6): migrate user + auth API route tests to bun:test"
```

---

## Task 9 - Batch B7: API routes (alerts + settings)

**Files:**
- `app/api/alerts/rules/route.test.ts`
- `app/api/alerts/test/route.test.ts`
- `app/api/settings/settings-schema.test.ts`

- [ ] **Step 1: Apply the swap**

Same rules. `alerts/rules/route.test.ts` uses DB fixtures + auth mock. `alerts/test/route.test.ts` uses `vi.mock('@/lib/alerts/destinations', ...)`. `settings-schema.test.ts` is pure (only validates a zod schema).

- [ ] **Step 2: Run the batch**

Run: `bun test app/api/alerts/ app/api/settings/`
Expected: all pass.

- [ ] **Step 3: Commit**

```bash
git add app/api/alerts/ app/api/settings/
git commit -m "test(B7): migrate alerts + settings API route tests to bun:test"
```

---

## Task 10: Flip `package.json` test scripts + remove vitest

**Files:**
- `package.json`
- `bun.lock`

- [ ] **Step 1: Update scripts**

Open `package.json`. Change:
```json
"test": "vitest run",
"test:watch": "vitest"
```
to:
```json
"test": "bun test",
"test:watch": "bun test --watch"
```

- [ ] **Step 2: Remove vitest dev dep**

```bash
bun remove vitest
```

- [ ] **Step 3: Run the whole suite via `bun test` to confirm**

Run: `bun test`
Expected: every test passes. If any file still imports from `vitest`, fix it now and re-run.

- [ ] **Step 4: Commit**

```bash
git add package.json bun.lock
git commit -m "chore: flip test scripts to \`bun test\` and drop vitest dep"
```

---

## Task 11: Dockerfile - switch every stage to `oven/bun:1-slim`

**Files:**
- `Dockerfile`

- [ ] **Step 1: Update ARGs**

At the top of the Dockerfile, replace:
```
ARG BUN_IMAGE=oven/bun:1.3.12-debian
ARG NODE_IMAGE=node:24-trixie-slim
```
with:
```
ARG BUN_IMAGE=oven/bun:1-slim
```

- [ ] **Step 2: Point every FROM at `${BUN_IMAGE}`**

Change:
- `FROM ${BUN_IMAGE} AS deps` - unchanged
- `FROM ${BUN_IMAGE} AS builder` - unchanged
- `FROM ${BUN_IMAGE} AS runtime-deps` - unchanged
- `FROM ${NODE_IMAGE} AS runner` -> `FROM ${BUN_IMAGE} AS runner`

- [ ] **Step 3: Drop `apt-get install python3 make g++` in `deps` and `runtime-deps`**

In the `deps` stage, delete the `RUN apt-get ...` line that installs `python3 make g++ ca-certificates`. Keep a slimmer `RUN apt-get update && apt-get install -y --no-install-recommends ca-certificates && rm -rf /var/lib/apt/lists/*` only if needed for https; however `oven/bun:1-slim` already ships with `ca-certificates` - verify with `docker run --rm oven/bun:1-slim cat /etc/ssl/certs/ca-certificates.crt | head -1`. If present, omit the entire apt install from `deps` entirely.

Same treatment for `runtime-deps`: remove `python3 make g++ binutils` from the apt install (keep binutils only if still used elsewhere - grep the file; as of this plan it is only referenced in the strip commands which still work on bun images). After the change the RUN block becomes just the `bun add ...` pipeline plus the `find ... strip ...` lines.

- [ ] **Step 4: Drop `better-sqlite3` from the runtime-deps `bun add` list**

Inside the `bun add \` list, delete the `better-sqlite3@^12.9.0 \` line. Also delete the block that prunes `node_modules/better-sqlite3/prebuilds/...` - that directory no longer exists after the swap. Final list:

```
 && bun add \
      @node-rs/argon2@^2 \
      drizzle-orm@^0.45.2 \
      next@^16.2.4 \
      next-auth@beta \
      node-cron@^4.2.1 \
      nodemailer@^6 \
      ws@^8.20.0 \
      zod@^4.3.6 \
```

- [ ] **Step 5: Runner CMD + HEALTHCHECK**

In the `runner` stage:

Replace:
```
HEALTHCHECK --interval=30s --timeout=5s --start-period=30s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:3000/api/settings').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"
```
with:
```
HEALTHCHECK --interval=30s --timeout=5s --start-period=30s --retries=3 \
  CMD bun -e "fetch('http://127.0.0.1:3000/api/settings').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"
```

Replace:
```
CMD ["node", "dist/server.js"]
```
with:
```
CMD ["bun", "dist/server.js"]
```

- [ ] **Step 6: Build + smoke**

```bash
docker build -t fastcom-bun1 .
docker images fastcom-bun1 --format "{{.Size}}"
SECRET=$(openssl rand -base64 32)
docker rm -f fastcom-bun1-test 2>/dev/null || true
docker run -d --name fastcom-bun1-test -p 13020:3000 \
  -e AUTH_SECRET="$SECRET" \
  -e FASTCOM_ADMIN_EMAIL=admin@example.com \
  -e FASTCOM_ADMIN_PASSWORD=hunter2hunter2 \
  fastcom-bun1
sleep 8
docker logs fastcom-bun1-test 2>&1 | tail -10
curl -sS -o /dev/null -w "settings HTTP %{http_code}\n" http://localhost:13020/api/settings
docker rm -f fastcom-bun1-test
docker rmi fastcom-bun1
```

Expected:
- Build succeeds.
- Logs show `fastcom-monitor ready on http://0.0.0.0:3000` and the scheduler boot lines with no `bun:sqlite` error.
- `settings HTTP 401` (unauth; correct behaviour).
- Image size reported; record it.

- [ ] **Step 7: Commit**

```bash
git add Dockerfile
git commit -m "build(docker): all stages on oven/bun:1-slim, drop better-sqlite3 + python3/make/g++"
```

---

## Task 12: README updates

**Files:**
- `README.md`

- [ ] **Step 1: Stack section**

Find the `## Stack` section. Update the relevant bullets:

```
- **DB**: Drizzle ORM 0.45 + `bun:sqlite` (built-in)
- **Tests**: Bun native (`bun test`)
- **Runtime image**: `oven/bun:1-slim` (single Bun runtime, dev + prod)
```

- [ ] **Step 2: Development section**

Remove the `> **Use bun run test, not bun test.** ...` blockquote and the `[bun-4290]` link definition. Rewrite the Development commands:

```
bun install
bun run db:generate        # generate drizzle migrations
bun run dev                # tsx watch server.ts -> http://localhost:3000
bun test                   # bun native test runner
bun run lint               # biome check
bun run typecheck          # tsc --noEmit
bun run build              # next build + tsup bundle for server.ts
```

- [ ] **Step 3: Commit**

```bash
git add README.md
git commit -m "docs(readme): Bun unified runtime + drop the 'bun test is blocked' note"
```

---

## Task 13: Full-suite sanity

- [ ] **Step 1: Run everything**

```bash
bun test
bun run lint
bunx tsc --noEmit
```

Expected: suite green, lint clean (2 pre-existing infos ok), typecheck clean.

- [ ] **Step 2: Dev-mode smoke**

```bash
bun run dev &
sleep 6
curl -sS -o /dev/null -w "root HTTP %{http_code}\n" http://localhost:3003/
kill %1
```
Expected: `root HTTP 307` (redirect to /login if no user, /setup if 0 user). No stack traces.

- [ ] **Step 3: Final Docker E2E**

```bash
docker build -t fastcom-bun-final .
SECRET=$(openssl rand -base64 32)
docker rm -f fastcom-bun-final-c 2>/dev/null || true
docker run -d --name fastcom-bun-final-c -p 13021:3000 \
  -e AUTH_SECRET="$SECRET" \
  -e FASTCOM_ADMIN_EMAIL=admin@example.com \
  -e FASTCOM_ADMIN_PASSWORD=hunter2hunter2 \
  fastcom-bun-final
sleep 8

CSRF=$(curl -sS -c /tmp/fc-cookies.txt http://localhost:13021/api/auth/csrf | grep -o '"csrfToken":"[^"]*"' | sed 's/.*"csrfToken":"\(.*\)"/\1/')
curl -sS -L -c /tmp/fc-cookies.txt -b /tmp/fc-cookies.txt \
  -X POST "http://localhost:13021/api/auth/callback/credentials" \
  -H "Content-Type: application/x-www-form-urlencoded" \
  --data-urlencode "csrfToken=$CSRF" \
  --data-urlencode "email=admin@example.com" \
  --data-urlencode "password=hunter2hunter2" \
  --data-urlencode "redirect=false" \
  -o /dev/null -w "login: HTTP %{http_code}\n"

time curl -sS -b /tmp/fc-cookies.txt -X POST http://localhost:13021/api/measurements/run | head -c 400

docker rm -f fastcom-bun-final-c
docker rmi fastcom-bun-final
rm -f /tmp/fc-cookies.txt
```

Expected:
- `login: HTTP 302`
- Measurement JSON with non-null `downloadMbps`, `uploadMbps`, `latencyUnloadedMs`, `serverLocations: ["<colo>"]`.
- Completes in ~20-40s.

- [ ] **Step 4: Commit any fixes surfaced**

```bash
git add -u
git commit -m "chore: post-migration fixes from sanity pass"
```
(only if something needed fixing)

---

## Self-review checklist

**Spec coverage:**
- DB driver swap (`lib/db/client.ts`, `lib/db/migrate.ts`, `drizzle.config.ts`): Task 1 ✓
- `bunfig.toml` + `scripts/block-bun-test.ts` removed: Task 2 ✓
- Test batches B1-B7: Tasks 3-9 ✓
- `package.json` scripts + vitest dep: Task 10 ✓
- Dockerfile every-stage-bun, drop python3/make/g++, runner CMD + HEALTHCHECK: Task 11 ✓
- README Stack + Development: Task 12 ✓
- Full smoke (lint + tsc + dev + Docker E2E): Task 13 ✓

**Placeholder scan:** no TBDs, every step has concrete code or commands.

**Type consistency:** `Database` (from `bun:sqlite`, a class) is imported consistently as `{ Database }` across all files. `drizzle` factory comes from `drizzle-orm/bun-sqlite` in every test + in `lib/db/client.ts`. Test imports uniformly come from `bun:test` after Task 3 onward.
