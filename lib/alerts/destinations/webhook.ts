import type { WebhookConfig } from '../config';
import type { AlertPayload, DeliveryResult } from '../types';
import { httpDeliver } from './http';

export function createWebhookDestination(cfg: WebhookConfig) {
  return {
    name: 'webhook' as const,
    send(payload: AlertPayload): Promise<DeliveryResult> {
      return httpDeliver(cfg.url, {
        headers: { 'Content-Type': 'application/json', ...cfg.headers },
        body: JSON.stringify(payload),
      });
    },
  };
}
