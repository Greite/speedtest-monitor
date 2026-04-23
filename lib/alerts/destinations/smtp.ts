import nodemailer from 'nodemailer';
import type { SmtpConfig } from '../config';
import { renderAlertEmail } from '../templates/render';
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
