import type { AlertEvent, AlertKind } from '../db/schema';

export type { AlertEvent, AlertKind };

export type AlertRules = {
  enabled: boolean;
  thresholds: {
    downloadMbps: number | null;
    uploadMbps: number | null;
    latencyMs: number | null;
    bufferBloatMs: number | null;
  };
  failureStreak: number | null;
  destinations: {
    webhook: boolean;
    ntfy: boolean;
    discord: boolean;
    slack: boolean;
    smtp: boolean;
  };
};

export type DestinationName = keyof AlertRules['destinations'];

export type AlertPayload = {
  event: AlertEvent;
  kind: AlertKind;
  title: string;
  body: string;
  observed: number | null;
  threshold: number | null;
  timestamp: number;
  measurementId: number | null;
  alertId: number;
};

export type DeliveryResult = {
  ok: boolean;
  error?: string;
  httpStatus?: number;
};

export type AlertTransition = {
  kind: AlertKind;
  event: AlertEvent;
  observed: number | null;
  threshold: number | null;
};

export type AlertState = Record<AlertKind, 'OK' | 'ALERTING'>;

export const ALL_KINDS: AlertKind[] = [
  'download_below',
  'upload_below',
  'latency_above',
  'bufferbloat_above',
  'failure_streak',
];

export const DEFAULT_RULES: AlertRules = {
  enabled: false,
  thresholds: {
    downloadMbps: null,
    uploadMbps: null,
    latencyMs: null,
    bufferBloatMs: null,
  },
  failureStreak: null,
  destinations: {
    webhook: false,
    ntfy: false,
    discord: false,
    slack: false,
    smtp: false,
  },
};
