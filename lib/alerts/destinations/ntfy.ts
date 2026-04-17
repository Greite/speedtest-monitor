import type { NtfyConfig } from '../config';
import type { AlertPayload, DeliveryResult } from '../types';

export function createNtfyDestination(cfg: NtfyConfig) {
  return {
    name: 'ntfy' as const,
    async send(payload: AlertPayload): Promise<DeliveryResult> {
      const headers: Record<string, string> = {
        'X-Title': payload.title,
        'X-Priority': payload.event === 'fired' ? 'urgent' : 'default',
        'X-Tags': payload.event === 'fired' ? 'warning,rotating_light' : 'white_check_mark',
      };
      if (cfg.token) headers.Authorization = `Bearer ${cfg.token}`;
      try {
        const res = await fetch(cfg.url, { method: 'POST', headers, body: payload.body });
        if (!res.ok) {
          return { ok: false, httpStatus: res.status, error: `HTTP ${res.status}` };
        }
        return { ok: true, httpStatus: res.status };
      } catch (err) {
        return { ok: false, error: err instanceof Error ? err.message : String(err) };
      }
    },
  };
}
