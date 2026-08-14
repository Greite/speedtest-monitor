// Server-only file logger with size-based rotation. Kept dependency-free for
// the same reason as env.ts (custom-server runtime graph).
import { appendFileSync, existsSync, mkdirSync, renameSync, statSync, unlinkSync } from 'node:fs';
import { join } from 'node:path';

import { envInt } from './env';

export type LogLevel = 'DEBUG' | 'INFO' | 'WARNING' | 'ERROR';

const LEVELS: readonly LogLevel[] = ['DEBUG', 'INFO', 'WARNING', 'ERROR'];

export type LoggerOptions = {
  dir: string;
  level: LogLevel;
  maxSizeBytes: number;
  /** Rotated files kept (app.log.1 … app.log.N) in addition to the active app.log. */
  maxFiles: number;
  /** Mirror lines to the console (docker logs). Off in tests. */
  mirror?: boolean;
};

export function createLogger(opts: LoggerOptions) {
  const file = join(opts.dir, 'app.log');
  const threshold = LEVELS.indexOf(opts.level);

  function rotateIfNeeded() {
    let size: number;
    try {
      size = statSync(file).size;
    } catch {
      return;
    }
    if (size < opts.maxSizeBytes) {
      return;
    }
    const oldest = `${file}.${opts.maxFiles}`;
    if (existsSync(oldest)) {
      unlinkSync(oldest);
    }
    for (let i = opts.maxFiles - 1; i >= 1; i--) {
      if (existsSync(`${file}.${i}`)) {
        renameSync(`${file}.${i}`, `${file}.${i + 1}`);
      }
    }
    renameSync(file, `${file}.1`);
  }

  function log(level: LogLevel, message: string, extra?: unknown) {
    if (LEVELS.indexOf(level) < threshold) {
      return;
    }
    const detail =
      extra === undefined ? '' : ` ${extra instanceof Error ? (extra.stack ?? extra.message) : JSON.stringify(extra)}`;
    const line = `${new Date().toISOString()} ${level.padEnd(7)} ${message}${detail}`;
    // ponytail: sync writes, fine at this volume (a few lines per measurement);
    // switch to a buffered stream if logging ever becomes hot-path.
    try {
      mkdirSync(opts.dir, { recursive: true });
      rotateIfNeeded();
      appendFileSync(file, `${line}\n`);
    } catch {
      // Logging must never take the app down.
    }
    if (opts.mirror !== false) {
      // biome-ignore lint/suspicious/noConsole: operator-facing mirror so `docker logs` keeps working
      (level === 'ERROR' ? console.error : console.log)(line);
    }
  }

  return {
    debug: (message: string, extra?: unknown) => log('DEBUG', message, extra),
    info: (message: string, extra?: unknown) => log('INFO', message, extra),
    warn: (message: string, extra?: unknown) => log('WARNING', message, extra),
    error: (message: string, extra?: unknown) => log('ERROR', message, extra),
  };
}

function envLevel(): LogLevel {
  const raw = process.env.SPEEDTEST_LOG_LEVEL?.toUpperCase();
  return LEVELS.includes(raw as LogLevel) ? (raw as LogLevel) : 'INFO';
}

export const logger = createLogger({
  dir: process.env.SPEEDTEST_LOG_DIR ?? 'logs',
  level: envLevel(),
  maxSizeBytes: envInt('SPEEDTEST_LOG_MAX_SIZE_MB', 5, 1, 1024) * 1024 * 1024,
  maxFiles: envInt('SPEEDTEST_LOG_MAX_FILES', 5, 1, 100),
});
