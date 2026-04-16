# Contributing

Thanks for taking the time to contribute. This document describes how to set the project up locally, the checks that must pass before a PR is merged, and the conventions we follow.

## Prerequisites

- [Bun](https://bun.com) 1.3+ (package manager and script runner)
- Node.js 24 LTS (runtime)
- Docker 25+ with Compose v2 (only required to build/run the container)

Puppeteer downloads a matching Chrome for Testing binary on `bun install`. The first install will be slower and take ~500 MB under `~/.cache/puppeteer`.

## Local setup

```bash
bun install
bun run db:generate        # generate drizzle migrations from the schema
bun run dev                # tsx watch server.ts -> http://localhost:3000
```

A fresh SQLite database is created at `./fastcom.db` on the first run. Delete it if you want to start from scratch.

## Required checks

Every change must pass these four commands locally (and in CI):

```bash
bun run lint               # biome check
bun run typecheck          # tsc --noEmit
bun run test               # vitest run
bun run build              # next build + tsup
```

Unit tests live next to the code they cover (`**/*.test.ts`). Pure helpers go under `lib/` - keep tests there deterministic (no DB, no network).

## Code style

- Formatting and linting are enforced by [Biome 2](https://biomejs.dev). Run `bun run lint:fix` to auto-apply.
- TypeScript is strict; prefer `type` imports (`import type {...}`) to keep the bundle clean.
- Prefer small, focused components in `components/`; shared primitives live under `components/ui/` (shadcn).
- Dark mode styling uses semantic tokens (`bg-card`, `text-muted-foreground`, `text-speed-down`, `bg-latency-ok`, ...). Avoid raw Tailwind colors.

## Architecture quick map

- `server.ts` - custom Node server. Hosts Next.js and a `ws` WebSocket on the same port. Routes `/ws` upgrades to the app broadcaster and delegates every other upgrade to Next's HMR.
- `lib/scheduler/` - `node-cron` scheduler. Reprogrammable at runtime via `rescheduleFromSettings()` when the interval changes.
- `lib/fastcli/runner.ts` - spawns `fast-cli` (`fast --upload --json`) inside a `globalThis.__fastcomRunning` mutex.
- `lib/db/` - Drizzle schema + singleton client with WAL enabled.
- `lib/ws/` - WebSocket server + typed broadcasters consumed by the React hook in `components/use-live-measurements.ts`.
- `lib/types.ts` - single `toMeasurementDto()` serialiser used by the page SSR, the API routes, and the WS broadcaster so the client always receives the same shape.

## Commits

- One logical change per commit. Small, reviewable diffs are preferred.
- Follow Conventional Commits: `feat:`, `fix:`, `chore:`, `refactor:`, `docs:`, `test:`.
- Write the subject in the imperative and keep it short. Use the body to explain *why*, not *what* (the diff already says what).
- Do **not** use em-dashes. Plain hyphens only.
- Never commit generated artefacts, credentials, or local databases. `.gitignore` already covers the usual suspects - add more if you create new ones.

## Pull requests

1. Branch off `main`, keep your branch up to date with rebase (avoid merge commits).
2. Open a PR with a short summary and a "Test plan" checklist of what you verified.
3. Ensure the four checks above pass locally; CI runs the same commands.
4. Squash-merge is preferred to keep `main` linear.

## Mockups

UI iterations start from `mockups/dashboard.pen` (Pencil). When you change the visible layout in a non-trivial way, update the mockup in the same PR so design intent and code stay aligned.

## Reporting issues

Open a GitHub issue with:

- What you expected and what happened
- `bun --version`, `node --version`, OS/arch
- Relevant logs (`bun run dev` output, browser console, `docker compose logs fastcom`)
- A minimal repro if possible

## License

By contributing, you agree that your contributions will be licensed under the project's MIT license (see `LICENSE`).
