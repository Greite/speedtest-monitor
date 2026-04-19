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

// Time-based probing: each phase runs for `durationMs`, every parallel stream
// loops fixed-size requests until the time budget expires. This scales from
// 10 Mbps links to multi-Gbps fibre without reconfiguration — the faster the
// link, the more bytes we transfer in the same window.
//
// Defaults chosen for a ~20-second full test on high-speed connections while
// remaining reasonable on slower links (gigabit saturates in ~10 s).
// Override via env: SPEEDTEST_TEST_DURATION_S, SPEEDTEST_PARALLEL_STREAMS.
const DEFAULT_DURATION_S = 10;
const DEFAULT_PARALLEL = 8;
const DOWNLOAD_BYTES_PER_REQUEST = 100_000_000; // 100 MB per /__down request
const UPLOAD_BYTES_PER_REQUEST = 25_000_000; //    25 MB per /__up request
// Absolute ceiling per fetch call — protects against a stuck request hanging
// the phase. Generous because 100 MB can take ~10 s on a 100 Mbps link.
const REQUEST_TIMEOUT_MS = 30_000;

function envInt(name: string, fallback: number, min: number, max: number): number {
  const raw = process.env[name];
  if (!raw) return fallback;
  const n = Number.parseInt(raw, 10);
  if (Number.isNaN(n) || n < min || n > max) return fallback;
  return n;
}

function testDurationMs(): number {
  return envInt('SPEEDTEST_TEST_DURATION_S', DEFAULT_DURATION_S, 2, 120) * 1000;
}

function parallelStreams(): number {
  return envInt('SPEEDTEST_PARALLEL_STREAMS', DEFAULT_PARALLEL, 1, 32);
}

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
  'User-Agent': 'speedtest-monitor/1.0 (+https://github.com/Greite/speedtest-monitor)',
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

export type ProbeOpts = { durationMs?: number; parallel?: number };

export async function probeDownload(
  opts: ProbeOpts = {},
): Promise<{ mbps: number; loadedLatencyMs: number }> {
  const durationMs = opts.durationMs ?? testDurationMs();
  const parallel = opts.parallel ?? parallelStreams();

  // Parallel latency loop runs during the download to measure loaded latency
  // / bufferbloat. Starts after 300 ms so the download streams have time to
  // saturate the pipe first.
  const loadedSamples: number[] = [];
  let stopLatency = false;
  const latencyLoop = (async () => {
    await new Promise((r) => setTimeout(r, 300));
    while (!stopLatency) {
      const t = await timedFetch(DOWN(0), { headers: COMMON_HEADERS }, 3_000).catch(() => null);
      if (t) loadedSamples.push(t.durationMs);
      await new Promise((r) => setTimeout(r, 150));
    }
  })();

  const start = performance.now();
  const deadline = start + durationMs;
  let totalBytes = 0;
  const failures: { status: number; bytes: number }[] = [];

  await Promise.all(
    Array.from({ length: parallel }, async () => {
      while (performance.now() < deadline && failures.length === 0) {
        const r = await timedFetch(
          DOWN(DOWNLOAD_BYTES_PER_REQUEST),
          { headers: COMMON_HEADERS },
          REQUEST_TIMEOUT_MS,
        ).catch(() => null);
        if (!r) continue;
        if (r.status !== 200 || r.bytes === 0) {
          failures.push({ status: r.status, bytes: r.bytes });
          return;
        }
        totalBytes += r.bytes;
      }
    }),
  );

  const wallDurationMs = performance.now() - start;
  stopLatency = true;
  await latencyLoop;

  if (failures.length > 0) {
    const f = failures[0];
    throw new Error(`download failed: status=${f.status} bytes=${f.bytes}`);
  }
  if (totalBytes === 0) {
    throw new Error('download produced no bytes');
  }
  // All streams run concurrently; aggregate throughput = sum(bytes) / wall.
  const mbps = (totalBytes * 8) / (wallDurationMs / 1000) / 1_000_000;
  const loadedLatencyMs =
    loadedSamples.length > 0 ? loadedSamples.reduce((a, b) => a + b, 0) / loadedSamples.length : 0;
  return { mbps, loadedLatencyMs };
}

export async function probeUpload(opts: ProbeOpts = {}): Promise<{ mbps: number }> {
  const durationMs = opts.durationMs ?? testDurationMs();
  const parallel = opts.parallel ?? parallelStreams();

  const body = new Uint8Array(UPLOAD_BYTES_PER_REQUEST);
  // Fill with non-zero so compression-aware proxies can't collapse the
  // payload (Cloudflare does not compress but be safe).
  for (let i = 0; i < body.length; i += 4) body[i] = (i * 2654435761) & 0xff;

  const start = performance.now();
  const deadline = start + durationMs;
  let totalBytes = 0;
  const failures: number[] = [];

  await Promise.all(
    Array.from({ length: parallel }, async () => {
      while (performance.now() < deadline && failures.length === 0) {
        const r = await timedFetch(
          UP,
          {
            method: 'POST',
            headers: { ...COMMON_HEADERS, 'Content-Type': 'application/octet-stream' },
            body,
          },
          REQUEST_TIMEOUT_MS,
        ).catch(() => null);
        if (!r) continue;
        if (r.status !== 200 && r.status !== 204) {
          failures.push(r.status);
          return;
        }
        totalBytes += UPLOAD_BYTES_PER_REQUEST;
      }
    }),
  );

  const wallDurationMs = performance.now() - start;
  if (failures.length > 0) {
    throw new Error(`upload failed: status=${failures[0]}`);
  }
  if (totalBytes === 0) {
    throw new Error('upload produced no bytes');
  }
  const mbps = (totalBytes * 8) / (wallDurationMs / 1000) / 1_000_000;
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
