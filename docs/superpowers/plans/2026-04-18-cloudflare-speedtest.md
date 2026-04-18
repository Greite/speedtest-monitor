# Cloudflare Speedtest Engine Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Replace the fast-cli + Chromium measurement engine with `@cloudflare/speedtest` (Node, HTTP-only). Ship ~700 MB lighter image, ~4× faster runs.

**Architecture:** New `lib/measurement/` module with a pure engine (`cloudflare.ts`), a thin runner preserving the existing public contract, and mapping to the existing `Measurement` row (plus 3 new nullable columns: `jitter_ms`, `packet_loss_pct`, `user_isp`).

**Tech Stack:** Next.js 16, drizzle-orm, `@cloudflare/speedtest@^1` (new), vitest.

**Spec:** `docs/superpowers/specs/2026-04-18-cloudflare-speedtest-design.md`

---

## Task 1: Deps swap

**Files:** `package.json`, `bun.lock`

- [ ] **Step 1: Add Cloudflare + remove fast-cli**

```bash
bun add @cloudflare/speedtest@^1
bun remove fast-cli
```

If `bun remove fast-cli` reports that `fast-cli` is not in dependencies (e.g. pruned already), move on.

- [ ] **Step 2: Typecheck**

Run: `bunx tsc --noEmit`
Expected: clean (no references to `fast-cli` exist yet in code; we'll remove imports in Task 6).

- [ ] **Step 3: Commit**

```bash
git add package.json bun.lock
git commit -m "deps: swap fast-cli for @cloudflare/speedtest"
```

---

## Task 2: Add 3 nullable columns to measurements

**Files:** `lib/db/schema.ts`, `drizzle/NNNN_*.sql` (generated)

- [ ] **Step 1: Extend the schema**

Open `lib/db/schema.ts`. Find the `measurements` table definition and append three columns inside the object, after the existing `userIp` line (still within the same `sqliteTable('measurements', { … })` call):

```ts
  jitterMs: real('jitter_ms'),
  packetLossPct: real('packet_loss_pct'),
  userIsp: text('user_isp'),
```

Save the file.

- [ ] **Step 2: Generate the migration**

Run: `bunx drizzle-kit generate`
Expected: a new `drizzle/NNNN_*.sql` file appears with three `ALTER TABLE measurements ADD COLUMN ...` statements. Inspect with `ls drizzle/` and open the newest file to confirm.

- [ ] **Step 3: Typecheck**

Run: `bunx tsc --noEmit`
Expected: clean. `Measurement` and `NewMeasurement` types now have the three new optional fields.

- [ ] **Step 4: Commit**

```bash
git add lib/db/schema.ts drizzle/
git commit -m "feat(db): add jitter_ms, packet_loss_pct, user_isp on measurements"
```

---

## Task 3: Extend MeasurementDto and toMeasurementDto

**Files:** `lib/types.ts`

- [ ] **Step 1: Read current file**

Open `lib/types.ts`. It contains `MeasurementDto` (typed fields) and `toMeasurementDto(row)` (mapper).

- [ ] **Step 2: Add the three fields on `MeasurementDto`**

Add these properties to the `MeasurementDto` type, after `userIp`:

```ts
  jitterMs: number | null;
  packetLossPct: number | null;
  userIsp: string | null;
```

- [ ] **Step 3: Forward them in `toMeasurementDto`**

Add these lines to the returned object (after `userIp`):

```ts
    jitterMs: row.jitterMs,
    packetLossPct: row.packetLossPct,
    userIsp: row.userIsp,
```

- [ ] **Step 4: Typecheck and run test suite**

Run: `bunx tsc --noEmit`
Expected: clean.

Run: `bun run test`
Expected: 118 tests passing (existing `lib/types.test.ts` tolerates new fields because they are included in the returned DTO).

If `lib/types.test.ts` fails, open it and update the expected object to include the three new fields with `null` values (they are not set in the test fixtures).

- [ ] **Step 5: Commit**

```bash
git add lib/types.ts lib/types.test.ts
git commit -m "feat(types): expose jitterMs, packetLossPct, userIsp on MeasurementDto"
```

---

## Task 4: Create `lib/measurement/types.ts`

**Files:** Create `lib/measurement/types.ts`

- [ ] **Step 1: Write the file**

```ts
// lib/measurement/types.ts

export type EngineResult = {
  downloadMbps: number | null;
  uploadMbps: number | null;
  latencyUnloadedMs: number | null;
  latencyLoadedMs: number | null;
  bufferBloatMs: number | null;
  jitterMs: number | null;
  packetLossPct: number | null;
  userLocation: string | null;
  userIp: string | null;
  userIsp: string | null;
  serverLocations: string[] | null;
};
```

- [ ] **Step 2: Typecheck**

Run: `bunx tsc --noEmit`
Expected: clean.

- [ ] **Step 3: Commit**

```bash
git add lib/measurement/types.ts
git commit -m "feat(measurement): EngineResult shape"
```

---

## Task 5: `lib/measurement/cloudflare.ts` with TDD

**Files:**
- Create: `lib/measurement/cloudflare.ts`
- Create: `lib/measurement/cloudflare.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
// lib/measurement/cloudflare.test.ts
import { beforeEach, describe, expect, it, vi } from 'vitest';

type EngineListeners = {
  onFinish?: (r: FakeResults) => void;
  onError?: (e: unknown) => void;
};

type FakeSummary = {
  download?: number;
  upload?: number;
  latency?: number;
  downLoadedLatency?: number;
  upLoadedLatency?: number;
  jitter?: number;
  packetLoss?: number;
};

type FakeUserInfo = {
  city?: string;
  country?: string;
  clientIp?: string;
  asOrganization?: string;
  isp?: string;
  colo?: string;
};

class FakeResults {
  constructor(
    private readonly summary: FakeSummary,
    private readonly userInfo: FakeUserInfo,
  ) {}
  getSummary() {
    return this.summary;
  }
  getUserInfo() {
    return this.userInfo;
  }
}

class FakeSpeedtest {
  static lastInstance: FakeSpeedtest | null = null;
  listeners: EngineListeners = {};
  paused = false;
  set onFinish(fn: EngineListeners['onFinish']) {
    this.listeners.onFinish = fn;
  }
  set onError(fn: EngineListeners['onError']) {
    this.listeners.onError = fn;
  }
  play() {
    FakeSpeedtest.lastInstance = this;
  }
  pause() {
    this.paused = true;
  }
  finishWith(summary: FakeSummary, userInfo: FakeUserInfo = {}) {
    this.listeners.onFinish?.(new FakeResults(summary, userInfo));
  }
  errorWith(err: unknown) {
    this.listeners.onError?.(err);
  }
}

vi.mock('@cloudflare/speedtest', () => ({
  default: vi.fn(() => new FakeSpeedtest()),
}));

const { runCloudflareSpeedTest } = await import('./cloudflare');

beforeEach(() => {
  FakeSpeedtest.lastInstance = null;
  vi.useRealTimers();
});

describe('runCloudflareSpeedTest', () => {
  it('maps a full summary + user info to EngineResult', async () => {
    const p = runCloudflareSpeedTest();
    // engine is constructed in the ctor call, but we need to wait a tick for play()
    await Promise.resolve();
    const engine = FakeSpeedtest.lastInstance!;
    engine.finishWith(
      {
        download: 500_000_000,
        upload: 120_000_000,
        latency: 12,
        downLoadedLatency: 45,
        upLoadedLatency: 40,
        jitter: 3,
        packetLoss: 0.5,
      },
      {
        city: 'Paris',
        country: 'FR',
        clientIp: '82.66.1.2',
        asOrganization: 'Free SAS',
        colo: 'CDG',
      },
    );
    const res = await p;
    expect(res).toEqual({
      downloadMbps: 500,
      uploadMbps: 120,
      latencyUnloadedMs: 12,
      latencyLoadedMs: 45,
      bufferBloatMs: 33,
      jitterMs: 3,
      packetLossPct: 0.5,
      userLocation: 'Paris, FR',
      userIp: '82.66.1.2',
      userIsp: 'Free SAS',
      serverLocations: ['CDG'],
    });
  });

  it('returns null for missing fields', async () => {
    const p = runCloudflareSpeedTest();
    await Promise.resolve();
    FakeSpeedtest.lastInstance!.finishWith({ latency: 10 }, {});
    const res = await p;
    expect(res.downloadMbps).toBeNull();
    expect(res.uploadMbps).toBeNull();
    expect(res.latencyLoadedMs).toBeNull();
    expect(res.bufferBloatMs).toBeNull();
    expect(res.jitterMs).toBeNull();
    expect(res.packetLossPct).toBeNull();
    expect(res.userLocation).toBeNull();
    expect(res.userIp).toBeNull();
    expect(res.userIsp).toBeNull();
    expect(res.serverLocations).toBeNull();
  });

  it('rejects when the engine emits an error', async () => {
    const p = runCloudflareSpeedTest();
    await Promise.resolve();
    FakeSpeedtest.lastInstance!.errorWith(new Error('network down'));
    await expect(p).rejects.toThrow(/network down/);
  });

  it('rejects with "timed out" and pauses the engine after the timeout', async () => {
    vi.useFakeTimers();
    const p = runCloudflareSpeedTest();
    await Promise.resolve();
    vi.advanceTimersByTime(60_001);
    vi.useRealTimers();
    await expect(p).rejects.toThrow(/timed out/);
    expect(FakeSpeedtest.lastInstance!.paused).toBe(true);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `bunx vitest run lib/measurement/cloudflare.test.ts`
Expected: FAIL — cannot resolve `./cloudflare`.

- [ ] **Step 3: Implement `cloudflare.ts`**

```ts
// lib/measurement/cloudflare.ts
import Speedtest from '@cloudflare/speedtest';
import type { EngineResult } from './types';

const RUN_TIMEOUT_MS = 60_000;

type Summary = {
  download?: number;
  upload?: number;
  latency?: number;
  downLoadedLatency?: number;
  upLoadedLatency?: number;
  jitter?: number;
  packetLoss?: number;
};

type UserInfo = {
  city?: string;
  country?: string;
  clientIp?: string;
  asOrganization?: string;
  isp?: string;
  colo?: string;
};

type ResultsLike = {
  getSummary: () => Summary;
  getUserInfo?: () => UserInfo;
};

function join(parts: (string | undefined)[]): string | null {
  const joined = parts.filter((p): p is string => Boolean(p)).join(', ');
  return joined || null;
}

export function runCloudflareSpeedTest(): Promise<EngineResult> {
  const engine = new Speedtest({
    autoStart: false,
    measurements: [
      { type: 'latency', numPackets: 20 },
      { type: 'download', bytes: 1e5, count: 1 },
      { type: 'download', bytes: 1e6, count: 8 },
      { type: 'download', bytes: 1e7, count: 6 },
      { type: 'download', bytes: 2.5e7, count: 4, bypassMinDuration: true },
      { type: 'upload', bytes: 1e5, count: 1 },
      { type: 'upload', bytes: 1e6, count: 8 },
      { type: 'upload', bytes: 1e7, count: 6 },
      { type: 'packetLoss', numPackets: 1000, responsesWaitTime: 3000 },
    ],
  }) as unknown as {
    play: () => void;
    pause: () => void;
    onFinish: (r: ResultsLike) => void;
    onError: (e: unknown) => void;
  };

  return new Promise<EngineResult>((resolve, reject) => {
    const timer = setTimeout(() => {
      try {
        engine.pause();
      } catch {
        /* ignore */
      }
      reject(new Error('timed out'));
    }, RUN_TIMEOUT_MS);

    engine.onFinish = (results) => {
      clearTimeout(timer);
      const s = results.getSummary();
      const meta: UserInfo = results.getUserInfo ? results.getUserInfo() : {};
      const downMbps = typeof s.download === 'number' ? s.download / 1_000_000 : null;
      const upMbps = typeof s.upload === 'number' ? s.upload / 1_000_000 : null;
      const unloaded = typeof s.latency === 'number' ? s.latency : null;
      const loaded =
        typeof s.downLoadedLatency === 'number' || typeof s.upLoadedLatency === 'number'
          ? Math.max(s.downLoadedLatency ?? 0, s.upLoadedLatency ?? 0)
          : null;
      const bufferBloat =
        loaded != null && unloaded != null ? Math.max(0, Math.round(loaded - unloaded)) : null;
      const colo = meta.colo ?? null;
      resolve({
        downloadMbps: downMbps,
        uploadMbps: upMbps,
        latencyUnloadedMs: unloaded,
        latencyLoadedMs: loaded,
        bufferBloatMs: bufferBloat,
        jitterMs: typeof s.jitter === 'number' ? s.jitter : null,
        packetLossPct: typeof s.packetLoss === 'number' ? s.packetLoss : null,
        userLocation: join([meta.city, meta.country]),
        userIp: meta.clientIp ?? null,
        userIsp: meta.asOrganization ?? meta.isp ?? null,
        serverLocations: colo ? [colo] : null,
      });
    };

    engine.onError = (err) => {
      clearTimeout(timer);
      reject(err instanceof Error ? err : new Error(String(err)));
    };

    engine.play();
  });
}
```

- [ ] **Step 4: Run tests**

Run: `bunx vitest run lib/measurement/cloudflare.test.ts`
Expected: 4 tests pass.

- [ ] **Step 5: Commit**

```bash
git add lib/measurement/cloudflare.ts lib/measurement/cloudflare.test.ts
git commit -m "feat(measurement): Cloudflare speedtest engine with full summary mapping"
```

---

## Task 6: `lib/measurement/runner.ts` with TDD

**Files:**
- Create: `lib/measurement/runner.ts`
- Create: `lib/measurement/runner.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
// lib/measurement/runner.test.ts
import Database from 'better-sqlite3';
import { drizzle } from 'drizzle-orm/better-sqlite3';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import * as schema from '../db/schema';
import { measurements } from '../db/schema';
import type { EngineResult } from './types';

const engineMock = vi.fn<() => Promise<EngineResult>>();

vi.mock('./cloudflare', () => ({
  runCloudflareSpeedTest: () => engineMock(),
}));
vi.mock('../ws/broadcast', () => ({
  broadcastMeasurement: vi.fn(),
  broadcastRunning: vi.fn(),
}));
vi.mock('../alerts/handle', () => ({
  handleAlertsForMeasurement: vi.fn(),
}));

const { runMeasurement, runMeasurementSafe, MeasurementBusyError, isMeasurementRunning } =
  await import('./runner');

const fullResult: EngineResult = {
  downloadMbps: 300,
  uploadMbps: 80,
  latencyUnloadedMs: 10,
  latencyLoadedMs: 50,
  bufferBloatMs: 40,
  jitterMs: 2,
  packetLossPct: 0,
  userLocation: 'Paris, FR',
  userIp: '82.66.1.2',
  userIsp: 'Free SAS',
  serverLocations: ['CDG'],
};

let sqlite: Database.Database;
beforeEach(() => {
  engineMock.mockReset();
  delete (globalThis as { __fastcomRunning?: boolean }).__fastcomRunning;
  sqlite = new Database(':memory:');
  const db = drizzle(sqlite, { schema });
  sqlite.exec(`
    CREATE TABLE measurements (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      timestamp INTEGER NOT NULL DEFAULT (unixepoch() * 1000),
      download_mbps REAL, upload_mbps REAL,
      latency_unloaded_ms REAL, latency_loaded_ms REAL,
      buffer_bloat_ms REAL,
      status TEXT NOT NULL, error TEXT,
      server_locations TEXT,
      user_location TEXT, user_ip TEXT,
      jitter_ms REAL, packet_loss_pct REAL, user_isp TEXT
    );
  `);
  globalThis.__fastcomDb = { sqlite, db };
});

describe('runMeasurement', () => {
  it('inserts a success row with all fields when the engine returns complete data', async () => {
    engineMock.mockResolvedValueOnce(fullResult);
    const row = await runMeasurement();
    expect(row.status).toBe('success');
    expect(row.downloadMbps).toBe(300);
    expect(row.uploadMbps).toBe(80);
    expect(row.jitterMs).toBe(2);
    expect(row.userIsp).toBe('Free SAS');
    expect(row.serverLocations).toEqual(['CDG']);
  });

  it('stores status="error" when upload is missing (partial results)', async () => {
    engineMock.mockResolvedValueOnce({ ...fullResult, uploadMbps: null });
    const row = await runMeasurement();
    expect(row.status).toBe('error');
    expect(row.error).toMatch(/incomplete/);
  });

  it('stores status="timeout" when the engine rejects with "timed out"', async () => {
    engineMock.mockRejectedValueOnce(new Error('timed out after 60s'));
    const row = await runMeasurement();
    expect(row.status).toBe('timeout');
  });

  it('stores status="error" on generic engine failure', async () => {
    engineMock.mockRejectedValueOnce(new Error('fetch failed'));
    const row = await runMeasurement();
    expect(row.status).toBe('error');
    expect(row.error).toContain('fetch failed');
  });

  it('throws MeasurementBusyError when another run is in flight', async () => {
    globalThis.__fastcomRunning = true;
    await expect(runMeasurement()).rejects.toBeInstanceOf(MeasurementBusyError);
    expect(isMeasurementRunning()).toBe(true);
  });

  it('runMeasurementSafe returns null instead of throwing busy', async () => {
    globalThis.__fastcomRunning = true;
    expect(await runMeasurementSafe()).toBeNull();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `bunx vitest run lib/measurement/runner.test.ts`
Expected: FAIL — cannot resolve `./runner`.

- [ ] **Step 3: Implement `runner.ts`**

```ts
// lib/measurement/runner.ts
import { handleAlertsForMeasurement } from '../alerts/handle';
import { getDb } from '../db/client';
import { type Measurement, measurements } from '../db/schema';
import { broadcastMeasurement, broadcastRunning } from '../ws/broadcast';
import { runCloudflareSpeedTest } from './cloudflare';

declare global {
  // eslint-disable-next-line no-var
  var __fastcomRunning: boolean | undefined;
}

export class MeasurementBusyError extends Error {
  constructor() {
    super('measurement already running');
    this.name = 'MeasurementBusyError';
  }
}

function insertMeasurement(
  row: Omit<Measurement, 'id' | 'timestamp'> & { timestamp?: Date },
): Measurement {
  const db = getDb();
  return db
    .insert(measurements)
    .values({ ...row, timestamp: row.timestamp ?? new Date() })
    .returning()
    .get();
}

export async function runMeasurement(): Promise<Measurement> {
  if (globalThis.__fastcomRunning) throw new MeasurementBusyError();
  globalThis.__fastcomRunning = true;
  const startedAt = Date.now();
  broadcastRunning(startedAt);

  try {
    const result = await runCloudflareSpeedTest();
    if (result.downloadMbps === null || result.uploadMbps === null) {
      throw new Error(
        `incomplete results: download=${result.downloadMbps} upload=${result.uploadMbps}`,
      );
    }
    const row = insertMeasurement({
      downloadMbps: result.downloadMbps,
      uploadMbps: result.uploadMbps,
      latencyUnloadedMs: result.latencyUnloadedMs,
      latencyLoadedMs: result.latencyLoadedMs,
      bufferBloatMs: result.bufferBloatMs,
      jitterMs: result.jitterMs,
      packetLossPct: result.packetLossPct,
      status: 'success',
      error: null,
      serverLocations: result.serverLocations,
      userLocation: result.userLocation,
      userIp: result.userIp,
      userIsp: result.userIsp,
    });
    broadcastMeasurement(row);
    void handleAlertsForMeasurement(row);
    return row;
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    const isTimeout = message.toLowerCase().includes('timed out');
    const row = insertMeasurement({
      downloadMbps: null,
      uploadMbps: null,
      latencyUnloadedMs: null,
      latencyLoadedMs: null,
      bufferBloatMs: null,
      jitterMs: null,
      packetLossPct: null,
      status: isTimeout ? 'timeout' : 'error',
      error: message.slice(0, 500),
      serverLocations: null,
      userLocation: null,
      userIp: null,
      userIsp: null,
    });
    broadcastMeasurement(row);
    void handleAlertsForMeasurement(row);
    return row;
  } finally {
    globalThis.__fastcomRunning = false;
  }
}

export async function runMeasurementSafe(): Promise<Measurement | null> {
  try {
    return await runMeasurement();
  } catch (err) {
    if (err instanceof MeasurementBusyError) return null;
    throw err;
  }
}

export function isMeasurementRunning(): boolean {
  return Boolean(globalThis.__fastcomRunning);
}
```

- [ ] **Step 4: Run tests**

Run: `bunx vitest run lib/measurement/runner.test.ts`
Expected: 6 tests pass.

- [ ] **Step 5: Commit**

```bash
git add lib/measurement/runner.ts lib/measurement/runner.test.ts
git commit -m "feat(measurement): runner backed by Cloudflare engine, same public contract"
```

---

## Task 7: Repoint imports + delete old fast-cli module

**Files:**
- Modify: `app/api/measurements/run/route.ts`
- Modify: `lib/scheduler/index.ts`
- Delete: `lib/fastcli/` (entire directory), `.puppeteerrc.cjs`

- [ ] **Step 1: Update imports**

In `app/api/measurements/run/route.ts`, change:
```ts
import { MeasurementBusyError, runMeasurement } from '@/lib/fastcli/runner';
```
to:
```ts
import { MeasurementBusyError, runMeasurement } from '@/lib/measurement/runner';
```

In `lib/scheduler/index.ts`, change:
```ts
import { runMeasurementSafe } from '../fastcli/runner';
```
to:
```ts
import { runMeasurementSafe } from '../measurement/runner';
```

Run `grep -rn "fastcli\|fast-cli" app lib --include='*.ts' --include='*.tsx'` to confirm no other consumer references the old path. If there are any, update them too.

- [ ] **Step 2: Delete the old module and the puppeteer rc**

```bash
rm -rf lib/fastcli
rm -f .puppeteerrc.cjs
```

- [ ] **Step 3: Typecheck + full test suite**

```bash
bunx tsc --noEmit
bun run test
```
Expected: typecheck clean. Tests: all passing (the two new test files from Tasks 5/6 add coverage, no removed tests since `lib/fastcli/` had none).

- [ ] **Step 4: Commit**

```bash
git add -A
git commit -m "refactor(measurement): rename lib/fastcli to lib/measurement, drop puppeteer rc"
```

---

## Task 8: Dockerfile — remove Chromium + swap dep

**Files:** `Dockerfile`

- [ ] **Step 1: Read current Dockerfile**

Open `Dockerfile`. Find the `runtime-deps` stage and the `runner` stage.

- [ ] **Step 2: `runtime-deps` — swap dep**

Inside the `runtime-deps` stage's `bun add \` list:
- Remove the line `      fast-cli@^5.2.0 \`
- Add `      @cloudflare/speedtest@^1 \` in alphabetical order (between `better-sqlite3` and `drizzle-orm`).

The resulting list:

```
 && bun add \
      @cloudflare/speedtest@^1 \
      @node-rs/argon2@^2 \
      better-sqlite3@^12.9.0 \
      drizzle-orm@^0.45.2 \
      execa@^9.6.1 \
      next@^16.2.4 \
      next-auth@beta \
      node-cron@^4.2.1 \
      nodemailer@^6 \
      ws@^8.20.0 \
      zod@^4.3.6 \
```

(`execa` is kept for now — auditing its usage is Task 9. Do not remove it here.)

- [ ] **Step 3: `runner` — remove Chromium, its fonts, and all chromium purges**

Find the `FROM ${NODE_IMAGE} AS runner` block. Replace the `ENV` block to remove the `PUPPETEER_*` vars:

Before (relevant lines):
```
ENV NODE_ENV=production \
    NEXT_TELEMETRY_DISABLED=1 \
    HOSTNAME=0.0.0.0 \
    PORT=3000 \
    FASTCOM_DB_PATH=/data/fastcom.db \
    FASTCOM_INTERVAL_MINUTES=15 \
    PUPPETEER_SKIP_DOWNLOAD=true \
    PUPPETEER_EXECUTABLE_PATH=/usr/bin/chromium
```

After:
```
ENV NODE_ENV=production \
    NEXT_TELEMETRY_DISABLED=1 \
    HOSTNAME=0.0.0.0 \
    PORT=3000 \
    FASTCOM_DB_PATH=/data/fastcom.db \
    FASTCOM_INTERVAL_MINUTES=15
```

Replace the full `RUN apt-get update \` block in the `runner` stage with a minimal one:

```
RUN apt-get update \
 && apt-get install -y --no-install-recommends \
      ca-certificates dumb-init \
 && rm -rf /var/lib/apt/lists/* \
 && rm -rf \
      /usr/share/doc/* \
      /usr/share/man/* \
      /usr/share/info/* \
      /usr/share/locale/* \
      /var/cache/apt/archives/* \
 && groupadd --system --gid 1001 nodejs \
 && useradd  --system --uid 1001 --gid nodejs --create-home --home /home/nodejs nodejs \
 && mkdir -p /data \
 && chown nodejs:nodejs /data /app
```

This deletes: the `chromium` + `fonts-liberation` apt packages, the Vulkan validation library removal, the chromium locale pruning, the icons removal. Keeps: `ca-certificates` (for HTTPS to speed.cloudflare.com), `dumb-init`, the nodejs user creation, and the shared docs/locale pruning.

- [ ] **Step 4: Build**

Run: `docker build -t fastcom-cf-test . 2>&1 | tail -5`
Expected: build succeeds.

Run: `docker images fastcom-cf-test --format "{{.Size}}"`
Expected: roughly `350MB`–`450MB` (vs. ~1.13 GB before).

- [ ] **Step 5: Smoke-test container boot**

```bash
docker rm -f fastcom-cf 2>/dev/null || true
SECRET=$(openssl rand -base64 32)
docker run -d --name fastcom-cf -p 13010:3000 \
  -e AUTH_SECRET="$SECRET" \
  -e FASTCOM_ADMIN_EMAIL=admin@example.com \
  -e FASTCOM_ADMIN_PASSWORD=hunter2hunter2 \
  fastcom-cf-test
sleep 8
docker logs fastcom-cf 2>&1 | tail -10
# should see: "[scheduler] scheduled ..." and "fastcom-monitor ready on http://0.0.0.0:3000"
curl -sS -o /dev/null -w "settings HTTP %{http_code}\n" http://localhost:13010/api/settings
docker rm -f fastcom-cf
docker rmi fastcom-cf-test
```

Expected: `settings HTTP 401` (unauth is normal, auth enabled on that route).

- [ ] **Step 6: Commit**

```bash
git add Dockerfile
git commit -m "build(docker): drop Chromium, switch measurement dep to @cloudflare/speedtest"
```

---

## Task 9: Audit and prune `execa` if unused

**Files:** `package.json`, `Dockerfile`, `bun.lock`

- [ ] **Step 1: Grep for any remaining execa usage**

Run: `grep -rn "execa\|'execa'\|\"execa\"" app lib --include='*.ts' --include='*.tsx'`

- [ ] **Step 2: If there are zero hits**

```bash
bun remove execa
```

Then edit `Dockerfile` and remove the `      execa@^9.6.1 \` line from the `runtime-deps` `bun add` list.

- [ ] **Step 3: Typecheck + tests**

```bash
bunx tsc --noEmit
bun run test
```
Expected: clean + all tests pass.

- [ ] **Step 4: Commit (only if step 2 made changes)**

```bash
git add package.json bun.lock Dockerfile
git commit -m "deps: drop execa, no longer needed after Cloudflare engine swap"
```

If step 1 found hits, skip steps 2–4: execa has other consumers, leave it in place.

---

## Task 10: README updates

**Files:** `README.md`

- [ ] **Step 1: Update the Stack section**

Open `README.md` and look at the `## Stack` section. Find any mention of "fast.com" or "fast-cli" or "Puppeteer" or "Chromium" and replace them with Cloudflare Speed Test equivalents. Example edit — if the list has a line like `- fast-cli / puppeteer (headless Chromium)`, change it to `- @cloudflare/speedtest (HTTP-only, no browser)`.

Keep every other bullet unchanged.

- [ ] **Step 2: Update the End-to-end check duration**

In the `### End-to-end check` section, find the comment `# trigger one measurement (~90s)` and change the duration to `~20s`.

- [ ] **Step 3: Append an Upgrade note**

Add a new subsection under `## Authentication → ### Upgrading from a pre-auth version` (or at the end of the `## Development` section if there is no upgrade section) titled `### Upgrading the measurement engine` with this content:

```markdown
### Upgrading the measurement engine

The 0.2+ release swaps the measurement backend from fast.com (via the
`fast-cli` + Chromium browser) to Cloudflare Speed Test (HTTP only). On
first boot after the upgrade:

- Three new nullable columns (`jitter_ms`, `packet_loss_pct`, `user_isp`)
  are added to the `measurements` table. Historical rows keep them
  `null` — the data was never captured.
- Post-upgrade rows record the Cloudflare edge code (e.g. `CDG`) in
  `server_locations` instead of Netflix Fast's location strings (e.g.
  `Paris, FR | Saint Denis, FR`).
- Absolute speed numbers may differ slightly vs. pre-upgrade runs
  because the CDN behind the test is different. The trend is still
  directly comparable.
- The container image shrinks by roughly 700 MB; no Chromium, no
  `fonts-liberation`, no sandbox requirement.
```

- [ ] **Step 4: Commit**

```bash
git add README.md
git commit -m "docs: Cloudflare speedtest engine in Stack + upgrade note"
```

---

## Task 11: Full-suite sanity

- [ ] **Step 1: Tests**

Run: `bun run test`
Expected: all tests passing (baseline 118 + 4 new Cloudflare tests + 6 new runner tests = ~128).

- [ ] **Step 2: Lint**

Run: `bun run lint`
If errors: `bun run lint:fix` then re-run. Commit any auto-formatter changes:
```bash
git add -u
git commit -m "style: biome format post-Cloudflare swap"
```

- [ ] **Step 3: E2E real measurement**

```bash
docker build -t fastcom-cf-final . 2>&1 | tail -3
docker rm -f fastcom-cf-final 2>/dev/null || true
SECRET=$(openssl rand -base64 32)
docker run -d --name fastcom-cf-final -p 13011:3000 \
  -e AUTH_SECRET="$SECRET" \
  -e FASTCOM_ADMIN_EMAIL=admin@example.com \
  -e FASTCOM_ADMIN_PASSWORD=hunter2hunter2 \
  fastcom-cf-final
sleep 8

# sign in via next-auth credentials to get a cookie
CSRF=$(curl -sS -c /tmp/fc-cookies.txt http://localhost:13011/api/auth/csrf | grep -o '"csrfToken":"[^"]*"' | sed 's/.*"csrfToken":"\(.*\)"/\1/')
curl -sS -L -c /tmp/fc-cookies.txt -b /tmp/fc-cookies.txt \
  -X POST "http://localhost:13011/api/auth/callback/credentials" \
  -H "Content-Type: application/x-www-form-urlencoded" \
  --data-urlencode "csrfToken=$CSRF" \
  --data-urlencode "email=admin@example.com" \
  --data-urlencode "password=hunter2hunter2" \
  --data-urlencode "redirect=false" \
  -o /dev/null -w "login: HTTP %{http_code}\n"

# trigger a real measurement (hits Cloudflare)
time curl -sS -b /tmp/fc-cookies.txt -X POST http://localhost:13011/api/measurements/run | head -c 400
echo
docker rm -f fastcom-cf-final
docker rmi fastcom-cf-final
rm -f /tmp/fc-cookies.txt
```

Expected:
- `login: HTTP 302`
- The `curl` returns JSON with a `measurement` object containing non-null `downloadMbps`, `uploadMbps`, `latencyUnloadedMs`, and `serverLocations: ["<ColoCode>"]`
- `time` total around 20–40 seconds (was ~90s with fast-cli)
- Image size inspected via `docker images | grep fastcom-cf-final` shows ~400 MB or less

- [ ] **Step 4: Commit any fixes**

```bash
git add -u
git commit -m "chore: post-Cloudflare-swap fixes from sanity pass"   # only if changes
```

---

## Self-review checklist

**Spec coverage:**
- Single engine / remove fast-cli, puppeteer, Chromium → Tasks 1, 7, 8 ✓
- Additive `jitter_ms`, `packet_loss_pct`, `user_isp` columns → Task 2 ✓
- DTO + WS broadcast get the three fields → Task 3 ✓
- `EngineResult` shape → Task 4 ✓
- Cloudflare engine with 60 s timeout + error surface → Task 5 ✓
- Runner preserves public contract + partial-results / timeout / busy handling → Task 6 ✓
- Dockerfile runtime-deps swap + runner slimming → Task 8 ✓
- README updates → Task 10 ✓
- Full-suite + E2E sanity → Task 11 ✓

**Placeholder scan:** no TBDs, every step has concrete code or commands.

**Type consistency:** `EngineResult` shape is defined once in Task 4 and consumed identically in Tasks 5 and 6. Column names in the DB migration (`jitter_ms`, `packet_loss_pct`, `user_isp`) match the TS property names (`jitterMs`, `packetLossPct`, `userIsp`) via drizzle's snake_case column / camelCase property convention.
