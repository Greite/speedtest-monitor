import type { DiscordConfig } from '../config';
import type { AlertPayload, DeliveryResult } from '../types';
import { httpDeliver } from './http';

const RED = 15548997;
const GREEN = 5763719;

export function createDiscordDestination(cfg: DiscordConfig) {
  return {
    name: 'discord' as const,
    send(payload: AlertPayload): Promise<DeliveryResult> {
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
      return httpDeliver(cfg.url, {
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
    },
  };
}
