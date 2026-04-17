import { describe, expect, it, vi } from 'vitest';
import type { AlertPayload } from '../types';

const sendMailMock = vi.fn();
vi.mock('nodemailer', () => ({
  default: { createTransport: () => ({ sendMail: sendMailMock }) },
  createTransport: () => ({ sendMail: sendMailMock }),
}));

const { createSmtpDestination } = await import('./smtp');

const payload: AlertPayload = {
  event: 'fired', kind: 'download_below',
  title: 't', body: 'b', observed: 1, threshold: 2,
  timestamp: 0, measurementId: 1, alertId: 7,
};

describe('destinations/smtp', () => {
  it('sends mail with expected subject/from/to/body and dashboard link', async () => {
    sendMailMock.mockReset();
    sendMailMock.mockResolvedValue({ messageId: 'x' });
    const d = createSmtpDestination(
      {
        host: 'smtp', port: 587, secure: false,
        user: 'u', pass: 'p',
        from: 'Fastcom <a@b>',
        to: ['c@d', 'e@f'],
      },
      'https://dash',
    );
    const result = await d.send(payload);
    expect(result.ok).toBe(true);
    expect(sendMailMock).toHaveBeenCalledOnce();
    const opts = sendMailMock.mock.calls[0][0];
    expect(opts.subject).toBe('[Fastcom] t');
    expect(opts.from).toBe('Fastcom <a@b>');
    expect(opts.to).toBe('c@d, e@f');
    expect(opts.text).toContain('b');
    expect(opts.text).toContain('https://dash');
  });

  it('returns ok:false when sendMail throws', async () => {
    sendMailMock.mockReset();
    sendMailMock.mockRejectedValue(new Error('SMTP fail'));
    const d = createSmtpDestination(
      { host: 'h', port: 25, secure: false, from: 'a@b', to: ['c@d'] },
      null,
    );
    expect(await d.send(payload)).toEqual({ ok: false, error: 'SMTP fail' });
  });
});
