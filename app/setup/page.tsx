import { notFound } from 'next/navigation';

import { SetupForm } from '@/components/auth/setup-form';
import { countUsers } from '@/lib/auth/users';

export const dynamic = 'force-dynamic';

export default function SetupPage() {
  if (countUsers() !== 0) notFound();
  return <SetupForm />;
}
