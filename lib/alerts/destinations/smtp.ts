import nodemailer from 'nodemailer';
import type { SmtpConfig } from '../config';
import type { AlertPayload, DeliveryResult } from '../types';

export function createSmtpDestination(cfg: SmtpConfig, publicUrl: string | null) {
  const transporter = nodemailer.createTransport({
    host: cfg.host,
    port: cfg.port,
    secure: cfg.secure,
    auth: cfg.user ? { user: cfg.user, pass: cfg.pass ?? '' } : undefined,
  });
  return {
    name: 'smtp' as const,
    async send(payload: AlertPayload): Promise<DeliveryResult> {
      const lines = [
        payload.body,
        '',
        `Alert ID: ${payload.alertId}`,
        `Kind: ${payload.kind}`,
        `Event: ${payload.event}`,
      ];
      if (publicUrl) lines.push('', `Dashboard: ${publicUrl}`);
      try {
        await transporter.sendMail({
          from: cfg.from,
          to: cfg.to.join(', '),
          subject: `[Speedtest] ${payload.title}`,
          text: lines.join('\n'),
        });
        return { ok: true };
      } catch (err) {
        return { ok: false, error: err instanceof Error ? err.message : String(err) };
      }
    },
  };
}
