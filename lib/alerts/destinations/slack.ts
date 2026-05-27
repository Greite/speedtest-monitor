import type { SlackConfig } from '../config';
import type { AlertPayload, DeliveryResult } from '../types';
import { httpDeliver } from './http';

export function createSlackDestination(cfg: SlackConfig) {
  return {
    name: 'slack' as const,
    send(payload: AlertPayload): Promise<DeliveryResult> {
      const body = {
        text: payload.title,
        blocks: [
          { type: 'header', text: { type: 'plain_text', text: payload.title } },
          { type: 'section', text: { type: 'mrkdwn', text: payload.body } },
        ],
      };
      return httpDeliver(cfg.url, {
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
    },
  };
}
