import type { WebSocket, WebSocketServer } from 'ws';
import type { AlertEvent, AlertKind } from '../db/schema';
import type { MeasurementDto } from '../types';

export type AlertDto = {
  id: number;
  timestamp: number;
  kind: AlertKind;
  event: AlertEvent;
  measurementId: number | null;
  threshold: number | null;
  observed: number | null;
  deliveryStatus: Record<string, { ok: boolean; error?: string; httpStatus?: number }>;
};

export type WsEvent =
  | { type: 'measurement'; payload: MeasurementDto }
  | { type: 'running'; payload: { startedAt: number } }
  | { type: 'settings_updated'; payload: { intervalMinutes: number } }
  | { type: 'alert'; payload: AlertDto };

declare global {
  // eslint-disable-next-line no-var
  var __speedtestWss: WebSocketServer | undefined;
}

export function attachWsBroadcaster(wss: WebSocketServer) {
  globalThis.__speedtestWss = wss;

  wss.on('connection', (ws, req) => {
    console.log(`[ws] connected from ${req.socket.remoteAddress} (${wss.clients.size} clients)`);
    const interval = setInterval(() => {
      if (ws.readyState === ws.OPEN) ws.ping();
    }, 30_000);
    ws.on('close', (code) => {
      console.log(`[ws] closed code=${code} (${wss.clients.size} clients)`);
      clearInterval(interval);
    });
    ws.on('error', (err) => {
      console.log(`[ws] error: ${err.message}`);
      clearInterval(interval);
    });
  });
}

export function isWsReady(): { ok: true; clients: number } | { ok: false; error: string } {
  const wss = globalThis.__speedtestWss;
  if (!wss) return { ok: false, error: 'ws server not attached' };
  return { ok: true, clients: wss.clients.size };
}

export function broadcast(event: WsEvent) {
  const wss = globalThis.__speedtestWss;
  if (!wss) return;
  const data = JSON.stringify(event);
  for (const client of wss.clients as Set<WebSocket>) {
    if (client.readyState === 1 /* OPEN */) {
      client.send(data);
    }
  }
}
