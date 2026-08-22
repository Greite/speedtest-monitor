import type { WebSocket, WebSocketServer } from 'ws';

import type { WsEventDto } from '../types';

export type WsEvent = WsEventDto;

declare global {
  // Sockets that passed the session check in server.ts. `wss.clients` also
  // holds sockets still being authenticated, so broadcasts must not use it.
  var __speedtestWsClients: Set<WebSocket> | undefined;
}

export function attachWsBroadcaster(wss: WebSocketServer) {
  const clients = new Set<WebSocket>();
  globalThis.__speedtestWsClients = clients;

  wss.on('connection', (ws, _req) => {
    clients.add(ws);
    const interval = setInterval(() => {
      if (ws.readyState === ws.OPEN) {
        ws.ping();
      }
    }, 30_000);
    ws.on('close', (_code) => {
      clients.delete(ws);
      clearInterval(interval);
    });
    ws.on('error', (_err) => {
      clients.delete(ws);
      clearInterval(interval);
    });
  });
}

export function isWsReady(): { ok: true; clients: number } | { ok: false; error: string } {
  const clients = globalThis.__speedtestWsClients;
  if (!clients) {
    return { ok: false, error: 'ws server not attached' };
  }
  return { ok: true, clients: clients.size };
}

export function broadcast(event: WsEvent) {
  const clients = globalThis.__speedtestWsClients;
  if (!clients) {
    return;
  }
  const data = JSON.stringify(event);
  for (const client of clients) {
    if (client.readyState === 1 /* OPEN */) {
      client.send(data);
    }
  }
}
