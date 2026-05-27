import { type ClassValue, clsx } from 'clsx';
import { twMerge } from 'tailwind-merge';

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function envInt(name: string, fallback: number, min: number, max: number): number {
  const raw = process.env[name];
  if (!raw) {
    return fallback;
  }
  const n = Number.parseInt(raw, 10);
  if (Number.isNaN(n) || n < min || n > max) {
    return fallback;
  }
  return n;
}
