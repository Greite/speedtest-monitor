import type { AlertEvent, AlertKind, AlertPayload } from '../types';
import { ALERT_EMAIL_HTML } from './alert-email.html';

type Severity = 'fired' | 'recovered';

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function stripSection(html: string, marker: string): string {
  const re = new RegExp(`<!--${marker}:START-->[\\s\\S]*?<!--${marker}:END-->`, 'g');
  return html.replace(re, '');
}

function unitFor(kind: AlertKind): string {
  if (kind === 'download_below' || kind === 'upload_below') return 'Mbps';
  if (kind === 'latency_above' || kind === 'bufferbloat_above') return 'ms';
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
  if (event === 'resolved') return 'Service recovered';
  return kind === 'failure_streak' ? 'Connection degraded' : 'Threshold breached';
}

function formatTimestamp(ms: number): string {
  return new Date(ms).toLocaleString('sv-SE').replace('T', ' ');
}

export type RenderedEmail = {
  subject: string;
  text: string;
  html: string;
};

export function renderAlertEmail(payload: AlertPayload, publicUrl: string | null): RenderedEmail {
  const severity: Severity = payload.event === 'resolved' ? 'recovered' : 'fired';
  const severityIcon = severity === 'recovered' ? '✓' : '!';
  const label = severityLabel(payload.event, payload.kind);
  const sub = severitySubtitle(payload.kind, payload.event);
  const unit = unitFor(payload.kind);
  const timestamp = formatTimestamp(payload.timestamp);
  const showMetrics = payload.observed !== null && payload.threshold !== null;
  const showCta = !!publicUrl;

  const subject = `[Speedtest] ${payload.title}`;
  const textLines = [
    payload.body,
    '',
    `Alert ID: ${payload.alertId}`,
    `Kind: ${payload.kind}`,
    `Event: ${payload.event}`,
  ];
  if (publicUrl) textLines.push('', `Dashboard: ${publicUrl}`);
  const text = textLines.join('\n');

  let html = ALERT_EMAIL_HTML;
  if (!showMetrics) html = stripSection(html, 'METRICS');
  if (!showCta) html = stripSection(html, 'CTA');

  const observedStr = payload.observed !== null ? String(payload.observed) : '';
  const thresholdStr = payload.threshold !== null ? String(payload.threshold) : '';

  const replacements: Record<string, string> = {
    __TITLE__: escapeHtml(payload.title),
    __BODY__: escapeHtml(payload.body),
    __SEVERITY__: severity,
    __SEVERITY_LABEL__: escapeHtml(label),
    __SEVERITY_SUB__: escapeHtml(sub),
    __SEVERITY_ICON__: escapeHtml(severityIcon),
    __OBSERVED__: escapeHtml(observedStr),
    __OBSERVED_UNIT__: escapeHtml(unit),
    __THRESHOLD__: escapeHtml(thresholdStr),
    __THRESHOLD_UNIT__: escapeHtml(unit),
    __ALERT_ID__: escapeHtml(`#${payload.alertId}`),
    __KIND__: escapeHtml(payload.kind),
    __EVENT__: escapeHtml(payload.event),
    __DASHBOARD_URL__: escapeHtml(publicUrl ?? ''),
    __TIMESTAMP__: escapeHtml(timestamp),
  };

  for (const [key, value] of Object.entries(replacements)) {
    html = html.split(key).join(value);
  }

  return { subject, text, html };
}
