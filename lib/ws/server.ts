import type { WebSocket, WebSocketServer } from 'ws';
import type { MeasurementDto } from '../types';

export type WsEvent =
  | { type: 'measurement'; payload: MeasurementDto }
  | { type: 'running'; payload: { startedAt: number } }
  | { type: 'settings_updated'; payload: { intervalMinutes: number } };

declare global {
  // eslint-disable-next-line no-var
  var __fastcomWss: WebSocketServer | undefined;
}

export function attachWsBroadcaster(wss: WebSocketServer) {
  globalThis.__fastcomWss = wss;

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

export function broadcast(event: WsEvent) {
  const wss = globalThis.__fastcomWss;
  if (!wss) return;
  const data = JSON.stringify(event);
  for (const client of wss.clients as Set<WebSocket>) {
    if (client.readyState === 1 /* OPEN */) {
      client.send(data);
    }
  }
}
