import { describe, expect, it } from 'bun:test';
import { z } from 'zod';

const patchSchema = z
  .object({
    intervalMinutes: z.number().int().min(1).max(1440).optional(),
    retentionDays: z.number().int().min(1).max(3650).optional(),
  })
  .refine((data) => data.intervalMinutes !== undefined || data.retentionDays !== undefined, {
    message: 'at least one of intervalMinutes or retentionDays is required',
  });

describe('PATCH /api/settings schema', () => {
  it('accepts intervalMinutes values in [1, 1440]', () => {
    expect(patchSchema.safeParse({ intervalMinutes: 1 }).success).toBe(true);
    expect(patchSchema.safeParse({ intervalMinutes: 720 }).success).toBe(true);
    expect(patchSchema.safeParse({ intervalMinutes: 1440 }).success).toBe(true);
  });

  it('rejects out-of-range intervalMinutes', () => {
    expect(patchSchema.safeParse({ intervalMinutes: 0 }).success).toBe(false);
    expect(patchSchema.safeParse({ intervalMinutes: -5 }).success).toBe(false);
    expect(patchSchema.safeParse({ intervalMinutes: 1441 }).success).toBe(false);
  });

  it('rejects non-integer intervalMinutes', () => {
    expect(patchSchema.safeParse({ intervalMinutes: 1.5 }).success).toBe(false);
    expect(patchSchema.safeParse({ intervalMinutes: '15' }).success).toBe(false);
  });

  it('accepts retentionDays values in [1, 3650]', () => {
    expect(patchSchema.safeParse({ retentionDays: 1 }).success).toBe(true);
    expect(patchSchema.safeParse({ retentionDays: 90 }).success).toBe(true);
    expect(patchSchema.safeParse({ retentionDays: 3650 }).success).toBe(true);
  });

  it('rejects out-of-range retentionDays', () => {
    expect(patchSchema.safeParse({ retentionDays: 0 }).success).toBe(false);
    expect(patchSchema.safeParse({ retentionDays: -1 }).success).toBe(false);
    expect(patchSchema.safeParse({ retentionDays: 3651 }).success).toBe(false);
  });

  it('accepts both fields together', () => {
    expect(patchSchema.safeParse({ intervalMinutes: 15, retentionDays: 30 }).success).toBe(true);
  });

  it('rejects empty object (at least one field required)', () => {
    expect(patchSchema.safeParse({}).success).toBe(false);
  });
});
