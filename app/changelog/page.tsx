import { ArrowLeft, ExternalLink, GitCommit } from 'lucide-react';
import type { Metadata } from 'next';
import Link from 'next/link';
import { Markdown } from '@/components/markdown';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { loadReleases } from '@/lib/releases';
import { APP_VERSION, GITHUB_REPO_URL } from '@/lib/version';

export const runtime = 'nodejs';

export const metadata: Metadata = {
  title: 'Changelog - Speedtest Monitor',
  description: 'All released versions of Speedtest Monitor.',
};

const DATE_FMT = new Intl.DateTimeFormat('en-US', {
  year: 'numeric',
  month: 'short',
  day: 'numeric',
});

export default function ChangelogPage() {
  const releases = loadReleases();

  return (
    <main
      id="main"
      tabIndex={-1}
      className="mx-auto flex min-h-[100dvh] max-w-4xl scroll-mt-16 flex-col gap-8 px-4 py-6 outline-none md:px-6 md:py-8"
    >
      <header className="flex flex-col gap-4">
        <div className="flex items-center justify-between">
          <Link
            href="/"
            className="inline-flex items-center gap-1.5 text-sm text-muted-foreground transition-colors hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background rounded-sm"
          >
            <ArrowLeft className="size-4" aria-hidden />
            Back to dashboard
          </Link>
          <a
            href={`${GITHUB_REPO_URL}/releases`}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1.5 text-sm text-muted-foreground transition-colors hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background rounded-sm"
          >
            View on GitHub
            <ExternalLink className="size-3.5" aria-hidden />
          </a>
        </div>

        <div className="flex flex-col gap-2">
          <h1 className="text-2xl font-bold tracking-tight md:text-3xl">Changelog</h1>
          <p className="text-sm text-muted-foreground">
            All released versions of Speedtest Monitor, pulled from GitHub at build time.
          </p>
        </div>
      </header>

      {releases.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center gap-3 py-10 text-center">
            <GitCommit className="size-8 text-muted-foreground" aria-hidden />
            <p className="text-sm font-medium">No releases available</p>
            <p className="max-w-sm text-xs text-muted-foreground">
              Releases are fetched from GitHub during the build step. Run{' '}
              <code className="rounded bg-muted px-1.5 py-0.5 font-mono text-[0.85em]">
                bun run releases:fetch
              </code>{' '}
              to populate them locally.
            </p>
          </CardContent>
        </Card>
      ) : (
        <ol className="flex flex-col gap-6">
          {releases.map((r) => {
            const dateIso = new Date(r.date).toISOString();
            const dateLabel = DATE_FMT.format(new Date(r.date));
            const current = r.tag === APP_VERSION;
            return (
              <li key={r.tag}>
                <Card id={r.tag} className="scroll-mt-20">
                  <CardHeader>
                    <div className="flex flex-wrap items-center gap-2">
                      <CardTitle as="h2" className="text-xl font-bold tracking-tight">
                        <a
                          href={r.url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="hover:text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background rounded-sm"
                        >
                          {r.name}
                        </a>
                      </CardTitle>
                      {current ? (
                        <Badge variant="default" aria-label="Current version">
                          Current
                        </Badge>
                      ) : null}
                    </div>
                    <div className="flex items-center gap-2 text-xs text-muted-foreground">
                      <time dateTime={dateIso}>{dateLabel}</time>
                      <span aria-hidden>&middot;</span>
                      <span className="font-mono tabular-nums">{r.tag}</span>
                    </div>
                  </CardHeader>
                  <CardContent>
                    {r.body.trim().length === 0 ? (
                      <p className="text-sm italic text-muted-foreground">No release notes.</p>
                    ) : (
                      <Markdown source={r.body} />
                    )}
                  </CardContent>
                </Card>
              </li>
            );
          })}
        </ol>
      )}
    </main>
  );
}
