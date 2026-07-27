import 'dotenv/config';
import type { Server } from 'node:http';
import { createApp } from './app.ts';
import {
  ensureRuntimeDirectories,
  mediaRoot,
  port,
  validateRuntimeConfiguration,
} from './core.ts';
import { ensureSchema } from './db.ts';
import {
  startDataRetentionMaintenance,
  stopDataRetentionMaintenance,
} from './services/data-retention.ts';
import {
  startTtsJobWorker,
  stopTtsJobWorker,
} from './services/tts-jobs.ts';

let server: Server | null = null;
let shutdownPromise: Promise<void> | null = null;

function readBoundedTimeout(name: string, fallback: number, minimum: number, maximum: number) {
  const configured = Number(process.env[name] ?? fallback);

  if (!Number.isFinite(configured)) {
    return fallback;
  }

  return Math.max(minimum, Math.min(maximum, Math.floor(configured)));
}

async function startServer() {
  validateRuntimeConfiguration();
  await ensureRuntimeDirectories();
  await ensureSchema();
  startDataRetentionMaintenance();
  await startTtsJobWorker();

  const app = createApp();
  server = app.listen(port, () => {
    console.log(`BANGLA SPEECH AI API running at http://127.0.0.1:${port}`);
    console.log(`Serving media from ${mediaRoot}`);
    console.log('PostgreSQL schema is ready.');
    console.log('TTS job worker coordination is running.');
  });
  const requestTimeoutMs = readBoundedTimeout(
    'HTTP_REQUEST_TIMEOUT_MS',
    300_000,
    30_000,
    600_000,
  );
  server.requestTimeout = requestTimeoutMs;
  server.headersTimeout = Math.min(
    requestTimeoutMs,
    readBoundedTimeout('HTTP_HEADERS_TIMEOUT_MS', 60_000, 10_000, 120_000),
  );
  server.keepAliveTimeout = readBoundedTimeout(
    'HTTP_KEEP_ALIVE_TIMEOUT_MS',
    5_000,
    1_000,
    30_000,
  );
  server.maxRequestsPerSocket = 100;

  server.on('error', (error) => {
    console.error('HTTP server failed.', error);
    process.exitCode = 1;
  });
}

function closeHttpServer() {
  return new Promise<void>((resolve, reject) => {
    if (!server) {
      resolve();
      return;
    }

    server.close((error) => {
      if (error) {
        reject(error);
        return;
      }

      resolve();
    });
    server.closeIdleConnections();
  });
}

function shutdown(signal: NodeJS.Signals) {
  if (shutdownPromise) {
    return shutdownPromise;
  }

  shutdownPromise = (async () => {
    console.log(`Received ${signal}; stopping cleanly.`);
    stopDataRetentionMaintenance();
    await closeHttpServer();
    await stopTtsJobWorker();
    await poolClose();
  })()
    .catch((error) => {
      console.error('Application shutdown failed.', error);
      process.exitCode = 1;
    });

  return shutdownPromise;
}

process.once('SIGTERM', () => {
  void shutdown('SIGTERM');
});
process.once('SIGINT', () => {
  void shutdown('SIGINT');
});

startServer().catch((error) => {
  console.error(
    'Application startup failed.',
    error instanceof Error ? error.message : error,
  );
  process.exitCode = 1;
  poolClose().catch(() => undefined);
});

async function poolClose() {
  const { pool } = await import('./db.ts');
  await pool.end();
}
