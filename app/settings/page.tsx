import Link from 'next/link';
import { PasswordChangeCard } from '@/components/auth/password-change-card';
import { Header } from '@/components/header';
import { AlertsCard } from '@/components/settings/alerts-card';
import { SettingsForm } from '@/components/settings-form';
import {
  getEnvDefaultIntervalMinutes,
  getEnvDefaultRetentionDays,
  getIntervalMinutes,
  getRetentionDays,
} from '@/lib/settings';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export default function SettingsPage() {
  const intervalMinutes = getIntervalMinutes();
  const envDefaultMinutes = getEnvDefaultIntervalMinutes();
  const retentionDays = getRetentionDays();
  const envDefaultRetentionDays = getEnvDefaultRetentionDays();

  return (
    <main className="mx-auto flex min-h-screen max-w-6xl flex-col gap-6 px-6 py-8">
      <Header />
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">Settings</h1>
        <Link href="/" className="text-sm text-muted-foreground hover:text-foreground">
          ← Back to dashboard
        </Link>
      </div>
      <PasswordChangeCard />
      <SettingsForm
        initialMinutes={intervalMinutes}
        envDefaultMinutes={envDefaultMinutes}
        initialRetentionDays={retentionDays}
        envDefaultRetentionDays={envDefaultRetentionDays}
      />
      <AlertsCard />
    </main>
  );
}
