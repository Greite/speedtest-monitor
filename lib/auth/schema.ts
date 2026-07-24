import { z } from 'zod';

// html5Email pattern (permissive: no min-TLD-length rule) preserves behavior of the old regex,
// which existing tests rely on (e.g. single-letter TLDs like 'a@b.c').
// Refine to still require a dot in the domain part, rejecting domain-less addresses like 'test@test' or 'user@localhost'.
export const emailSchema = z
  .email({ pattern: z.regexes.html5Email })
  .refine((v) => /@[^@\s]+\.[^@\s]+$/.test(v), 'Invalid email');
