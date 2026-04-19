export type WebhookConfig = { url: string; headers: Record<string, string> };
export type NtfyConfig = { url: string; token?: string };
export type DiscordConfig = { url: string };
export type SlackConfig = { url: string };
export type SmtpConfig = {
  host: string;
  port: number;
  secure: boolean;
  user?: string;
  pass?: string;
  from: string;
  to: string[];
};

export type AlertConfig = {
  webhook: WebhookConfig | null;
  ntfy: NtfyConfig | null;
  discord: DiscordConfig | null;
  slack: SlackConfig | null;
  smtp: SmtpConfig | null;
  publicUrl: string | null;
};

function parseHeadersJson(raw: string | undefined): Record<string, string> {
  if (!raw) return {};
  try {
    const parsed = JSON.parse(raw);
    if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
      return Object.fromEntries(Object.entries(parsed).map(([k, v]) => [k, String(v)]));
    }
  } catch {
    console.warn('[alerts] SPEEDTEST_WEBHOOK_HEADERS is not valid JSON; ignoring');
  }
  return {};
}

function parseSmtp(): SmtpConfig | null {
  const host = process.env.SPEEDTEST_SMTP_HOST;
  const from = process.env.SPEEDTEST_SMTP_FROM;
  const toRaw = process.env.SPEEDTEST_SMTP_TO;
  if (!host || !from || !toRaw) return null;
  const portRaw = process.env.SPEEDTEST_SMTP_PORT ?? '587';
  const port = Number.parseInt(portRaw, 10);
  if (Number.isNaN(port)) return null;
  const secureRaw = process.env.SPEEDTEST_SMTP_SECURE ?? 'auto';
  const secure = secureRaw === 'true' ? true : secureRaw === 'false' ? false : port === 465;
  const to = toRaw
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
  return {
    host,
    port,
    secure,
    user: process.env.SPEEDTEST_SMTP_USER || undefined,
    pass: process.env.SPEEDTEST_SMTP_PASS || undefined,
    from,
    to,
  };
}

export function loadAlertConfig(): AlertConfig {
  const webhookUrl = process.env.SPEEDTEST_WEBHOOK_URL;
  const ntfyUrl = process.env.SPEEDTEST_NTFY_URL;
  const discordUrl = process.env.SPEEDTEST_DISCORD_WEBHOOK;
  const slackUrl = process.env.SPEEDTEST_SLACK_WEBHOOK;
  return {
    webhook: webhookUrl
      ? { url: webhookUrl, headers: parseHeadersJson(process.env.SPEEDTEST_WEBHOOK_HEADERS) }
      : null,
    ntfy: ntfyUrl ? { url: ntfyUrl, token: process.env.SPEEDTEST_NTFY_TOKEN || undefined } : null,
    discord: discordUrl ? { url: discordUrl } : null,
    slack: slackUrl ? { url: slackUrl } : null,
    smtp: parseSmtp(),
    publicUrl: process.env.SPEEDTEST_PUBLIC_URL || null,
  };
}
