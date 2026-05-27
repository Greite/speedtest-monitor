import type { WebSocket, WebSocketServer } from 'ws';

import type { WsEventDto } from '../types';

export type WsEvent = WsEventDto;

declare global {
  var __speedtestWss: WebSocketServer | undefined;
}

export function attachWsBroadcaster(wss: WebSocketServer) {
  globalThis.__speedtestWss = wss;

  wss.on('connection', (ws, _req) => {
    const interval = setInterval(() => {
      if (ws.readyState === ws.OPEN) {
        ws.ping();
      }
    }, 30_000);
    ws.on('close', (_code) => {
      clearInterval(interval);
    });
    ws.on('error', (_err) => {
      clearInterval(interval);
    });
  });
}

export function isWsReady(): { ok: true; clients: number } | { ok: false; error: string } {
  const wss = globalThis.__speedtestWss;
  if (!wss) {
    return { ok: false, error: 'ws server not attached' };
  }
  return { ok: true, clients: wss.clients.size };
}

export function broadcast(event: WsEvent) {
  const wss = globalThis.__speedtestWss;
  if (!wss) {
    return;
  }
  const data = JSON.stringify(event);
  for (const client of wss.clients as Set<WebSocket>) {
    if (client.readyState === 1 /* OPEN */) {
      client.send(data);
    }
  }
}
