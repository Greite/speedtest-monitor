import type { AlertConfig } from '../config';
import type { AlertPayload, DeliveryResult, DestinationName } from '../types';
import { createDiscordDestination } from './discord';
import { createNtfyDestination } from './ntfy';
import { createSlackDestination } from './slack';
import { createSmtpDestination } from './smtp';
import { createWebhookDestination } from './webhook';

export type Destination = {
  name: DestinationName;
  send(p: AlertPayload): Promise<DeliveryResult>;
};

export function buildDestinations(cfg: AlertConfig): Destination[] {
  const dests: Destination[] = [];
  if (cfg.webhook) dests.push(createWebhookDestination(cfg.webhook));
  if (cfg.ntfy) dests.push(createNtfyDestination(cfg.ntfy));
  if (cfg.discord) dests.push(createDiscordDestination(cfg.discord));
  if (cfg.slack) dests.push(createSlackDestination(cfg.slack));
  if (cfg.smtp) dests.push(createSmtpDestination(cfg.smtp, cfg.publicUrl));
  return dests;
}

export function configuredNames(cfg: AlertConfig): Record<DestinationName, boolean> {
  return {
    webhook: cfg.webhook !== null,
    ntfy: cfg.ntfy !== null,
    discord: cfg.discord !== null,
    slack: cfg.slack !== null,
    smtp: cfg.smtp !== null,
  };
}
