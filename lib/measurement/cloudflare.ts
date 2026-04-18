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
