import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';

const REPO = process.env.RELEASES_REPO ?? 'Greite/speedtest-monitor';
const OUT_PATH = resolve(process.cwd(), 'lib/generated/releases.json');

type GithubRelease = {
  tag_name: string;
  name: string | null;
  html_url: string;
  published_at: string | null;
  created_at: string;
  body: string | null;
  draft: boolean;
  prerelease: boolean;
};

export type Release = {
  tag: string;
  name: string;
  url: string;
  date: string;
  body: string;
  prerelease: boolean;
};

async function fetchAll(): Promise<Release[]> {
  const headers: Record<string, string> = {
    Accept: 'application/vnd.github+json',
    'X-GitHub-Api-Version': '2022-11-28',
    'User-Agent': 'speedtest-monitor-build',
  };
  if (process.env.GITHUB_TOKEN) {
    headers.Authorization = `Bearer ${process.env.GITHUB_TOKEN}`;
  }

  const out: Release[] = [];
  for (let page = 1; page <= 10; page++) {
    const res = await fetch(
      `https://api.github.com/repos/${REPO}/releases?per_page=100&page=${page}`,
      { headers },
    );
    if (!res.ok) {
      throw new Error(`GitHub API ${res.status}: ${await res.text()}`);
    }
    const batch = (await res.json()) as GithubRelease[];
    for (const r of batch) {
      if (r.draft) continue;
      out.push({
        tag: r.tag_name,
        name: r.name?.trim() || r.tag_name,
        url: r.html_url,
        date: r.published_at ?? r.created_at,
        body: r.body ?? '',
        prerelease: r.prerelease,
      });
    }
    if (batch.length < 100) break;
  }
  return out;
}

async function main() {
  mkdirSync(dirname(OUT_PATH), { recursive: true });
  try {
    const releases = await fetchAll();
    writeFileSync(OUT_PATH, JSON.stringify(releases, null, 2));
    console.log(`Wrote ${releases.length} release(s) to ${OUT_PATH}`);
  } catch (err) {
    console.warn(`fetch-releases: ${(err as Error).message}. Writing empty list.`);
    writeFileSync(OUT_PATH, JSON.stringify([], null, 2));
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
