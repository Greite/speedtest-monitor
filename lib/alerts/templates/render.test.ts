import { describe, expect, it } from 'bun:test';
import type { AlertPayload } from '../types';
import { renderAlertEmail } from './render';

const base: AlertPayload = {
  event: 'fired',
  kind: 'download_below',
  title: 'Download dropped below 100 Mbps',
  body: 'Observed 42 Mbps at ... - threshold 100 Mbps.',
  observed: 42,
  threshold: 100,
  timestamp: Date.UTC(2026, 3, 23, 12, 30, 0),
  measurementId: 1,
  alertId: 1247,
};

describe('renderAlertEmail', () => {
  it('produces subject with [Speedtest] prefix and title', () => {
    const { subject } = renderAlertEmail(base, 'https://dash');
    expect(subject).toBe('[Speedtest] Download dropped below 100 Mbps');
  });

  it('produces plain text with body, kind, event and dashboard URL', () => {
    const { text } = renderAlertEmail(base, 'https://dash');
    expect(text).toContain(base.body);
    expect(text).toContain('Alert ID: 1247');
    expect(text).toContain('Kind: download_below');
    expect(text).toContain('Event: fired');
    expect(text).toContain('Dashboard: https://dash');
  });

  it('omits Dashboard line from text when publicUrl is null', () => {
    const { text } = renderAlertEmail(base, null);
    expect(text).not.toContain('Dashboard:');
  });

  it('substitutes placeholders and includes escaped title/body in html', () => {
    const { html } = renderAlertEmail(base, 'https://dash');
    expect(html).not.toContain('__TITLE__');
    expect(html).not.toContain('__BODY__');
    expect(html).toContain('Download dropped below 100 Mbps');
    expect(html).toContain('Speedtest Monitor');
    expect(html).toContain('https://dash');
  });

  it('includes metrics section when observed and threshold are set', () => {
    const { html } = renderAlertEmail(base, 'https://dash');
    expect(html).toContain('OBSERVED');
    expect(html).toContain('THRESHOLD');
    expect(html).toContain('>42<');
    expect(html).toContain('>100<');
    expect(html).toContain('Mbps');
  });

  it('strips metrics section when observed or threshold is null', () => {
    const { html } = renderAlertEmail({ ...base, observed: null, threshold: null }, 'https://dash');
    expect(html).not.toContain('OBSERVED');
    expect(html).not.toContain('THRESHOLD');
  });

  it('strips CTA section when publicUrl is null', () => {
    const withCta = renderAlertEmail(base, 'https://dash').html;
    const withoutCta = renderAlertEmail(base, null).html;
    expect(withCta).toContain('Open dashboard');
    expect(withoutCta).not.toContain('Open dashboard');
    expect(withoutCta.length).toBeLessThan(withCta.length);
  });

  it('escapes HTML in user-controlled fields', () => {
    const { html } = renderAlertEmail(
      {
        ...base,
        title: 'Bad <script>alert(1)</script>',
        body: '"quoted" & <tag>',
      },
      null,
    );
    expect(html).not.toContain('<script>alert(1)</script>');
    expect(html).toContain('&lt;script&gt;alert(1)&lt;/script&gt;');
    expect(html).toContain('&quot;quoted&quot;');
    expect(html).toContain('&amp;');
    expect(html).toContain('&lt;tag&gt;');
  });

  it('uses ms unit for latency alerts', () => {
    const { html } = renderAlertEmail(
      { ...base, kind: 'latency_above', observed: 180, threshold: 50 },
      null,
    );
    expect(html).toContain('>ms<');
    expect(html).not.toContain('>Mbps<');
  });

  it('marks resolved event with recovered severity pill class', () => {
    const { html } = renderAlertEmail({ ...base, event: 'resolved' }, null);
    expect(html).toContain('pill-recovered');
    expect(html).toContain('sev-recovered');
  });

  it('marks fired event with fired severity pill class', () => {
    const { html } = renderAlertEmail(base, null);
    expect(html).toContain('pill-fired');
    expect(html).toContain('sev-fired');
  });
});
