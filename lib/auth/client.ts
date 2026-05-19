import { genericOAuthClient, inferAdditionalFields } from 'better-auth/client/plugins';
import { createAuthClient } from 'better-auth/react';

import type { auth } from './handler';

export const authClient = createAuthClient({
  plugins: [inferAdditionalFields<typeof auth>(), genericOAuthClient()],
});
