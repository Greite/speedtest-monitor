import type { ReactNode } from 'react';

import { Footer } from '@/components/footer';
import { Topbar } from '@/components/topbar';

export default function ChromeLayout({ children }: { children: ReactNode }) {
  return (
    <>
      <Topbar />
      {children}
      <Footer />
    </>
  );
}
