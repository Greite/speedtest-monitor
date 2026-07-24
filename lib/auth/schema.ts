import { z } from 'zod';

// html5Email pattern (permissive: no min-TLD-length rule) preserves behavior of the old regex,
// which existing tests rely on (e.g. single-letter TLDs like 'a@b.c').
export const emailSchema = z.email({ pattern: z.regexes.html5Email });
