import { afterEach, expect, test } from 'bun:test';
import { mkdtempSync, readdirSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { createLogger } from './logger';

let dir: string;

afterEach(() => {
  rmSync(dir, { recursive: true, force: true });
});

test('filters below level and formats lines', () => {
  dir = mkdtempSync(join(tmpdir(), 'logger-'));
  const log = createLogger({ dir, level: 'WARNING', maxSizeBytes: 1024, maxFiles: 2, mirror: false });
  log.debug('hidden');
  log.info('hidden');
  log.warn('watch out');
  log.error('boom', new Error('cause'));

  const content = readFileSync(join(dir, 'app.log'), 'utf8');
  // The Error's stack is multi-line, so count entries by their timestamp prefix.
  const entries = content.split('\n').filter((l) => /^\d{4}-\d{2}-\d{2}T.+Z /.test(l));
  expect(entries).toHaveLength(2);
  expect(entries[0]).toMatch(/^\d{4}-\d{2}-\d{2}T.+Z WARNING watch out$/);
  expect(entries[1]).toContain('ERROR   boom');
  expect(content).toContain('cause');
  expect(content).not.toContain('hidden');
});

test('rotates at max size and keeps maxFiles rotated files', () => {
  dir = mkdtempSync(join(tmpdir(), 'logger-'));
  const log = createLogger({ dir, level: 'DEBUG', maxSizeBytes: 10, maxFiles: 2, mirror: false });
  for (let i = 1; i <= 5; i++) {
    log.info(`message number ${i}`);
  }

  expect(readdirSync(dir).sort()).toEqual(['app.log', 'app.log.1', 'app.log.2']);
  expect(readFileSync(join(dir, 'app.log'), 'utf8')).toContain('message number 5');
  expect(readFileSync(join(dir, 'app.log.1'), 'utf8')).toContain('message number 4');
});
