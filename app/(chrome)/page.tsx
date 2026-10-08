import { connection } from 'next/server';

import { Dashboard } from '@/components/dashboard';
import { isRange, listMeasurements, type Range } from '@/lib/measurements';
import { toMeasurementDto } from '@/lib/types';

// Server-rendered from live SQLite data on every request, by design.
export const instant = false;

export default async function Page({ searchParams }: { searchParams: Promise<{ range?: string }> }) {
  // `searchParams` alone does not keep the sync SQLite read (and its Date.now())
  // out of prerenders: Next resolves it during prefetch/validation renders.
  await connection();
  const { range: rangeParam } = await searchParams;
  const range: Range = rangeParam && isRange(rangeParam) ? rangeParam : '24h';
  const initial = listMeasurements(range).map(toMeasurementDto);
  return (
    <main
      id="main"
      tabIndex={-1}
      className="mx-auto flex min-h-[100dvh] max-w-6xl scroll-mt-16 flex-col gap-6 px-4 py-6 outline-none md:px-6 md:py-8"
    >
      <Dashboard initial={initial} initialRange={range} />
    </main>
  );
}
