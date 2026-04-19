import type { DiscordConfig } from '../config';
import type { AlertPayload, DeliveryResult } from '../types';

const RED = 15548997;
const GREEN = 5763719;

export function createDiscordDestination(cfg: DiscordConfig) {
  return {
    name: 'discord' as const,
    async send(payload: AlertPayload): Promise<DeliveryResult> {
      const body = {
        embeds: [
          {
            title: payload.title,
            description: payload.body,
            color: payload.event === 'fired' ? RED : GREEN,
            timestamp: new Date(payload.timestamp).toISOString(),
            footer: { text: 'speedtest-monitor' },
          },
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
