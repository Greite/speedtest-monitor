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
      className="mx-auto flex min-h-[100dvh] max-w-6xl scroll-mt-16 flex-col gap-6 px-4 py-6 outline-none md:px-6 md:py-8"
    >
      <header className="flex flex-col gap-3">
        <div className="flex items-end justify-between gap-4">
          <div className="flex flex-col gap-1">
            <span className="text-[11px] font-medium uppercase tracking-[0.18em] text-muted-foreground">
              Release history
            </span>
            <h1 className="text-2xl font-semibold tracking-tight sm:text-3xl">
              Changelog<span className="text-brand">.</span>
            </h1>
          </div>
          <div className="flex items-center gap-2">
            <Link
              href="/"
              className="inline-flex items-center gap-1.5 rounded-full border border-border/70 bg-card/40 px-3 py-1.5 text-xs font-medium text-muted-foreground transition-colors hover:bg-accent hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
            >
              <ArrowLeft className="size-3.5" aria-hidden />
              Back to dashboard
            </Link>
            <a
              href={`${GITHUB_REPO_URL}/releases`}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1.5 rounded-full border border-border/70 bg-card/40 px-3 py-1.5 text-xs font-medium text-muted-foreground transition-colors hover:bg-accent hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
            >
              View on GitHub
              <ExternalLink className="size-3.5" aria-hidden />
            </a>
          </div>
        </div>
      </header>

      {releases.length === 0 ? (
        <Card className="border-border/60 bg-card/80 backdrop-blur-sm">
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
        <ol className="relative flex flex-col gap-6 border-l border-border/50 pl-6 ml-2">
          {releases.map((r) => {
            const dateIso = new Date(r.date).toISOString();
            const dateLabel = DATE_FMT.format(new Date(r.date));
            const current = r.tag === APP_VERSION;
            return (
              <li key={r.tag} className="relative">
                {/* Timeline node */}
                <span
                  aria-hidden
                  className={
                    current
                      ? 'absolute -left-[33px] top-7 grid size-3.5 place-items-center rounded-full bg-background'
                      : 'absolute -left-[31px] top-7 size-2 rounded-full bg-border'
                  }
                >
                  {current ? (
                    <>
                      <span className="size-3.5 rounded-full bg-brand" />
                      <span className="pulse-ring absolute inset-0 rounded-full text-brand" />
                    </>
                  ) : null}
                </span>
                <Card
                  id={r.tag}
                  className="scroll-mt-20 border-border/60 bg-card/80 backdrop-blur-sm transition-shadow hover:shadow-md"
                >
                  <CardHeader>
                    <div className="flex flex-wrap items-center gap-2">
                      <CardTitle as="h2" className="text-xl font-semibold tracking-tight">
                        <a
                          href={r.url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="rounded-sm hover:text-brand focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
                        >
                          {r.name}
                        </a>
                      </CardTitle>
                      {current ? (
                        <Badge
                          aria-label="Current version"
                          className="border-brand/30 bg-brand/10 text-brand hover:bg-brand/15"
                        >
                          <span className="size-1.5 rounded-full bg-brand" aria-hidden />
                          Current
                        </Badge>
                      ) : null}
                    </div>
                    <div className="flex items-center gap-2 font-mono text-[11px] text-muted-foreground">
                      <time dateTime={dateIso}>{dateLabel}</time>
                      <span aria-hidden className="text-border">
                        /
                      </span>
                      <span className="tabular-nums">{r.tag}</span>
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
