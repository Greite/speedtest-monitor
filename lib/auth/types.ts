import type {} from 'next-auth';
import type {} from 'next-auth/jwt';

import type { UserRole } from '../db/schema';

export type { UserRole };

export type SessionUser = {
  id: string;
  email: string;
  name?: string | null;
  role: UserRole;
};

declare module 'next-auth' {
  interface User {
    role?: UserRole;
  }
  interface Session {
    user: {
      id?: string;
      email?: string | null;
      name?: string | null;
      role?: UserRole;
    };
  }
}

declare module 'next-auth/jwt' {
  interface JWT {
    role?: UserRole;
  }
}
