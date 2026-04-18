// lib/measurement/cloudflare.ts
import Speedtest from '@cloudflare/speedtest';
import type { EngineResult } from './types';

const RUN_TIMEOUT_MS = 60_000;
const META_URL = 'https://speed.cloudflare.com/meta';
const META_TIMEOUT_MS = 5_000;

type Summary = {
  download?: number;
  upload?: number;
  latency?: number;
  downLoadedLatency?: number;
  upLoadedLatency?: number;
  jitter?: number;
  packetLoss?: number;
};

type Meta = {
  clientIp?: string;
  colo?: string | { iata?: string } | null;
  city?: string;
  country?: string;
  asOrganization?: string;
};

function coloIata(colo: Meta['colo']): string | null {
  if (!colo) return null;
  if (typeof colo === 'string') return colo;
  return colo.iata ?? null;
}

type ResultsLike = {
  getSummary: () => Summary;
};

function join(parts: (string | undefined)[]): string | null {
  const joined = parts.filter((p): p is string => Boolean(p)).join(', ');
  return joined || null;
}

// `@cloudflare/speedtest` does not expose client metadata on its Results class;
// the browser bundle fetches https://speed.cloudflare.com/meta separately. We
// replicate that here. The endpoint gates access on Referer: without it it
// returns 403 + `{}`; with `https://speed.cloudflare.com/` it returns the full
// payload. We also keep a CF-RAY colo fallback as a last resort. Failures are
// soft - metadata fields fall back to null.
export async function fetchCloudflareMeta(): Promise<Meta> {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), META_TIMEOUT_MS);
  try {
    const res = await fetch(META_URL, {
      signal: ctrl.signal,
      headers: { Referer: 'https://speed.cloudflare.com/' },
    });
    const body = res.ok ? ((await res.json().catch(() => ({}))) as Meta) : {};
    if (coloIata(body.colo) === null) {
      const ray = res.headers.get('cf-ray');
      const colo = ray?.split('-')[1];
      if (colo) body.colo = colo;
    }
    return body;
  } catch {
    return {};
  } finally {
    clearTimeout(timer);
  }
}

export function runCloudflareSpeedTest(): Promise<EngineResult> {
  // Note: `packetLoss` intentionally omitted. The Cloudflare engine
  // implements it via `RTCPeerConnection`, which is a browser-only API and
  // is not available in Node.js. Running it server-side rejects with
  // "ReferenceError: RTCPeerConnection is not defined" and aborts the rest
  // of the run. We surface `packetLossPct: null` instead.
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
    ],
  }) as unknown as {
    play: () => void;
    pause: () => void;
    onFinish: (r: ResultsLike) => void;
    onError: (e: unknown) => void;
  };

  const metaPromise = fetchCloudflareMeta();

  return new Promise<EngineResult>((resolve, reject) => {
    const timer = setTimeout(() => {
      try {
        engine.pause();
      } catch {
        /* ignore */
      }
      reject(new Error('timed out'));
    }, RUN_TIMEOUT_MS);

    engine.onFinish = async (results) => {
      clearTimeout(timer);
      const s = results.getSummary();
      const meta = await metaPromise;
      const downMbps = typeof s.download === 'number' ? s.download / 1_000_000 : null;
      const upMbps = typeof s.upload === 'number' ? s.upload / 1_000_000 : null;
      const unloaded = typeof s.latency === 'number' ? s.latency : null;
      const loaded =
        typeof s.downLoadedLatency === 'number' || typeof s.upLoadedLatency === 'number'
          ? Math.max(s.downLoadedLatency ?? 0, s.upLoadedLatency ?? 0)
          : null;
      const bufferBloat =
        loaded != null && unloaded != null ? Math.max(0, Math.round(loaded - unloaded)) : null;
      const colo = coloIata(meta.colo);
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
        userIsp: meta.asOrganization ?? null,
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
