import { notFound } from 'next/navigation';
import { connection } from 'next/server';

import { SetupForm } from '@/components/auth/setup-form';
import { countUsers } from '@/lib/auth/users';

// Rendered per request from live SQLite data, by design.
export const instant = false;

export default async function SetupPage() {
  // Sync SQLite read: without this it would run once at build time.
  await connection();
  if (countUsers() !== 0) {
    notFound();
  }
  return <SetupForm />;
}
