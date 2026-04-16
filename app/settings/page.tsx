import Link from 'next/link';
import { Header } from '@/components/header';
import { SettingsForm } from '@/components/settings-form';
import { getEnvDefaultIntervalMinutes, getIntervalMinutes } from '@/lib/settings';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export default function SettingsPage() {
  const intervalMinutes = getIntervalMinutes();
  const envDefault = getEnvDefaultIntervalMinutes();

  return (
    <main className="mx-auto flex min-h-screen max-w-2xl flex-col gap-6 px-6 py-8">
      <Header />
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">Settings</h1>
        <Link href="/" className="text-sm text-muted-foreground hover:text-foreground">
          ← Back to dashboard
        </Link>
      </div>
      <SettingsForm initialMinutes={intervalMinutes} envDefault={envDefault} />
    </main>
  );
}
