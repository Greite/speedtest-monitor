import { cn } from '@/lib/utils';

type Props = {
  size?: number;
  className?: string;
};

/**
 * Custom speedometer mark: 270° arc gauge with a needle, centered in its
 * viewBox at (16,16) so it visually aligns with adjacent text.
 */
export function LogoMark({ size = 32, className }: Props) {
  const id = 'lm';
  return (
    <span
      aria-hidden
      className={cn('relative inline-flex shrink-0 items-center justify-center', className)}
      style={{ width: size, height: size }}
    >
      <svg viewBox="0 0 32 32" width={size} height={size} role="presentation" focusable="false">
        <defs>
          <linearGradient id={`${id}-stroke`} x1="0" y1="0" x2="1" y2="1">
            <stop offset="0%" stopColor="oklch(0.58 0.19 250)" />
            <stop offset="55%" stopColor="oklch(0.65 0.18 220)" />
            <stop offset="100%" stopColor="oklch(0.78 0.14 200)" />
          </linearGradient>
          <radialGradient id={`${id}-glow`} cx="50%" cy="50%" r="55%">
            <stop offset="0%" stopColor="oklch(0.7 0.18 230 / 0.45)" />
            <stop offset="100%" stopColor="oklch(0.7 0.18 230 / 0)" />
          </radialGradient>
        </defs>

        {/* Soft glow disc, perfectly centered */}
        <circle cx="16" cy="16" r="14" fill={`url(#${id}-glow)`} />

        {/* Faded full track */}
        <circle
          cx="16"
          cy="16"
          r="11"
          fill="none"
          stroke={`url(#${id}-stroke)`}
          strokeWidth="1.25"
          opacity="0.3"
        />

        {/* Main 270° gauge arc: from bottom-left to bottom-right, passing through top */}
        <path
          d="M 8.22 23.78 A 11 11 0 1 1 23.78 23.78"
          fill="none"
          stroke={`url(#${id}-stroke)`}
          strokeWidth="2.25"
          strokeLinecap="round"
        />

        {/* Needle pointing toward upper-right */}
        <line
          x1="16"
          y1="16"
          x2="22.5"
          y2="10.5"
          stroke={`url(#${id}-stroke)`}
          strokeWidth="2"
          strokeLinecap="round"
        />

        {/* Pivot dot */}
        <circle cx="16" cy="16" r="2.1" fill="oklch(0.58 0.19 250)" />
        <circle cx="16" cy="16" r="0.7" fill="oklch(1 0 0)" opacity="0.85" />
      </svg>
    </span>
  );
}
