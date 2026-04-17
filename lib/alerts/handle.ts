import { eq } from 'drizzle-orm';
import { getDb } from '../db/client';
import { type Alert, alerts, type Measurement } from '../db/schema';
import { broadcastAlert } from '../ws/broadcast';
import { loadAlertConfig } from './config';
import { buildDestinations } from './destinations';
import { dispatchAlert } from './dispatch';
import { evaluateAlerts } from './evaluate';
import { formatMessage } from './format';
import { getAlertRules } from './rules';
import { readAlertState } from './state';
import { computeFailureStreak } from './streak';
import type { AlertTransition } from './types';

export async function handleAlertsForMeasurement(measurement: Measurement): Promise<void> {
  const rules = getAlertRules();
  if (!rules.enabled) return;

  const state = readAlertState();
  const streakCount = computeFailureStreak();
  const transitions = evaluateAlerts({
    measurement,
    streakCount,
    currentState: state,
    rules,
  });
  if (transitions.length === 0) return;

  const cfg = loadAlertConfig();
  const destinations = buildDestinations(cfg);

  for (const transition of transitions) {
    const inserted = insertPendingAlert(transition, measurement.id);
    void dispatchAndUpdate(inserted, transition, destinations, rules);
  }
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
  destinations: ReturnType<typeof buildDestinations>,
  rules: ReturnType<typeof getAlertRules>,
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
  const updated = db
    .update(alerts)
    .set({ deliveryStatus })
    .where(eq(alerts.id, row.id))
    .returning()
    .get();
  broadcastAlert(updated);
}
