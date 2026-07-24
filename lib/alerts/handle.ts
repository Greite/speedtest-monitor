import { desc, eq } from 'drizzle-orm';

import { getDb } from '../db/client';
import { type Alert, type AlertKind, alerts, type Measurement, measurements } from '../db/schema';
import { loadAlertConfig } from './config';
import { buildDestinations, type Destination } from './destinations';
import { evaluateAlerts } from './evaluate';
import { getAlertRules } from './rules';
import { formatAlertTimestamp } from './templates/render';
import {
  ALL_KINDS,
  type AlertPayload,
  type AlertRules,
  type AlertState,
  type AlertTransition,
  type DeliveryResult,
  type DestinationName,
} from './types';

const FAILURE_STREAK_LOOKBACK = 100;
const DEFAULT_TIMEOUT_MS = 10_000;

export async function handleAlertsForMeasurement(measurement: Measurement): Promise<void> {
  const rules = getAlertRules();
  if (!rules.enabled) {
    return;
  }

  const state = readAlertState();
  const streakCount = computeFailureStreak();
  const transitions = evaluateAlerts({
    measurement,
    streakCount,
    currentState: state,
    rules,
  });
  if (transitions.length === 0) {
    return;
  }

  const cfg = loadAlertConfig();
  const destinations = buildDestinations(cfg);

  for (const transition of transitions) {
    const inserted = insertPendingAlert(transition, measurement.id);
    void dispatchAndUpdate(inserted, transition, destinations, rules);
  }
}

export function readAlertState(): AlertState {
  const db = getDb();
  const state = Object.fromEntries(ALL_KINDS.map((k): [AlertKind, 'OK' | 'ALERTING'] => [k, 'OK'])) as AlertState;

  for (const kind of ALL_KINDS) {
    const last = db
      .select({ event: alerts.event })
      .from(alerts)
      .where(eq(alerts.kind, kind))
      .orderBy(desc(alerts.timestamp))
      .limit(1)
      .get();
    if (last?.event === 'fired') {
      state[kind] = 'ALERTING';
    }
  }

  return state;
}

export function computeFailureStreak(): number {
  const db = getDb();
  const rows = db
    .select({ status: measurements.status })
    .from(measurements)
    .orderBy(desc(measurements.timestamp))
    .limit(FAILURE_STREAK_LOOKBACK)
    .all();

  let streak = 0;
  for (const row of rows) {
    if (row.status === 'success') {
      break;
    }
    streak++;
  }
  return streak;
}

type FormatMessageInput = { transition: AlertTransition; timestamp: number };

export function formatMessage({ transition, timestamp }: FormatMessageInput): {
  title: string;
  body: string;
} {
  const { kind, event, observed, threshold } = transition;
  const when = formatAlertTimestamp(timestamp);

  if (kind === 'failure_streak') {
    if (event === 'fired') {
      return {
        title: `Speedtest: ${observed} consecutive measurement failures`,
        body: `${observed} consecutive failures as of ${when} (threshold: ${threshold}).`,
      };
    }
    return {
      title: 'Speedtest: Connection recovered',
      body: `Measurements are succeeding again as of ${when}.`,
    };
  }

  const metricLabels: Record<Exclude<typeof kind, 'failure_streak'>, string> = {
    download_below: 'Download',
    upload_below: 'Upload',
    latency_above: 'Latency',
    bufferbloat_above: 'Bufferbloat',
  };
  const metric = metricLabels[kind];
  const unit = kind === 'latency_above' || kind === 'bufferbloat_above' ? 'ms' : 'Mbps';
  const direction = kind === 'download_below' || kind === 'upload_below' ? 'dropped below' : 'rose above';

  if (event === 'fired') {
    return {
      title: `Speedtest: ${metric} ${direction} ${threshold} ${unit}`,
      body: `Observed ${observed} ${unit} at ${when} — threshold ${threshold} ${unit}.`,
    };
  }
  return {
    title: `Speedtest: ${metric} recovered`,
    body: `Back to ${observed} ${unit} at ${when} — threshold ${threshold} ${unit}.`,
  };
}

function withTimeout<T>(p: Promise<T>, ms: number, timeoutValue: T): Promise<T> {
  return Promise.race([p, new Promise<T>((resolve) => setTimeout(() => resolve(timeoutValue), ms))]);
}

type DispatchAlertInput = {
  payload: AlertPayload;
  destinations: Destination[];
  rules: AlertRules;
  timeoutMs?: number;
};

export async function dispatchAlert(
  input: DispatchAlertInput,
): Promise<Partial<Record<DestinationName, DeliveryResult>>> {
  const { payload, destinations, rules, timeoutMs = DEFAULT_TIMEOUT_MS } = input;
  const active = destinations.filter((d) => rules.destinations[d.name]);
  const results = await Promise.all(
    active.map(async (d) => {
      const r = await withTimeout<DeliveryResult>(
        d.send(payload).catch((err) => ({
          ok: false,
          error: err instanceof Error ? err.message : String(err),
        })),
        timeoutMs,
        { ok: false, error: 'timeout' },
      );
      return [d.name, r] as const;
    }),
  );
  return Object.fromEntries(results) as Partial<Record<DestinationName, DeliveryResult>>;
}

function insertPendingAlert(t: AlertTransition, measurementId: number): Alert {
  const db = getDb();
  return db
    .insert(alerts)
    .values({
      kind: t.kind,
      event: t.event,
      measurementId,
      threshold: t.threshold,
      observed: t.observed,
      deliveryStatus: {},
    })
    .returning()
    .get();
}

async function dispatchAndUpdate(
  row: Alert,
  transition: AlertTransition,
  destinations: Destination[],
  rules: AlertRules,
) {
  const { title, body } = formatMessage({
    transition,
    timestamp: row.timestamp.getTime(),
  });
  const deliveryStatus = await dispatchAlert({
    payload: {
      event: transition.event,
      kind: transition.kind,
      title,
      body,
      observed: transition.observed,
      threshold: transition.threshold,
      timestamp: row.timestamp.getTime(),
      measurementId: row.measurementId,
      alertId: row.id,
    },
    destinations,
    rules,
  });
  const db = getDb();
  db.update(alerts).set({ deliveryStatus }).where(eq(alerts.id, row.id)).run();
}
