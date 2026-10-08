import { toNextJsHandler } from 'better-auth/next-js';

import { auth } from '@/lib/auth/handler';

export const { GET, POST } = toNextJsHandler(auth);
