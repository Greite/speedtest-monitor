import { ArrowLeft } from 'lucide-react';
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
    <main
      id="main"
      className="mx-auto flex min-h-[100dvh] max-w-6xl flex-col gap-6 px-4 py-6 md:px-6 md:py-8"
    >
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold tracking-tight">Settings</h1>
        <Link
          href="/"
          className="inline-flex items-center gap-1.5 text-sm text-muted-foreground transition-colors hover:text-foreground"
        >
          <ArrowLeft className="size-4" aria-hidden />
          Back to dashboard
        </Link>
      </div>
      {readOnly ? (
        <Alert variant="default">
          <AlertTitle>Limited permissions</AlertTitle>
          <AlertDescription>
            Some settings are restricted to admins. You can still change your own password below.
          </AlertDescription>
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
