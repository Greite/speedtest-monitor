import { Dashboard } from '@/components/dashboard';
import type { Range } from '@/components/time-range-picker';
import { isRange, listMeasurements } from '@/lib/measurements';
import { toMeasurementDto } from '@/lib/types';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export default async function Page({
  searchParams,
}: {
  searchParams: Promise<{ range?: string }>;
}) {
  const { range: rangeParam } = await searchParams;
  const range: Range = rangeParam && isRange(rangeParam) ? rangeParam : '24h';
  const initial = listMeasurements(range).map(toMeasurementDto);
  return (
    <main
      id="main"
      className="mx-auto flex min-h-[100dvh] max-w-6xl flex-col gap-6 px-4 py-6 md:px-6 md:py-8"
    >
      <Dashboard initial={initial} initialRange={range} />
    </main>
  );
}
