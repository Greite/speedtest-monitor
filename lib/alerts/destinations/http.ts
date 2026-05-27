import type { DeliveryResult } from '../types';

export async function httpDeliver(
  url: string,
  init: { headers: Record<string, string>; body: BodyInit },
): Promise<DeliveryResult> {
  try {
    const res = await fetch(url, { method: 'POST', headers: init.headers, body: init.body });
    if (!res.ok) {
      return { ok: false, httpStatus: res.status, error: `HTTP ${res.status}` };
    }
    return { ok: true, httpStatus: res.status };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : String(err) };
  }
}
