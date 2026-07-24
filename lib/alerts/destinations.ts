import nodemailer from 'nodemailer';

import type { AlertConfig, DiscordConfig, NtfyConfig, SlackConfig, SmtpConfig, WebhookConfig } from './config';
import { renderAlertEmail } from './templates/render';
import type { AlertPayload, DeliveryResult, DestinationName } from './types';

export type Destination = {
  name: DestinationName;
  send(p: AlertPayload): Promise<DeliveryResult>;
};

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

export function createWebhookDestination(cfg: WebhookConfig): Destination {
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

export function createNtfyDestination(cfg: NtfyConfig): Destination {
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

const DISCORD_RED = 15548997;
const DISCORD_GREEN = 5763719;

export function createDiscordDestination(cfg: DiscordConfig): Destination {
  return {
    name: 'discord' as const,
    send(payload: AlertPayload): Promise<DeliveryResult> {
      const body = {
        embeds: [
          {
            title: payload.title,
            description: payload.body,
            color: payload.event === 'fired' ? DISCORD_RED : DISCORD_GREEN,
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

export function createSlackDestination(cfg: SlackConfig): Destination {
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

export function createSmtpDestination(cfg: SmtpConfig, publicUrl: string | null): Destination {
  const transporter = nodemailer.createTransport({
    host: cfg.host,
    port: cfg.port,
    secure: cfg.secure,
    auth: cfg.user ? { user: cfg.user, pass: cfg.pass ?? '' } : undefined,
  });
  return {
    name: 'smtp' as const,
    async send(payload: AlertPayload): Promise<DeliveryResult> {
      const { subject, text, html } = renderAlertEmail(payload, publicUrl);
      try {
        await transporter.sendMail({
          from: cfg.from,
          to: cfg.to.join(', '),
          subject,
          text,
          html,
        });
        return { ok: true };
      } catch (err) {
        return { ok: false, error: err instanceof Error ? err.message : String(err) };
      }
    },
  };
}

export function buildDestinations(cfg: AlertConfig): Destination[] {
  const dests: Destination[] = [];
  if (cfg.webhook) {
    dests.push(createWebhookDestination(cfg.webhook));
  }
  if (cfg.ntfy) {
    dests.push(createNtfyDestination(cfg.ntfy));
  }
  if (cfg.discord) {
    dests.push(createDiscordDestination(cfg.discord));
  }
  if (cfg.slack) {
    dests.push(createSlackDestination(cfg.slack));
  }
  if (cfg.smtp) {
    dests.push(createSmtpDestination(cfg.smtp, cfg.publicUrl));
  }
  return dests;
}
