// lib/measurement/cloudflare.test.ts
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

type EngineListeners = {
  onFinish?: (r: FakeResults) => void | Promise<void>;
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

class FakeResults {
  constructor(private readonly summary: FakeSummary) {}
  getSummary() {
    return this.summary;
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
  async finishWith(summary: FakeSummary) {
    await this.listeners.onFinish?.(new FakeResults(summary));
  }
  errorWith(err: unknown) {
    this.listeners.onError?.(err);
  }
}

vi.mock('@cloudflare/speedtest', () => ({
  default: vi.fn(function FakeCtor(this: FakeSpeedtest) {
    return new FakeSpeedtest();
  }),
}));

const { runCloudflareSpeedTest } = await import('./cloudflare');

const fetchMock = vi.fn();

beforeEach(() => {
  FakeSpeedtest.lastInstance = null;
  fetchMock.mockReset();
  globalThis.fetch = fetchMock as never;
  vi.useRealTimers();
});

afterEach(() => {
  vi.restoreAllMocks();
});

function mockMeta(meta: Record<string, unknown>) {
  fetchMock.mockResolvedValueOnce(
    new Response(JSON.stringify(meta), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    }),
  );
}

describe('runCloudflareSpeedTest', () => {
  it('maps a full summary + meta to EngineResult', async () => {
    mockMeta({
      city: 'Paris',
      country: 'FR',
      clientIp: '82.66.1.2',
      asOrganization: 'Free SAS',
      colo: 'CDG',
    });
    const p = runCloudflareSpeedTest();
    await Promise.resolve();
    const engine = FakeSpeedtest.lastInstance!;
    await engine.finishWith({
      download: 500_000_000,
      upload: 120_000_000,
      latency: 12,
      downLoadedLatency: 45,
      upLoadedLatency: 40,
      jitter: 3,
      packetLoss: 0.5,
    });
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

  it('returns null for missing summary fields and missing meta', async () => {
    fetchMock.mockResolvedValueOnce(new Response('{}', { status: 200 }));
    const p = runCloudflareSpeedTest();
    await Promise.resolve();
    await FakeSpeedtest.lastInstance!.finishWith({ latency: 10 });
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

  it('sends Referer and parses object-shaped colo from real /meta payload', async () => {
    fetchMock.mockResolvedValueOnce(
      new Response(
        JSON.stringify({
          clientIp: '1.2.3.4',
          city: 'Paris',
          country: 'FR',
          asOrganization: 'Proxad / Free SAS',
          colo: { iata: 'CDG', lat: 49, lon: 2.55 },
        }),
        { status: 200 },
      ),
    );
    const p = runCloudflareSpeedTest();
    await Promise.resolve();
    await FakeSpeedtest.lastInstance!.finishWith({
      download: 100_000_000,
      upload: 50_000_000,
      latency: 10,
    });
    const res = await p;
    expect(fetchMock.mock.calls[0][1]?.headers).toMatchObject({
      Referer: 'https://speed.cloudflare.com/',
    });
    expect(res.serverLocations).toEqual(['CDG']);
    expect(res.userIsp).toBe('Proxad / Free SAS');
    expect(res.userIp).toBe('1.2.3.4');
  });

  it('survives meta-endpoint failure (soft fallback to nulls)', async () => {
    fetchMock.mockRejectedValueOnce(new Error('meta fetch failed'));
    const p = runCloudflareSpeedTest();
    await Promise.resolve();
    await FakeSpeedtest.lastInstance!.finishWith({
      download: 100_000_000,
      upload: 50_000_000,
      latency: 20,
    });
    const res = await p;
    expect(res.downloadMbps).toBe(100);
    expect(res.userLocation).toBeNull();
    expect(res.userIp).toBeNull();
    expect(res.userIsp).toBeNull();
    expect(res.serverLocations).toBeNull();
  });

  it('rejects when the engine emits an error', async () => {
    fetchMock.mockResolvedValueOnce(new Response('{}'));
    const p = runCloudflareSpeedTest();
    await Promise.resolve();
    FakeSpeedtest.lastInstance!.errorWith(new Error('network down'));
    await expect(p).rejects.toThrow(/network down/);
  });

  it('rejects with "timed out" and pauses the engine after the timeout', async () => {
    fetchMock.mockResolvedValueOnce(new Response('{}'));
    vi.useFakeTimers();
    const p = runCloudflareSpeedTest();
    await Promise.resolve();
    vi.advanceTimersByTime(60_001);
    vi.useRealTimers();
    await expect(p).rejects.toThrow(/timed out/);
    expect(FakeSpeedtest.lastInstance!.paused).toBe(true);
  });
});
