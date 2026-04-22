'use client';

import { usePathname } from 'next/navigation';
import { useEffect, useRef } from 'react';

export function FocusMainOnNavigate() {
  const pathname = usePathname();
  const initialPath = useRef(pathname);

  useEffect(() => {
    if (pathname === initialPath.current) return;
    const main = document.getElementById('main');
    if (!main) return;
    if (!main.hasAttribute('tabindex')) main.setAttribute('tabindex', '-1');
    main.focus({ preventScroll: true });
  }, [pathname]);

  return null;
}
