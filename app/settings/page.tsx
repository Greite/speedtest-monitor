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
      tabIndex={-1}
      className="mx-auto flex min-h-[100dvh] max-w-6xl scroll-mt-16 flex-col gap-6 px-4 py-6 outline-none md:px-6 md:py-8"
    >
      <div className="flex items-end justify-between gap-4">
        <div className="flex flex-col gap-1">
          <span className="text-[11px] font-medium uppercase tracking-[0.18em] text-muted-foreground">
            Configuration
          </span>
          <h1 className="text-2xl font-semibold tracking-tight sm:text-3xl">
            Settings<span className="text-brand">.</span>
          </h1>
        </div>
        <Link
          href="/"
          className="inline-flex items-center gap-1.5 rounded-full border border-border/70 bg-card/40 px-3 py-1.5 text-xs font-medium text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
        >
          <ArrowLeft className="size-3.5" aria-hidden />
          Back to dashboard
        </Link>
      </div>
      {readOnly ? (
        <Alert variant="default" className="border-border/60 bg-card/60 backdrop-blur-sm">
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
