import { createServer } from 'node:http';
import next from 'next';
import { WebSocketServer } from 'ws';
import { closeDb } from './lib/db/client';
import { bootScheduler, stopScheduler } from './lib/scheduler';
import { attachWsBroadcaster } from './lib/ws/server';

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

  httpServer.on('upgrade', (req, socket, head) => {
    const url = req.url ?? '';
    const pathname = url.split('?')[0];
    if (pathname === '/ws') {
      wss.handleUpgrade(req, socket, head, (ws) => wss.emit('connection', ws, req));
      return;
    }
    // Let Next.js handle its own HMR WebSocket in dev mode.
    upgradeHandler(req, socket, head);
  });

  await bootScheduler();

  httpServer.listen(port, hostname, () => {
    console.log(`> speedtest-monitor ready on http://${hostname}:${port}`);
  });

  const shutdown = (signal: string) => {
    console.log(`\n[server] received ${signal}, shutting down…`);
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
  console.error('[server] fatal', err);
  process.exit(1);
});
