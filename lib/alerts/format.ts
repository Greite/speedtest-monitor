import type { AlertTransition } from './types';

type Input = { transition: AlertTransition; timestamp: number };

function formatTime(ms: number): string {
  const d = new Date(ms);
  return d.toLocaleString('sv-SE').replace('T', ' ');
}

export function formatMessage({ transition, timestamp }: Input): {
  title: string;
  body: string;
} {
  const { kind, event, observed, threshold } = transition;
  const when = formatTime(timestamp);

  if (kind === 'failure_streak') {
    if (event === 'fired') {
      return {
        title: `Fastcom: ${observed} consecutive measurement failures`,
        body: `${observed} consecutive failures as of ${when} (threshold: ${threshold}).`,
      };
    }
    return {
      title: 'Fastcom: Connection recovered',
      body: `Measurements are succeeding again as of ${when}.`,
    };
  }

  const metric =
    kind === 'download_below'
      ? 'Download'
      : kind === 'upload_below'
        ? 'Upload'
        : kind === 'latency_above'
          ? 'Latency'
          : 'Bufferbloat';
  const unit = kind === 'latency_above' || kind === 'bufferbloat_above' ? 'ms' : 'Mbps';
  const direction =
    kind === 'download_below' || kind === 'upload_below' ? 'dropped below' : 'rose above';

  if (event === 'fired') {
    return {
      title: `Fastcom: ${metric} ${direction} ${threshold} ${unit}`,
      body: `Observed ${observed} ${unit} at ${when} — threshold ${threshold} ${unit}.`,
    };
  }
  return {
    title: `Fastcom: ${metric} recovered`,
    body: `Back to ${observed} ${unit} at ${when} — threshold ${threshold} ${unit}.`,
  };
}
