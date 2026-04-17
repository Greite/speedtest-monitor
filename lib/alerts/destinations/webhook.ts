import type { WebhookConfig } from '../config';
import type { AlertPayload, DeliveryResult } from '../types';

export function createWebhookDestination(cfg: WebhookConfig) {
  return {
    name: 'webhook' as const,
    async send(payload: AlertPayload): Promise<DeliveryResult> {
      try {
        const res = await fetch(cfg.url, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', ...cfg.headers },
          body: JSON.stringify(payload),
        });
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
