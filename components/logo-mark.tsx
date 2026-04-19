import { Activity } from 'lucide-react';
import { cn } from '@/lib/utils';

type Props = {
  size?: number;
  className?: string;
};

export function LogoMark({ size = 32, className }: Props) {
  const radius = Math.round(size * 0.23);
  const iconSize = Math.round(size * 0.58);
  return (
    <span
      aria-hidden
      className={cn(
        'inline-flex shrink-0 items-center justify-center bg-gradient-to-br from-[#2563EB] to-[#06B6D4] shadow-sm shadow-cyan-500/30 dark:from-[#3B82F6] dark:to-[#22D3EE] dark:shadow-cyan-500/40',
        className,
      )}
      style={{ width: size, height: size, borderRadius: radius }}
    >
      <Activity
        strokeWidth={2.75}
        style={{ width: iconSize, height: iconSize }}
        className="text-white"
      />
    </span>
  );
}
