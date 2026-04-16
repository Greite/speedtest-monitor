import { Activity, Settings } from 'lucide-react';
import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { ThemeToggle } from './theme-toggle';

export function Header() {
  return (
    <header className="flex items-center justify-between gap-4 py-2">
      <Link href="/" className="flex items-center gap-2">
        <Activity className="size-5 text-chart-1" />
        <span className="text-xl font-bold tracking-tight">Fast.com Monitor</span>
      </Link>
      <div className="flex items-center gap-2">
        <Button variant="outline" size="icon" asChild aria-label="Settings">
          <Link href="/settings">
            <Settings />
          </Link>
        </Button>
        <ThemeToggle />
      </div>
    </header>
  );
}
