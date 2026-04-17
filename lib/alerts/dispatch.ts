import type { Destination } from './destinations';
import type { AlertPayload, AlertRules, DeliveryResult, DestinationName } from './types';

const DEFAULT_TIMEOUT_MS = 10_000;

function withTimeout<T>(p: Promise<T>, ms: number, timeoutValue: T): Promise<T> {
  return Promise.race([
    p,
    new Promise<T>((resolve) => setTimeout(() => resolve(timeoutValue), ms)),
  ]);
}

type Input = {
  payload: AlertPayload;
  destinations: Destination[];
  rules: AlertRules;
  timeoutMs?: number;
};

export async function dispatchAlert(
  input: Input,
): Promise<Record<DestinationName, DeliveryResult>> {
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
  return Object.fromEntries(results) as Record<DestinationName, DeliveryResult>;
}
