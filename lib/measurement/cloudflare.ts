// lib/measurement/cloudflare.ts
//
// Direct-HTTP Cloudflare speed test. We hit speed.cloudflare.com's bandwidth
// endpoints with raw fetch and measure byte throughput ourselves. This avoids
// the `@cloudflare/speedtest` npm package entirely: it relies on the browser
// `PerformanceResourceTiming.transferSize` field which Node's undici does not
// populate, so every timing resolves to `undefined` and the engine retries
// itself into a 429 rate-limit.
//
// Endpoints used:
//   GET  /__down?bytes=N  -> N bytes of payload
//   POST /__up            -> ignores body, returns 200 after full upload
//   GET  /meta            -> { clientIp, asOrganization, city, country, colo }
//     (only returns data when Referer: https://speed.cloudflare.com/ is set)

import type { EngineResult } from './types';

const ORIGIN = 'https://speed.cloudflare.com';
const META_URL = `${ORIGIN}/meta`;
const DOWN = (bytes: number) => `${ORIGIN}/__down?bytes=${bytes}`;
const UP = `${ORIGIN}/__up`;

const META_TIMEOUT_MS = 5_000;
const LATENCY_PROBES = 10;
const DOWNLOAD_BYTES = 25_000_000; // 25 MB
const UPLOAD_BYTES = 10_000_000; // 10 MB
const PHASE_TIMEOUT_MS = 30_000;

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

function join(parts: (string | undefined)[]): string | null {
  const joined = parts.filter((p): p is string => Boolean(p)).join(', ');
  return joined || null;
}

const COMMON_HEADERS = {
  Referer: 'https://speed.cloudflare.com/',
  'User-Agent': 'fastcom-monitor/1.0 (+https://github.com/gpainteaux/fastcom-docker)',
};

export async function fetchCloudflareMeta(): Promise<Meta> {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), META_TIMEOUT_MS);
  try {
    const res = await fetch(META_URL, { signal: ctrl.signal, headers: COMMON_HEADERS });
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

async function timedFetch(
  url: string,
  init: RequestInit,
  timeoutMs: number,
): Promise<{ bytes: number; durationMs: number; status: number }> {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeoutMs);
  const start = performance.now();
  try {
    const res = await fetch(url, { ...init, signal: ctrl.signal });
    let bytes = 0;
    if (res.body) {
      const reader = res.body.getReader();
      while (true) {
        const { value, done } = await reader.read();
        if (done) break;
        bytes += value?.byteLength ?? 0;
      }
    } else {
      const buf = await res.arrayBuffer();
      bytes = buf.byteLength;
    }
    return { bytes, durationMs: performance.now() - start, status: res.status };
  } finally {
    clearTimeout(timer);
  }
}

export async function probeLatency(): Promise<{ min: number; mean: number; jitter: number }> {
  const samples: number[] = [];
  // Warm-up once to establish TCP/TLS pool; do not record.
  await timedFetch(DOWN(0), { headers: COMMON_HEADERS }, 5_000).catch(() => null);
  for (let i = 0; i < LATENCY_PROBES; i++) {
    const t = await timedFetch(DOWN(0), { headers: COMMON_HEADERS }, 5_000).catch(() => null);
    if (t) samples.push(t.durationMs);
  }
  if (samples.length === 0) throw new Error('no latency samples');
  const min = Math.min(...samples);
  const mean = samples.reduce((a, b) => a + b, 0) / samples.length;
  // Jitter = mean absolute deviation from mean (simple + robust to outliers).
  const jitter = samples.reduce((acc, s) => acc + Math.abs(s - mean), 0) / samples.length;
  return { min, mean, jitter };
}

export async function probeDownload(): Promise<{ mbps: number; loadedLatencyMs: number }> {
  // Run a big download and concurrently ping latency probes to measure loaded
  // latency / bufferbloat.
  const loadedSamples: number[] = [];
  let stopLatency = false;
  const latencyLoop = (async () => {
    // Small delay so the TCP stream actually gets going first.
    await new Promise((r) => setTimeout(r, 200));
    while (!stopLatency) {
      const t = await timedFetch(DOWN(0), { headers: COMMON_HEADERS }, 3_000).catch(() => null);
      if (t) loadedSamples.push(t.durationMs);
      await new Promise((r) => setTimeout(r, 150));
    }
  })();

  const result = await timedFetch(
    DOWN(DOWNLOAD_BYTES),
    { headers: COMMON_HEADERS },
    PHASE_TIMEOUT_MS,
  );
  stopLatency = true;
  await latencyLoop;

  if (result.status !== 200 || result.bytes === 0) {
    throw new Error(`download failed: status=${result.status} bytes=${result.bytes}`);
  }
  // bits / seconds / 1_000_000 -> Mbps
  const mbps = (result.bytes * 8) / (result.durationMs / 1000) / 1_000_000;
  const loadedLatencyMs =
    loadedSamples.length > 0 ? loadedSamples.reduce((a, b) => a + b, 0) / loadedSamples.length : 0;
  return { mbps, loadedLatencyMs };
}

export async function probeUpload(): Promise<{ mbps: number }> {
  const body = new Uint8Array(UPLOAD_BYTES);
  // Fill with non-zero so compression-aware proxies can't collapse the
  // payload (Cloudflare does not compress but be safe).
  for (let i = 0; i < body.length; i += 4) body[i] = (i * 2654435761) & 0xff;
  const result = await timedFetch(
    UP,
    {
      method: 'POST',
      headers: { ...COMMON_HEADERS, 'Content-Type': 'application/octet-stream' },
      body,
    },
    PHASE_TIMEOUT_MS,
  );
  if (result.status !== 200 && result.status !== 204) {
    throw new Error(`upload failed: status=${result.status}`);
  }
  // We measured the full round-trip (request body + server ack). Payload size
  // is what dominates; tiny server response is negligible.
  const mbps = (UPLOAD_BYTES * 8) / (result.durationMs / 1000) / 1_000_000;
  return { mbps };
}

export async function runCloudflareSpeedTest(): Promise<EngineResult> {
  const meta = await fetchCloudflareMeta();

  const latency = await probeLatency();
  const download = await probeDownload();
  const upload = await probeUpload();

  const unloaded = Math.round(latency.min);
  const loaded = download.loadedLatencyMs > 0 ? Math.round(download.loadedLatencyMs) : null;
  const bufferBloat = loaded != null ? Math.max(0, loaded - unloaded) : null;
  const colo = coloIata(meta.colo);

  return {
    downloadMbps: Number(download.mbps.toFixed(1)),
    uploadMbps: Number(upload.mbps.toFixed(1)),
    latencyUnloadedMs: unloaded,
    latencyLoadedMs: loaded,
    bufferBloatMs: bufferBloat,
    jitterMs: Number(latency.jitter.toFixed(1)),
    packetLossPct: null, // would need ICMP / RTCPeerConnection; out of scope
    userLocation: join([meta.city, meta.country]),
    userIp: meta.clientIp ?? null,
    userIsp: meta.asOrganization ?? null,
    serverLocations: colo ? [colo] : null,
  };
}
