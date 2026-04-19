import { Database } from 'bun:sqlite';
import { afterEach, beforeEach, describe, expect, it } from 'bun:test';
import { drizzle } from 'drizzle-orm/bun-sqlite';
import * as schema from '@/lib/db/schema';
import { GET, PATCH } from './route';

beforeEach(() => {
  const sqlite = new Database(':memory:');
  sqlite.exec(
    `CREATE TABLE settings (key TEXT PRIMARY KEY, value TEXT NOT NULL, updated_at INTEGER NOT NULL);`,
  );
  globalThis.__speedtestDb = { sqlite, db: drizzle(sqlite, { schema }) };
});
afterEach(() => {
  delete process.env.SPEEDTEST_WEBHOOK_URL;
});

describe('api/alerts/rules', () => {
  it('GET returns defaults with destinationsConfigured reflecting env', async () => {
    process.env.SPEEDTEST_WEBHOOK_URL = 'https://h/x';
    const res = await GET();
    const body = await res.json();
    expect(body.enabled).toBe(false);
    expect(body.destinationsConfigured.webhook).toBe(true);
    expect(body.destinationsConfigured.ntfy).toBe(false);
  });

  it('PATCH updates enabled + thresholds', async () => {
    const req = new Request('http://x/api/alerts/rules', {
      method: 'PATCH',
      body: JSON.stringify({
        enabled: true,
        thresholds: { downloadMbps: 100, uploadMbps: null, latencyMs: null, bufferBloatMs: null },
      }),
    });
    const res = await PATCH(req);
    const body = await res.json();
    expect(body.enabled).toBe(true);
    expect(body.thresholds.downloadMbps).toBe(100);
  });
});
