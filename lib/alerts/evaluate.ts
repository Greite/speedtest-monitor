import type { AlertKind, Measurement } from '../db/schema';
import type { AlertRules, AlertState, AlertTransition } from './types';

type Input = {
  measurement: Measurement;
  streakCount: number;
  currentState: AlertState;
  rules: AlertRules;
};

export function evaluateAlerts(input: Input): AlertTransition[] {
  const { measurement, streakCount, currentState, rules } = input;
  if (!rules.enabled) {
    return [];
  }
  const out: AlertTransition[] = [];
  const isSuccess = measurement.status === 'success';

  const transition = (kind: AlertKind, isBreach: boolean, observed: number | null, threshold: number | null) => {
    const current = currentState[kind];
    if (isBreach && current === 'OK') {
      out.push({ kind, event: 'fired', observed, threshold });
    } else if (!isBreach && current === 'ALERTING') {
      out.push({ kind, event: 'resolved', observed, threshold });
    }
  };

  const metrics: {
    kind: AlertKind;
    threshold: number | null;
    observed: number | null;
    breach: (o: number, t: number) => boolean;
  }[] = [
    {
      kind: 'download_below',
      threshold: rules.thresholds.downloadMbps,
      observed: measurement.downloadMbps,
      breach: (o, t) => o < t,
    },
    {
      kind: 'upload_below',
      threshold: rules.thresholds.uploadMbps,
      observed: measurement.uploadMbps,
      breach: (o, t) => o < t,
    },
    {
      kind: 'latency_above',
      threshold: rules.thresholds.latencyMs,
      observed: measurement.latencyUnloadedMs,
      breach: (o, t) => o > t,
    },
    {
      kind: 'bufferbloat_above',
      threshold: rules.thresholds.bufferBloatMs,
      observed: measurement.bufferBloatMs,
      breach: (o, t) => o > t,
    },
  ];
  for (const { kind, threshold, observed, breach } of metrics) {
    if (threshold === null || !isSuccess || observed === null) {
      continue;
    }
    transition(kind, breach(observed, threshold), observed, threshold);
  }

  if (rules.failureStreak !== null) {
    transition('failure_streak', streakCount >= rules.failureStreak, streakCount, rules.failureStreak);
  }

  return out;
}
