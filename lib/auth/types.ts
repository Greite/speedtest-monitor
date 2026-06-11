import type { UserRole } from '../db/schema';

export type { UserRole };

export type SessionUser = {
  id: string;
  email: string;
  name?: string | null;
  role: UserRole;
  sessionId?: string;
};
