import { describe, expect, it } from 'bun:test';
import { parseTableQuery } from './measurements-query';

function qs(obj: Record<string, string>): URLSearchParams {
  return new URLSearchParams(obj);
}

describe('parseTableQuery', () => {
  it('applies defaults when no params are provided', () => {
    const q = parseTableQuery(qs({}));
    expect(q).toEqual({
      page: 1,
      pageSize: 25,
      sort: 'timestamp',
      sortDir: 'desc',
      filters: {},
    });
  });

  it('parses page and pageSize within bounds', () => {
    const q = parseTableQuery(qs({ page: '3', pageSize: '50' }));
    expect(q.page).toBe(3);
    expect(q.pageSize).toBe(50);
  });

  it('rejects pageSize values not in allowed set', () => {
    expect(() => parseTableQuery(qs({ pageSize: '9999' }))).toThrow();
  });

  it('rejects invalid sort columns', () => {
    expect(() => parseTableQuery(qs({ sort: 'drop_table' }))).toThrow();
  });

  it('parses numeric range filters', () => {
    const q = parseTableQuery(qs({ downloadMin: '100', downloadMax: '500', latencyMin: '10' }));
    expect(q.filters.download).toEqual({ min: 100, max: 500 });
    expect(q.filters.latency).toEqual({ min: 10 });
  });

  it('parses timestamp range (ms epoch)', () => {
    const q = parseTableQuery(qs({ timeFrom: '1700000000000', timeTo: '1800000000000' }));
    expect(q.filters.time).toEqual({ from: 1700000000000, to: 1800000000000 });
  });

  it('parses server contains and trims it', () => {
    const q = parseTableQuery(qs({ server: '  Paris  ' }));
    expect(q.filters.server).toBe('Paris');
  });

  it('parses comma-separated status list and deduplicates', () => {
    const q = parseTableQuery(qs({ status: 'success,error,success' }));
    expect(q.filters.status).toEqual(['success', 'error']);
  });

  it('rejects unknown status values', () => {
    expect(() => parseTableQuery(qs({ status: 'nope' }))).toThrow();
  });

  it('ignores empty string filters rather than treating them as constraints', () => {
    const q = parseTableQuery(qs({ server: '', status: '' }));
    expect(q.filters.server).toBeUndefined();
    expect(q.filters.status).toBeUndefined();
  });
});
