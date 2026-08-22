import { createServer, type IncomingMessage } from 'node:http';
import type { Duplex } from 'node:stream';

import next from 'next';
import { WebSocketServer } from 'ws';

import { auth } from './lib/auth/handler';
import { getTrustedOrigins } from './lib/auth/origins';
import { closeDb } from './lib/db/client';
import { logger } from './lib/logger';
import { bootScheduler, stopScheduler } from './lib/scheduler';
import { attachWsBroadcaster } from './lib/ws/server';

function toFetchHeaders(req: IncomingMessage): Headers {
  const headers = new Headers();
  for (const [name, value] of Object.entries(req.headers)) {
    if (Array.isArray(value)) {
      for (const v of value) {
        headers.append(name, v);
      }
    } else if (value !== undefined) {
      headers.set(name, value);
    }
  }
  return headers;
}

function rejectUpgrade(socket: Duplex, status: number, reason: string) {
  socket.write(`HTTP/1.1 ${status} ${reason}\r\nConnection: close\r\nContent-Length: 0\r\n\r\n`);
  socket.destroy();
}

const dev = process.env.NODE_ENV !== 'production';
const hostname = process.env.HOSTNAME ?? '0.0.0.0';
const port = Number.parseInt(process.env.PORT ?? '3003', 10);

const app = next({ dev, hostname, port });

async function main() {
  await app.prepare();
  const handle = app.getRequestHandler();
  const upgradeHandler = app.getUpgradeHandler();

  const httpServer = createServer((req, res) => {
    handle(req, res);
  });

  // noServer: ws will not install its own upgrade listener — we route manually.
  const wss = new WebSocketServer({ noServer: true });
  attachWsBroadcaster(wss);

  const trustedOrigins = new Set(getTrustedOrigins());

  httpServer.on('upgrade', (req, socket, head) => {
    const url = req.url ?? '';
    const pathname = url.split('?')[0];
    if (pathname !== '/ws') {
      // Let Next.js handle its own HMR WebSocket in dev mode.
      upgradeHandler(req, socket, head);
      return;
    }

    // Reject cross-origin WebSocket hijacking attempts (browsers don't apply
    // CORS preflight to WS — cookies may be auto-attached from a malicious page).
    const origin = req.headers.origin;
    if (origin !== undefined && !trustedOrigins.has(origin)) {
      logger.warn(`[ws] rejected cross-origin upgrade from ${origin}`);
      rejectUpgrade(socket, 403, 'Forbidden');
      return;
    }

    // Require a valid Better-Auth session. Middleware (proxy.ts) does not run
    // for WS upgrades, so the gate must be enforced here. handleUpgrade() is
    // called synchronously - Bun's ws shim breaks when it runs after an await
    // (oven-sh/bun#39766) - and the session check happens on the upgraded
    // socket before it is handed to the broadcaster.
    wss.handleUpgrade(req, socket, head, async (ws) => {
      ws.on('error', () => {});
      let authed = false;
      try {
        const session = await auth.api.getSession({ headers: toFetchHeaders(req) });
        authed = Boolean(session?.user);
      } catch (err) {
        logger.warn('[ws] session check failed during upgrade', err);
      }
      if (!authed) {
        logger.debug('[ws] closed upgrade without valid session');
        ws.close(1008, 'Unauthorized');
        return;
      }
      wss.emit('connection', ws, req);
    });
  });

  await bootScheduler();

  httpServer.listen(port, hostname, () => {
    logger.info(`[server] speedtest-monitor ready on http://${hostname}:${port}`);
  });

  const shutdown = (signal: string) => {
    logger.info(`[server] received ${signal}, shutting down`);
    stopScheduler();
    wss.close();
    httpServer.close(() => {
      closeDb();
      process.exit(0);
    });
    setTimeout(() => process.exit(1), 10_000).unref();
  };

  process.on('SIGTERM', () => shutdown('SIGTERM'));
  process.on('SIGINT', () => shutdown('SIGINT'));
}

main().catch((err) => {
  logger.error('[server] fatal', err);
  process.exit(1);
});
