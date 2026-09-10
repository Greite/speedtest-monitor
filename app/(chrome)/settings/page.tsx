import { Banner } from '@astryxdesign/core/Banner';
import { ArrowLeft } from 'lucide-react';
import { headers } from 'next/headers';
import Link from 'next/link';

import { PasswordChangeCard } from '@/components/auth/password-change-card';
import { AlertsCard } from '@/components/settings/alerts-card';
import { SettingsForm } from '@/components/settings-form';
import { UsersCard } from '@/components/users/users-card';
import { auth } from '@/lib/auth/handler';
import {
  getEnvDefaultIntervalMinutes,
  getEnvDefaultRetentionDays,
  getIntervalMinutes,
  getRetentionDays,
} from '@/lib/settings';
import { pillLinkClasses } from '@/lib/utils';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export default async function SettingsPage() {
  const session = await auth.api.getSession({ headers: await headers() });
  const readOnly = (session?.user as { role?: 'admin' | 'viewer' } | undefined)?.role !== 'admin';
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
          <span className="label-eyebrow">Configuration</span>
          <h1 className="text-2xl font-semibold tracking-tight sm:text-3xl">
            Settings<span className="text-brand">.</span>
          </h1>
        </div>
        <Link href="/" className={pillLinkClasses}>
          <ArrowLeft className="size-3.5" aria-hidden />
          Back to dashboard
        </Link>
      </div>
      {readOnly ? (
        <Banner
          status="info"
          title="Limited permissions"
          description="Some settings are restricted to admins. You can still change your own password below."
        />
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
