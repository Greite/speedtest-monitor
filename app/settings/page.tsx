import Link from 'next/link';
import { PasswordChangeCard } from '@/components/auth/password-change-card';
import { AlertsCard } from '@/components/settings/alerts-card';
import { SettingsForm } from '@/components/settings-form';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { UsersCard } from '@/components/users/users-card';
import { auth } from '@/lib/auth/handler';
import {
  getEnvDefaultIntervalMinutes,
  getEnvDefaultRetentionDays,
  getIntervalMinutes,
  getRetentionDays,
} from '@/lib/settings';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export default async function SettingsPage() {
  const session = await auth();
  const readOnly = session?.user?.role !== 'admin';
  const intervalMinutes = getIntervalMinutes();
  const envDefaultMinutes = getEnvDefaultIntervalMinutes();
  const retentionDays = getRetentionDays();
  const envDefaultRetentionDays = getEnvDefaultRetentionDays();

  return (
    <main className="mx-auto flex min-h-screen max-w-6xl flex-col gap-6 px-6 py-8">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">Settings</h1>
        <Link href="/" className="text-sm text-muted-foreground hover:text-foreground">
          ← Back to dashboard
        </Link>
      </div>
      {readOnly ? (
        <Alert variant="default">
          <AlertTitle>Read-only mode</AlertTitle>
          <AlertDescription>You do not have permission to change settings.</AlertDescription>
        </Alert>
      ) : null}
      <PasswordChangeCard />
      <SettingsForm
        initialMinutes={intervalMinutes}
        envDefaultMinutes={envDefaultMinutes}
        initialRetentionDays={retentionDays}
        envDefaultRetentionDays={envDefaultRetentionDays}
      />
      <AlertsCard />
      <UsersCard />
    </main>
  );
}
