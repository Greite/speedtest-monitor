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
  default: vi.fn(function FakeSpeedtestCtor(this: FakeSpeedtest) {
    return new FakeSpeedtest();
  }),
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
