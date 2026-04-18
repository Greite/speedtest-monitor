// lib/measurement/cloudflare.test.ts
import { afterEach, beforeEach, describe, expect, it, mock } from 'bun:test';
import { fetchCloudflareMeta, probeLatency, probeUpload } from './cloudflare';

const fetchMock = mock();

beforeEach(() => {
  fetchMock.mockReset();
  globalThis.fetch = fetchMock as never;
});

afterEach(() => {
  mock.restore();
});

function body(bytes: number) {
  return new Response(new Uint8Array(bytes), { status: 200 });
}

function metaRes(meta: unknown, headers: Record<string, string> = {}) {
  return new Response(JSON.stringify(meta), { status: 200, headers });
}

describe('fetchCloudflareMeta', () => {
  it('sends Referer https://speed.cloudflare.com/ and parses object-shape colo', async () => {
    fetchMock.mockResolvedValueOnce(
      metaRes({
        clientIp: '1.2.3.4',
        city: 'Paris',
        country: 'FR',
        asOrganization: 'Proxad / Free SAS',
        colo: { iata: 'CDG', lat: 49, lon: 2.55 },
      }),
    );
    const meta = await fetchCloudflareMeta();
    expect(fetchMock.mock.calls[0][1]?.headers).toMatchObject({
      Referer: 'https://speed.cloudflare.com/',
    });
    expect(meta.clientIp).toBe('1.2.3.4');
    expect(meta.asOrganization).toBe('Proxad / Free SAS');
    expect(typeof meta.colo === 'object' && meta.colo?.iata).toBe('CDG');
  });

  it('falls back to CF-RAY header when body colo is missing', async () => {
    fetchMock.mockResolvedValueOnce(metaRes({ clientIp: '1.2.3.4' }, { 'cf-ray': 'abcd1234-CDG' }));
    const meta = await fetchCloudflareMeta();
    expect(meta.colo).toBe('CDG');
  });

  it('returns {} when the fetch throws', async () => {
    fetchMock.mockRejectedValueOnce(new Error('network'));
    const meta = await fetchCloudflareMeta();
    expect(meta).toEqual({});
  });
});

describe('probeLatency', () => {
  it('returns min / mean / jitter and ignores the warm-up', async () => {
    // 1 warm-up + 10 probes
    fetchMock.mockImplementation(async () => body(0));
    const r = await probeLatency();
    expect(fetchMock).toHaveBeenCalledTimes(11);
    expect(r.min).toBeGreaterThanOrEqual(0);
    expect(r.mean).toBeGreaterThanOrEqual(r.min);
    expect(r.jitter).toBeGreaterThanOrEqual(0);
  });
});

describe('probeUpload', () => {
  it('POSTs 4 parallel streams of 10 MB each and computes aggregate Mbps', async () => {
    fetchMock.mockImplementation(async () => {
      await new Promise((r) => setTimeout(r, 10));
      return new Response(null, { status: 200 });
    });
    const r = await probeUpload();
    expect(r.mbps).toBeGreaterThan(0);
    expect(fetchMock).toHaveBeenCalledTimes(4);
    const [, init] = fetchMock.mock.calls[0];
    expect(init.method).toBe('POST');
    expect((init.body as Uint8Array).byteLength).toBe(10_000_000);
  });

  it('throws when a stream responds non-2xx', async () => {
    fetchMock.mockImplementation(async () => new Response(null, { status: 500 }));
    await expect(probeUpload()).rejects.toThrow(/upload failed.*500/);
  });
});
