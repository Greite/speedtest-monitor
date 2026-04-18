// Preloaded by `bunfig.toml` whenever Bun's native test runner starts.
// We fail fast with a clear message because Bun does not yet support
// `better-sqlite3` (tracked at https://github.com/oven-sh/bun/issues/4290),
// and more than half of our suite is DB-backed.
//
// Use `bun run test` (which calls vitest under Node) for the full suite.
console.error(
  [
    '',
    '\x1b[31m`bun test` is not supported in this project.\x1b[0m',
    '',
    "Bun's native test runner cannot load the `better-sqlite3` native module,",
    'and ~half of the suite is DB-backed. Use the vitest script instead:',
    '',
    '  \x1b[36mbun run test\x1b[0m',
    '',
    '(Native support tracked at https://github.com/oven-sh/bun/issues/4290.)',
    '',
  ].join('\n'),
);
process.exit(1);
