import type { Measurement } from '../db/schema';
import type { AlertRules, AlertState, AlertTransition } from './types';

type Input = {
  measurement: Measurement;
  streakCount: number;
  currentState: AlertState;
  rules: AlertRules;
};

export function evaluateAlerts(input: Input): AlertTransition[] {
  const { measurement, streakCount, currentState, rules } = input;
  if (!rules.enabled) return [];
  const out: AlertTransition[] = [];
  const isSuccess = measurement.status === 'success';

  const check = (
    kind: AlertTransition['kind'],
    threshold: number | null,
    observed: number | null,
    isBreach: boolean,
    evaluable: boolean,
  ) => {
    if (threshold === null) return;
    if (!evaluable) return;
    const current = currentState[kind];
    if (isBreach && current === 'OK') {
      out.push({ kind, event: 'fired', observed, threshold });
    } else if (!isBreach && current === 'ALERTING') {
      out.push({ kind, event: 'resolved', observed, threshold });
    }
  };

  check(
    'download_below',
    rules.thresholds.downloadMbps,
    measurement.downloadMbps,
    isSuccess &&
      measurement.downloadMbps !== null &&
      rules.thresholds.downloadMbps !== null &&
      measurement.downloadMbps < rules.thresholds.downloadMbps,
    isSuccess && measurement.downloadMbps !== null,
  );
  check(
    'upload_below',
    rules.thresholds.uploadMbps,
    measurement.uploadMbps,
    isSuccess &&
      measurement.uploadMbps !== null &&
      rules.thresholds.uploadMbps !== null &&
      measurement.uploadMbps < rules.thresholds.uploadMbps,
    isSuccess && measurement.uploadMbps !== null,
  );
  check(
    'latency_above',
    rules.thresholds.latencyMs,
    measurement.latencyUnloadedMs,
    isSuccess &&
      measurement.latencyUnloadedMs !== null &&
      rules.thresholds.latencyMs !== null &&
      measurement.latencyUnloadedMs > rules.thresholds.latencyMs,
    isSuccess && measurement.latencyUnloadedMs !== null,
  );
  check(
    'bufferbloat_above',
    rules.thresholds.bufferBloatMs,
    measurement.bufferBloatMs,
    isSuccess &&
      measurement.bufferBloatMs !== null &&
      rules.thresholds.bufferBloatMs !== null &&
      measurement.bufferBloatMs > rules.thresholds.bufferBloatMs,
    isSuccess && measurement.bufferBloatMs !== null,
  );

  if (rules.failureStreak !== null) {
    const isBreach = streakCount >= rules.failureStreak;
    const current = currentState.failure_streak;
    if (isBreach && current === 'OK') {
      out.push({
        kind: 'failure_streak',
        event: 'fired',
        observed: streakCount,
        threshold: rules.failureStreak,
      });
    } else if (!isBreach && current === 'ALERTING') {
      out.push({
        kind: 'failure_streak',
        event: 'resolved',
        observed: streakCount,
        threshold: rules.failureStreak,
      });
    }
  }

  return out;
}
