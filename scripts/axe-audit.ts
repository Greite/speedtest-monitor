import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';

import type { AxeResults, ImpactValue, Result } from 'axe-core';
import puppeteer from 'puppeteer-core';

type ColorScheme = 'light' | 'dark';
type CookieArg = { name: string; value: string };

const DEFAULT_TAGS = ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'];
const USAGE = 'Usage: bun scripts/axe-audit.ts <url> [--scheme light|dark] [--cookie "name=value"]...';

// Authenticated pages: log in through a real browser, open DevTools > Application > Cookies,
// copy the better-auth session cookie value, then pass it through with --cookie, e.g.:
//   bun scripts/axe-audit.ts http://localhost:3003/settings --cookie "better-auth.session_token=<value>"

// Strict flag parsing - unknown flags are fatal (a typo like --schema
// silently auditing the wrong scheme is exactly what this script exists
// to prevent).
function parseArgs(argv: string[]): { url: string; scheme: ColorScheme; cookies: CookieArg[] } {
  let url: string | undefined;
  let scheme: ColorScheme = 'light';
  const cookies: CookieArg[] = [];
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--scheme') {
      const v = argv[++i];
      if (v !== 'light' && v !== 'dark') {
        throw new Error(`--scheme must be light|dark, got "${v}"`);
      }
      scheme = v;
    } else if (a === '--cookie') {
      const v = argv[++i] ?? '';
      const eq = v.indexOf('=');
      if (eq <= 0) {
        throw new Error(`--cookie expects "name=value", got "${v}"`);
      }
      cookies.push({ name: v.slice(0, eq), value: v.slice(eq + 1) });
    } else if (a.startsWith('-')) {
      throw new Error(`Unknown flag "${a}". ${USAGE}`);
    } else if (!url) {
      url = a;
    } else {
      throw new Error(`Unexpected argument "${a}"`);
    }
  }
  if (!url) {
    throw new Error(`Missing URL argument. ${USAGE}`);
  }
  return { url, scheme, cookies };
}

function findCachedChromeForTesting(): string | undefined {
  const root = join(homedir(), '.browser-driver-manager', 'chrome');
  if (!existsSync(root)) {
    return undefined;
  }
  for (const versionDir of readdirSync(root)) {
    const macArm = join(
      root,
      versionDir,
      'chrome-mac-arm64',
      'Google Chrome for Testing.app',
      'Contents',
      'MacOS',
      'Google Chrome for Testing',
    );
    if (existsSync(macArm)) {
      return macArm;
    }
    const macX64 = join(
      root,
      versionDir,
      'chrome-mac-x64',
      'Google Chrome for Testing.app',
      'Contents',
      'MacOS',
      'Google Chrome for Testing',
    );
    if (existsSync(macX64)) {
      return macX64;
    }
    const linux = join(root, versionDir, 'chrome-linux64', 'chrome');
    if (existsSync(linux)) {
      return linux;
    }
  }
  return undefined;
}

function resolveChromePath(): string {
  if (process.env.CHROME_PATH && existsSync(process.env.CHROME_PATH)) {
    return process.env.CHROME_PATH;
  }
  const cached = findCachedChromeForTesting();
  if (cached) {
    return cached;
  }
  const macChrome = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
  if (existsSync(macChrome)) {
    return macChrome;
  }
  for (const candidate of ['google-chrome-stable', 'google-chrome', 'chromium', 'chromium-browser']) {
    const linuxPath = `/usr/bin/${candidate}`;
    if (existsSync(linuxPath)) {
      return linuxPath;
    }
  }
  throw new Error('No Chrome binary found. Set the CHROME_PATH env var to a Chrome / Chrome-for-Testing executable.');
}

function impactRank(impact: ImpactValue | null | undefined): number {
  const order: Record<string, number> = { minor: 0, moderate: 1, serious: 2, critical: 3 };
  return impact ? (order[impact] ?? -1) : -1;
}

function printResults(results: Result[], label: string) {
  if (results.length === 0) {
    console.log(`${label}: none`);
    return;
  }
  const sorted = [...results].sort((a, b) => impactRank(b.impact) - impactRank(a.impact));
  for (const violation of sorted) {
    console.log(`${label}: ${violation.id} (${violation.impact ?? 'unknown'}) - ${violation.help}`);
    for (const node of violation.nodes) {
      console.log(`  target: ${node.target.join(' ')}`);
    }
  }
}

// Reconstructs the scheme-forcing harness from phase-3 task-3: bunx @axe-core/cli inherits the
// host macOS appearance in headless Chrome, so a dark-mode machine silently audits dark mode even
// when asked to check a light-mode fix. This script forces prefers-color-scheme via CDP, then
// asserts in-page that the emulation actually took - a requested scheme that silently failed to
// apply is worse than no emulation at all, because the run looks clean while auditing the wrong
// mode.
async function run(): Promise<number> {
  const { url, scheme, cookies } = parseArgs(process.argv.slice(2));
  const chromePath = resolveChromePath();
  const axeSource = readFileSync(require.resolve('axe-core/axe.min.js'), 'utf8');

  const browser = await puppeteer.launch({
    executablePath: chromePath,
    headless: true,
    args: ['--no-sandbox', '--disable-gpu'],
  });

  try {
    const page = await browser.newPage();
    await page.emulateMediaFeatures([{ name: 'prefers-color-scheme', value: scheme }]);

    if (cookies.length > 0) {
      // page.setCookie is deprecated in puppeteer-core 25 in favor of
      // browser.defaultBrowserContext().setCookie, but only the page-level API's
      // CookieParam accepts a bare "url" to derive domain/path from (checked
      // node_modules/puppeteer-core/lib/puppeteer/api/Page.d.ts and
      // BrowserContext.d.ts: CookieData - the context-level shape - requires an
      // explicit "domain" instead). Using "url" keeps callers from having to
      // parse the hostname out of the audited URL themselves.
      await page.setCookie(...cookies.map((c) => ({ name: c.name, value: c.value, url })));
    }

    await page.goto(url, { waitUntil: 'networkidle0' });

    const applied = await page.evaluate(() => (matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light'));
    if (applied !== scheme) {
      throw new Error(`Scheme emulation failed: requested ${scheme}, page resolves ${applied}`);
    }

    console.log(`url: ${url}`);
    console.log(`scheme requested: ${scheme}`);
    console.log(`scheme applied: ${applied}`);

    await page.evaluate(axeSource);
    const axeResults = (await page.evaluate((tagList) => {
      // biome-ignore lint/suspicious/noExplicitAny: axe is injected into the page global at runtime
      return (window as any).axe.run({ runOnly: { type: 'tag', values: tagList } });
    }, DEFAULT_TAGS)) as AxeResults;

    console.log(`violations: ${axeResults.violations.length}`);
    console.log(`incomplete: ${axeResults.incomplete.length}`);
    printResults(axeResults.violations, 'violation');
    printResults(axeResults.incomplete, 'incomplete');

    return axeResults.violations.length;
  } finally {
    await browser.close();
  }
}

run()
  .then((violationCount) => {
    process.exit(violationCount > 0 ? 1 : 0);
  })
  .catch((err) => {
    console.error(err instanceof Error ? err.message : String(err));
    process.exit(1);
  });
