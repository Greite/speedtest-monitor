'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import type { MeasurementDto, WsEventDto } from '@/lib/types';

type Range = '1h' | '6h' | '24h' | '7d' | '30d';

type State = {
  measurements: MeasurementDto[];
  running: boolean;
  lastRunStartedAt: number | null;
  connected: boolean;
};

function fetchMeasurements(range: Range): Promise<MeasurementDto[]> {
  return fetch(`/api/measurements?range=${range}`, { cache: 'no-store' })
    .then((r) => r.json())
    .then((body: { measurements: MeasurementDto[] }) => body.measurements ?? []);
}

function wsUrl() {
  if (typeof window === 'undefined') return '';
  const proto = window.location.protocol === 'https:' ? 'wss' : 'ws';
  return `${proto}://${window.location.host}/ws`;
}

export function useLiveMeasurements(initial: MeasurementDto[], range: Range = '24h') {
  const [state, setState] = useState<State>({
    measurements: initial,
    running: false,
    lastRunStartedAt: null,
    connected: false,
  });

  const handleMeasurement = useCallback((m: MeasurementDto) => {
    setState((prev) => {
      if (prev.measurements.some((x) => x.id === m.id)) return { ...prev, running: false };
      return {
        ...prev,
        running: false,
        measurements: [m, ...prev.measurements].slice(0, 500),
      };
    });
  }, []);

  const refetch = useCallback(async () => {
    try {
      const rows = await fetchMeasurements(range);
      setState((prev) => ({ ...prev, measurements: rows }));
    } catch {
      /* ignore */
    }
  }, [range]);

  // Refetch when range changes (even without a socket event).
  useEffect(() => {
    refetch();
  }, [refetch]);

  const currentWsRef = useRef<WebSocket | null>(null);

  useEffect(() => {
    // Per-effect lifecycle. Strict-mode double-mount creates two effects:
    // each owns its own `cancelled` flag + socket, and its close handler
    // only flips state when that socket is still the current one.
    let cancelled = false;
    let retries = 0;
    let socket: WebSocket | null = null;
    let reconnectTimer: ReturnType<typeof setTimeout> | null = null;

    const connect = () => {
      if (cancelled) return;
      socket = new WebSocket(wsUrl());
      currentWsRef.current = socket;
      const thisSocket = socket;

      thisSocket.addEventListener('open', () => {
        if (cancelled || currentWsRef.current !== thisSocket) return;
        retries = 0;
        setState((prev) => ({ ...prev, connected: true }));
        refetch();
      });

      thisSocket.addEventListener('message', (ev) => {
        if (cancelled || currentWsRef.current !== thisSocket) return;
        try {
          const event = JSON.parse(ev.data as string) as WsEventDto;
          if (event.type === 'measurement') handleMeasurement(event.payload);
          else if (event.type === 'running')
            setState((prev) => ({
              ...prev,
              running: true,
              lastRunStartedAt: event.payload.startedAt,
            }));
        } catch {
          /* ignore */
        }
      });

      thisSocket.addEventListener('close', () => {
        if (cancelled) return;
        if (currentWsRef.current !== thisSocket) return;
        setState((prev) => ({ ...prev, connected: false }));
        const backoff = Math.min(30_000, 1000 * 2 ** retries);
        retries += 1;
        reconnectTimer = setTimeout(connect, backoff);
      });

      thisSocket.addEventListener('error', () => thisSocket.close());
    };

    connect();

    return () => {
      cancelled = true;
      if (reconnectTimer) clearTimeout(reconnectTimer);
      if (socket && currentWsRef.current === socket) currentWsRef.current = null;
      socket?.close();
    };
  }, [handleMeasurement, refetch]);

  const triggerRun = useCallback(async () => {
    setState((prev) => ({ ...prev, running: true, lastRunStartedAt: Date.now() }));
    const res = await fetch('/api/measurements/run', { method: 'POST' });
    if (!res.ok) {
      setState((prev) => ({ ...prev, running: false }));
      const body = (await res.json().catch(() => ({}))) as { error?: string };
      throw new Error(body.error ?? `HTTP ${res.status}`);
    }
    const body = (await res.json()) as { measurement: MeasurementDto };
    handleMeasurement(body.measurement);
    return body.measurement;
  }, [handleMeasurement]);

  return { ...state, triggerRun };
}
