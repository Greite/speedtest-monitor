import { z } from 'zod';

export const emailSchema = z.string().regex(/^[^\s@]+@[^\s@]+\.[^\s@]+$/, 'Invalid email');
