import { resolveDisplayConfig } from '../../runtime-config';
import type { AlertEvent, AlertKind, AlertPayload } from '../types';

type Severity = 'fired' | 'recovered';

function unitFor(kind: AlertKind): string {
  if (kind === 'download_below' || kind === 'upload_below') {
    return 'Mbps';
  }
  if (kind === 'latency_above' || kind === 'bufferbloat_above') {
    return 'ms';
  }
  return '';
}

function severitySubtitle(kind: AlertKind, event: AlertEvent): string {
  if (event === 'resolved') {
    switch (kind) {
      case 'download_below':
        return 'Download speed back above threshold';
      case 'upload_below':
        return 'Upload speed back above threshold';
      case 'latency_above':
        return 'Latency back below threshold';
      case 'bufferbloat_above':
        return 'Bufferbloat back below threshold';
      case 'failure_streak':
        return 'Measurements are succeeding again';
    }
  }
  switch (kind) {
    case 'download_below':
      return 'Download speed below expected level';
    case 'upload_below':
      return 'Upload speed below expected level';
    case 'latency_above':
      return 'Latency above expected level';
    case 'bufferbloat_above':
      return 'Bufferbloat above expected level';
    case 'failure_streak':
      return 'Multiple consecutive measurement failures';
  }
}

function severityLabel(event: AlertEvent, kind: AlertKind): string {
  if (event === 'resolved') {
    return 'Service recovered';
  }
  return kind === 'failure_streak' ? 'Connection degraded' : 'Threshold breached';
}

export function formatAlertTimestamp(ms: number): string {
  return new Date(ms).toLocaleString('sv-SE', { timeZone: resolveDisplayConfig().timeZone }).replace('T', ' ');
}

export type RenderedEmail = {
  subject: string;
  text: string;
  html: string;
};

export function renderAlertEmail(payload: AlertPayload, publicUrl: string | null): RenderedEmail {
  const severity: Severity = payload.event === 'resolved' ? 'recovered' : 'fired';
  const accent = severity === 'recovered' ? '#16a34a' : '#dc2626';
  const icon = severity === 'recovered' ? '✓' : '!';
  const label = severityLabel(payload.event, payload.kind);
  const sub = severitySubtitle(payload.kind, payload.event);
  const unit = unitFor(payload.kind);
  const timestamp = formatAlertTimestamp(payload.timestamp);
  const showMetrics = payload.observed !== null && payload.threshold !== null;
  const e = Bun.escapeHTML;

  const subject = `[Speedtest] ${payload.title}`;
  const textLines = [
    payload.body,
    '',
    `Alert ID: ${payload.alertId}`,
    `Kind: ${payload.kind}`,
    `Event: ${payload.event}`,
  ];
  if (publicUrl) {
    textLines.push('', `Dashboard: ${publicUrl}`);
  }
  const text = textLines.join('\n');

  const row = (k: string, v: string) => `
    <tr>
      <td style="padding:4px 12px 4px 0;color:#6b7280;font-size:12px;text-transform:uppercase;letter-spacing:.08em;">${k}</td>
      <td style="padding:4px 0;color:#111827;font-size:14px;font-weight:600;">${v}</td>
    </tr>`;

  const metricsHtml = showMetrics
    ? `<table role="presentation" cellpadding="0" cellspacing="0" style="margin:16px 0;">
        ${row('OBSERVED', `<span>${e(String(payload.observed))}</span> <span>${e(unit)}</span>`)}
        ${row('THRESHOLD', `<span>${e(String(payload.threshold))}</span> <span>${e(unit)}</span>`)}
      </table>`
    : '';

  const ctaHtml = publicUrl
    ? `<p style="margin:20px 0 0;">
        <a href="${e(publicUrl)}" style="display:inline-block;background:${accent};color:#ffffff;text-decoration:none;padding:10px 18px;border-radius:6px;font-size:14px;font-weight:600;">Open dashboard</a>
      </p>`
    : '';

  const html = `<!doctype html>
<html lang="en">
  <body style="margin:0;padding:24px;background:#f3f4f6;font-family:-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif;">
    <table role="presentation" cellpadding="0" cellspacing="0" width="100%" style="max-width:560px;margin:0 auto;background:#ffffff;border-radius:8px;border:1px solid #e5e7eb;">
      <tr>
        <td class="sev-${severity}" style="padding:20px 24px;border-bottom:3px solid ${accent};">
          <span style="display:inline-block;width:24px;height:24px;line-height:24px;text-align:center;border-radius:12px;background:${accent};color:#ffffff;font-weight:700;">${icon}</span>
          <span style="margin-left:8px;font-size:15px;font-weight:700;color:#111827;">${e(label)}</span>
          <div style="margin-top:4px;color:#6b7280;font-size:13px;">${e(sub)}</div>
        </td>
      </tr>
      <tr>
        <td style="padding:24px;">
          <h1 style="margin:0 0 8px;font-size:18px;color:#111827;">${e(payload.title)}</h1>
          <p style="margin:0;color:#374151;font-size:14px;line-height:1.6;">${e(payload.body)}</p>
          ${metricsHtml}
          <table role="presentation" cellpadding="0" cellspacing="0" style="margin-top:16px;">
            ${row('ALERT', e(`#${payload.alertId}`))}
            ${row('KIND', e(payload.kind))}
            ${row('EVENT', `<span class="pill-${severity}" style="display:inline-block;padding:2px 10px;border-radius:999px;font-weight:700;color:${accent};">${e(payload.event)}</span>`)}
            ${row('TIME', e(timestamp))}
          </table>
          ${ctaHtml}
        </td>
      </tr>
      <tr>
        <td style="padding:14px 24px;border-top:1px solid #e5e7eb;color:#9ca3af;font-size:12px;">Speedtest Monitor</td>
      </tr>
    </table>
  </body>
</html>`;

  return { subject, text, html };
}
