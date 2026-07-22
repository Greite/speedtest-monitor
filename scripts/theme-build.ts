// Runs the Astryx theme build then normalizes the generator timestamp so
// rebuilding with unchanged tokens produces a zero diff (the CLI stamps
// each output with a build date, which polluted git history).
import { $ } from 'bun';

const OUTPUTS = ['lib/speedtest.css', 'lib/speedtest.js', 'lib/speedtest.d.ts', 'lib/speedtest.variants.d.ts'];

await $`bunx astryx theme build lib/astryx-theme.ts`;

for (const path of OUTPUTS) {
  const file = Bun.file(path);
  if (!(await file.exists())) {
    continue;
  }
  const text = await file.text();
  // Conservative match: only rewrite from "Generated:" to end of line,
  // keeping each file type's comment syntax intact.
  const normalized = text.replace(/Generated:.*$/m, 'Generated: by scripts/theme-build.ts (timestamp normalized)');
  if (normalized !== text) {
    await Bun.write(path, normalized);
  }
}
