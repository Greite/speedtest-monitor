import { describe, expect, it } from 'vitest';
import { z } from 'zod';

const patchSchema = z.object({
  intervalMinutes: z.number().int().min(1).max(1440),
});

describe('PATCH /api/settings schema', () => {
  it('accepts values in [1, 1440]', () => {
    expect(patchSchema.safeParse({ intervalMinutes: 1 }).success).toBe(true);
    expect(patchSchema.safeParse({ intervalMinutes: 720 }).success).toBe(true);
    expect(patchSchema.safeParse({ intervalMinutes: 1440 }).success).toBe(true);
  });

  it('rejects zero, negatives and values over 1440', () => {
    expect(patchSchema.safeParse({ intervalMinutes: 0 }).success).toBe(false);
    expect(patchSchema.safeParse({ intervalMinutes: -5 }).success).toBe(false);
    expect(patchSchema.safeParse({ intervalMinutes: 1441 }).success).toBe(false);
  });

  it('rejects non-integer and non-number', () => {
    expect(patchSchema.safeParse({ intervalMinutes: 1.5 }).success).toBe(false);
    expect(patchSchema.safeParse({ intervalMinutes: '15' }).success).toBe(false);
    expect(patchSchema.safeParse({}).success).toBe(false);
  });
});
