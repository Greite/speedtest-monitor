import { Database } from 'bun:sqlite';
import { beforeEach, describe, expect, it } from 'bun:test';
import { drizzle } from 'drizzle-orm/bun-sqlite';
import * as schema from '@/lib/db/schema';
import { measurements } from '@/lib/db/schema';

const { GET } = await import('./route');

beforeEach(() => {
  const sqlite = new Database(':memory:');
  const db = drizzle(sqlite, { schema });
  sqlite.exec(`
    CREATE TABLE measurements (
      id INTEGER PRIMARY KEY AUTOINCREMENT, timestamp INTEGER NOT NULL,
      download_mbps REAL, upload_mbps REAL,
      latency_unloaded_ms REAL, latency_loaded_ms REAL, buffer_bloat_ms REAL,
      status TEXT NOT NULL, error TEXT, server_locations TEXT,
      user_location TEXT, user_ip TEXT, jitter_ms REAL,
      packet_loss_pct REAL, user_isp TEXT
    );
  `);
  globalThis.__speedtestDb = { sqlite, db };

  const base = Date.UTC(2026, 0, 1);
  for (let i = 0; i < 30; i++) {
    db.insert(measurements)
      .values({
        timestamp: new Date(base + i * 1000),
        downloadMbps: i * 10,
        uploadMbps: i,
        latencyLoadedMs: 100 - i,
        status: 'success',
        serverLocations: ['Paris'],
      })
      .run();
  }
});

describe('GET /api/measurements/table', () => {
  it('returns default page with totalCount', async () => {
    const res = await GET(new Request('http://x/api/measurements/table'));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.totalCount).toBe(30);
    expect(body.measurements).toHaveLength(25);
    expect(body.page).toBe(1);
    expect(body.pageSize).toBe(25);
  });

  it('respects page and pageSize', async () => {
    const res = await GET(new Request('http://x/api/measurements/table?page=2&pageSize=10'));
    const body = await res.json();
    expect(body.page).toBe(2);
    expect(body.pageSize).toBe(10);
    expect(body.measurements).toHaveLength(10);
  });

  it('filters and paginates together', async () => {
    const res = await GET(
      new Request('http://x/api/measurements/table?downloadMin=200&pageSize=10'),
    );
    const body = await res.json();
    expect(body.totalCount).toBe(10);
    expect(body.measurements).toHaveLength(10);
  });

  it('returns 400 on invalid sort column', async () => {
    const res = await GET(new Request('http://x/api/measurements/table?sort=drop'));
    expect(res.status).toBe(400);
  });

  it('returns 400 on invalid pageSize', async () => {
    const res = await GET(new Request('http://x/api/measurements/table?pageSize=7'));
    expect(res.status).toBe(400);
  });
});
