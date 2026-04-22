import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

export type Release = {
  tag: string;
  name: string;
  url: string;
  date: string;
  body: string;
  prerelease: boolean;
};

export function loadReleases(): Release[] {
  try {
    const raw = readFileSync(resolve(process.cwd(), 'lib/generated/releases.json'), 'utf8');
    const parsed = JSON.parse(raw) as Release[];
    return parsed
      .filter((r) => !r.prerelease)
      .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
  } catch {
    return [];
  }
}
