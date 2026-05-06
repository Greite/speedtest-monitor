import { ImageResponse } from 'next/og';

export const runtime = 'nodejs';
export const size = { width: 180, height: 180 };
export const contentType = 'image/png';

export default function AppleIcon() {
  // Apple touch icons render as opaque, square (rounded by iOS automatically).
  // Brand-toned background + centered mark (~70% safe area).
  return new ImageResponse(
    <div
      style={{
        width: '100%',
        height: '100%',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        background: 'linear-gradient(135deg, oklch(0.18 0.04 260) 0%, oklch(0.13 0.02 260) 100%)',
      }}
    >
      <svg viewBox="0 0 32 32" width={140} height={140}>
        <title>Speedtest Monitor</title>
        <defs>
          <linearGradient id="g" x1="0" y1="0" x2="1" y2="1">
            <stop offset="0%" stopColor="oklch(0.7 0.17 240)" />
            <stop offset="55%" stopColor="oklch(0.78 0.15 215)" />
            <stop offset="100%" stopColor="oklch(0.86 0.12 195)" />
          </linearGradient>
        </defs>
        <circle
          cx="16"
          cy="16"
          r="11"
          fill="none"
          stroke="url(#g)"
          strokeWidth="1.25"
          opacity="0.35"
        />
        <path
          d="M 8.22 23.78 A 11 11 0 1 1 23.78 23.78"
          fill="none"
          stroke="url(#g)"
          strokeWidth="2.5"
          strokeLinecap="round"
        />
        <line
          x1="16"
          y1="16"
          x2="22.5"
          y2="10.5"
          stroke="url(#g)"
          strokeWidth="2.25"
          strokeLinecap="round"
        />
        <circle cx="16" cy="16" r="2.4" fill="oklch(0.7 0.17 240)" />
        <circle cx="16" cy="16" r="0.85" fill="oklch(1 0 0)" opacity="0.95" />
      </svg>
    </div>,
    { ...size },
  );
}
