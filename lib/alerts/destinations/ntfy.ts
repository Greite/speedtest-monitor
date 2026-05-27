import type { NtfyConfig } from '../config';
import type { AlertPayload, DeliveryResult } from '../types';
import { httpDeliver } from './http';

export function createNtfyDestination(cfg: NtfyConfig) {
  return {
    name: 'ntfy' as const,
    send(payload: AlertPayload): Promise<DeliveryResult> {
      const headers: Record<string, string> = {
        'X-Title': payload.title,
        'X-Priority': payload.event === 'fired' ? 'urgent' : 'default',
        'X-Tags': payload.event === 'fired' ? 'warning,rotating_light' : 'white_check_mark',
      };
      if (cfg.token) {
        headers.Authorization = `Bearer ${cfg.token}`;
      }
      return httpDeliver(cfg.url, { headers, body: payload.body });
    },
  };
}
