import type { SlackConfig } from '../config';
import type { AlertPayload, DeliveryResult } from '../types';

export function createSlackDestination(cfg: SlackConfig) {
  return {
    name: 'slack' as const,
    async send(payload: AlertPayload): Promise<DeliveryResult> {
      const body = {
        text: payload.title,
        blocks: [
          { type: 'header', text: { type: 'plain_text', text: payload.title } },
          { type: 'section', text: { type: 'mrkdwn', text: payload.body } },
        ],
      };
      try {
        const res = await fetch(cfg.url, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(body),
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
