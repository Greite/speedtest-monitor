import { Dashboard } from '@/components/dashboard';
import { Header } from '@/components/header';
import { listMeasurements } from '@/lib/measurements';
import { toMeasurementDto } from '@/lib/types';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export default function Page() {
  const initial = listMeasurements('24h').map(toMeasurementDto);
  return (
    <main className="mx-auto flex min-h-screen max-w-6xl flex-col gap-6 px-6 py-8">
      <Header />
      <Dashboard initial={initial} />
    </main>
  );
}
