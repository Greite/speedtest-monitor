import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import mjml2html from 'mjml';

const ROOT = join(import.meta.dir, '..');
const SRC = join(ROOT, 'lib/alerts/templates/alert-email.mjml');
const OUT = join(ROOT, 'lib/alerts/templates/alert-email.html.ts');

const mjmlSource = readFileSync(SRC, 'utf8');
let html: string;
try {
  const result = await mjml2html(mjmlSource, {
    validationLevel: 'strict',
    minify: false,
    keepComments: true,
  });
  html = result.html;
} catch (err) {
  console.error(err instanceof Error ? err.message : String(err));
  process.exit(1);
}

const banner =
  '// Generated from alert-email.mjml by scripts/build-email-templates.ts\n// Run `bun run build:email` after editing the MJML source.\n\n';
const body = `export const ALERT_EMAIL_HTML = ${JSON.stringify(html)};\n`;

mkdirSync(dirname(OUT), { recursive: true });
writeFileSync(OUT, banner + body, 'utf8');
console.log(`Wrote ${OUT} (${html.length} chars)`);
