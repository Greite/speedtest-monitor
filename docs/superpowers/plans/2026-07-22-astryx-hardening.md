# Astryx Hardening & Residuals Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Durcir `scripts/axe-audit.ts`, corriger le hover brand et l'annonce SR du time-range, verrouiller les pills de statut par un test, et rendre `theme:build` déterministe avec un check de fraîcheur CI.

**Architecture:** Raffinement pur : restructuration d'un script existant, un token CSS, un fichier de test sur le pattern maison, un wrapper de build et un step de workflow. Aucune nouvelle dépendance.

**Tech Stack:** existant (Bun, puppeteer-core 25.3.0 + axe-core 4.12.1 épinglés, bun:test + renderToStaticMarkup, GitHub Actions).

**Spec:** `docs/superpowers/specs/2026-07-22-astryx-hardening-design.md`

## Global Constraints

- rtk prefix ; commits une ligne de titre, anglais, pas de body/trailers ; commentaires avec tirets, jamais de cadratins.
- Gates avant chaque commit : `rtk proxy bun lint` (2 warnings préexistants seulement) + `rtk proxy bun test` (tous verts, 178 existants + nouveaux).
- Ordre des cascade layers de `globals.css:5` intouchable ; règle de sync thème (edit de tokens => rebuild même commit) ; ici seul un TOKEN NOUVEAU est ajouté côté globals (pas de changement astryx-theme.ts attendu).
- `.d.ts`/source Astryx lus AVANT toute hypothèse d'API (leçon Token : vérifier le forwarding réel au DOM).
- Scripts jetables supprimés, jamais committés.

---

### Task 1: Durcissement du script axe + résidus UX

**Files:**
- Modify: `scripts/axe-audit.ts`
- Modify: `app/globals.css` (token `--brand-hover` : `@theme inline` + `:root` + `.dark`)
- Modify: `components/topbar.tsx:317,364,460` (`hover:bg-brand/90` -> `hover:bg-brand-hover`)
- Modify: `components/time-range-picker.tsx` (+ son test si l'annonce est restaurée)

**Interfaces:**
- Produces: `axe-audit.ts` avec contrat CLI durci : `bun scripts/axe-audit.ts <url> [--scheme light|dark] [--cookie "name=value"]...` ; token `--brand-hover` consommable en `hover:bg-brand-hover`.

- [ ] **Step 1: Restructurer la fermeture du script**

Lire le script actuel. Restructurer : le run principal retourne `violationCount` ; `browser.close()` dans `finally` ; `process.exit(violationCount > 0 ? 1 : 0)` APRÈS le try/finally. Aucun `process.exit` à l'intérieur du try.

- [ ] **Step 2: Parsing strict + assertion de schéma**

```ts
// Strict flag parsing - unknown flags are fatal (a typo like --schema
// silently auditing the wrong scheme is exactly what this script exists
// to prevent).
function parseArgs(argv: string[]): { url: string; scheme: 'light' | 'dark'; cookies: { name: string; value: string }[] } {
  let url: string | undefined;
  let scheme: 'light' | 'dark' = 'light';
  const cookies: { name: string; value: string }[] = [];
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--scheme') {
      const v = argv[++i];
      if (v !== 'light' && v !== 'dark') throw new Error(`--scheme must be light|dark, got "${v}"`);
      scheme = v;
    } else if (a === '--cookie') {
      const v = argv[++i] ?? '';
      const eq = v.indexOf('=');
      if (eq <= 0) throw new Error(`--cookie expects "name=value", got "${v}"`);
      cookies.push({ name: v.slice(0, eq), value: v.slice(eq + 1) });
    } else if (a.startsWith('-')) {
      throw new Error(`Unknown flag "${a}". Usage: bun scripts/axe-audit.ts <url> [--scheme light|dark] [--cookie name=value]...`);
    } else if (!url) {
      url = a;
    } else {
      throw new Error(`Unexpected argument "${a}"`);
    }
  }
  if (!url) throw new Error('Missing URL argument');
  return { url, scheme, cookies };
}
```

Après `emulateMediaFeatures`, asserter dans la page :

```ts
const applied = await page.evaluate(() => (matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light'));
if (applied !== scheme) {
  throw new Error(`Scheme emulation failed: requested ${scheme}, page resolves ${applied}`);
}
```

- [ ] **Step 3: Injection de cookies + doc d'en-tête**

Avant `page.goto` : `await browser.defaultBrowserContext().setCookie(...)` ou `page.setCookie` selon l'API puppeteer-core 25 (vérifier le .d.ts installé) avec `{name, value, url}`. En-tête du script : commentaire expliquant comment obtenir un cookie de session (se connecter dans un navigateur, copier le cookie better-auth depuis les DevTools) et l'exemple d'invocation authentifiée.

- [ ] **Step 4: Token brand-hover et hovers topbar**

`app/globals.css` : dans `@theme inline` ajouter `--color-brand-hover: var(--brand-hover);` (à côté de `--color-brand`) ; dans `:root` (bloc brand, ~l.95) `--brand-hover: oklch(0.5 0.19 250);` ; dans `.dark` `--brand-hover: oklch(0.74 0.17 240);` (plus clair que le fond brand sombre : perceptible, et le texte sombre y garde un contraste large). Dans `topbar.tsx`, remplacer les trois `hover:bg-brand/90` par `hover:bg-brand-hover`. Vérifier au calcul WCAG (script jetable ou calcul manuel documenté au rapport) : blanc sur oklch(0.5 0.19 250) >= 4.5:1.

- [ ] **Step 5: Annonce SR du time-range**

Lire `node_modules/@astryxdesign/core/dist/SegmentedControl/*.d.ts` ET la source du rendu de l'item : existe-t-il un moyen d'avoir un accessible name différent du label visible qui atteigne réellement le DOM (prop dédiée transmise, pas avalée) ? Si oui : items annoncés « Last 6h »... (visible « 6h » inchangé), et étendre `components/time-range-picker.test.tsx` pour verrouiller l'accessible name. Si non : documenter au rapport (limitation upstream, repli accepté par la spec) et ne rien changer.

- [ ] **Step 6: Vérification et commit**

```bash
rtk proxy bun lint && rtk proxy bun test
rtk npm run build && rtk npm run start &
rtk proxy bun scripts/axe-audit.ts http://localhost:3003/login --scheme light
rtk proxy bun scripts/axe-audit.ts http://localhost:3003/login --scheme dark
rtk proxy bun scripts/axe-audit.ts http://localhost:3003/login --schema light && echo "SHOULD HAVE FAILED"
```

Expected: 0 violation x2 ; la 3e invocation échoue avec le message d'usage (et n'affiche pas SHOULD HAVE FAILED). Tuer le serveur.

```bash
rtk git add -A && rtk git commit -m "feat: harden axe audit script and fix brand hover contrast"
```

---

### Task 2: Test de composant table-filters

**Files:**
- Create: `components/table-filters.test.tsx`

**Interfaces:**
- Consumes: le pattern de `components/time-range-picker.test.tsx` (bun:test + renderToStaticMarkup, wrap dans Theme si nécessaire) ; `TableFilters {value, onChange}` ; `statusPillClassesOk/Warn/Bad` (lib/utils.ts).

- [ ] **Step 1: Écrire le test (RED d'abord sur une assertion volontairement fausse pour prouver qu'il tourne, puis corriger)**

```tsx
import { describe, expect, it } from 'bun:test';

import { renderToStaticMarkup } from 'react-dom/server';

import { TableFilters } from './table-filters';

// Static-render lock for the status pill wiring. NumberInput commit timing
// (blur/Enter/clear) is interactional and out of reach here - documented
// trade-off, see the NumericBlock comment in table-filters.tsx.
const render = (value: Parameters<typeof TableFilters>[0]['value']) =>
  renderToStaticMarkup(<TableFilters value={value} onChange={() => {}} />);

describe('TableFilters status pills', () => {
  it('binds each status color to its position', () => {
    const html = render({ status: ['success', 'timeout', 'error'] });
    // The wrapper carries the three static nth-of-type literals; their
    // presence plus STATUSES order is the contract the comment in
    // table-filters.tsx documents.
    expect(html).toContain('latency-ok');
    expect(html).toContain('latency-warn');
    expect(html).toContain('latency-bad');
    // aria-pressed lands on the right buttons (all three active here).
    const pressed = html.match(/aria-pressed="true"/g) ?? [];
    expect(pressed.length).toBe(3);
  });

  it('renders removable chips for active filters when collapsed', () => {
    const html = render({ download: { min: 100 }, server: 'Paris' });
    expect(html).toContain('Download (Mbps)');
    expect(html).toContain('Server: Paris');
    // Token onRemove renders an accessible remove button per chip.
    expect(html).toMatch(/aria-label="[^"]*[Rr]emove[^"]*"/);
  });
});
```

Ajuster à la réalité du panneau (le panneau des filtres est fermé par défaut : les assertions NumberInput exigent l'état ouvert - si `open` n'est pas contrôlable de l'extérieur, tester ce qui est rendu fermé : chips + compte actif ; documenter ce que le rendu fermé ne couvre pas). Vérifier l'accessible name réel du bouton de suppression du Token dans sa source avant d'écrire l'assertion regex.

- [ ] **Step 2: Itérer jusqu'au vert, gates, commit**

```bash
rtk proxy bun test components/table-filters.test.tsx
rtk proxy bun lint && rtk proxy bun test
rtk git add components/table-filters.test.tsx && rtk git commit -m "test: lock status pill wiring and filter chips in table filters"
```

---

### Task 3: Infra (wrapper theme-build + CI) et validation du lot

**Files:**
- Create: `scripts/theme-build.ts`
- Modify: `package.json` (`theme:build` -> `bun scripts/theme-build.ts`)
- Modify: `lib/speedtest.*` (normalisation initiale, une fois)
- Modify: `.github/workflows/a11y.yml` (step de fraîcheur)

- [ ] **Step 1: Écrire le wrapper**

```ts
// Runs the Astryx theme build then normalizes the generator timestamp so
// rebuilding with unchanged tokens produces a zero diff (the CLI stamps
// each output with a build date, which polluted git history).
import { $ } from 'bun';

const OUTPUTS = ['lib/speedtest.css', 'lib/speedtest.js', 'lib/speedtest.d.ts', 'lib/speedtest.variants.d.ts'];

await $`bunx astryx theme build lib/astryx-theme.ts`;

for (const path of OUTPUTS) {
  const file = Bun.file(path);
  if (!(await file.exists())) continue;
  const text = await file.text();
  // Conservative match: only rewrite from "Generated:" to end of line,
  // keeping each file type's comment syntax intact.
  const normalized = text.replace(/Generated:.*$/m, 'Generated: by scripts/theme-build.ts (timestamp normalized)');
  if (normalized !== text) {
    await Bun.write(path, normalized);
  }
}
```

Adapter la liste OUTPUTS aux fichiers réellement émis (ls lib/speedtest*) et vérifier si `Generated:` apparaît plusieurs fois par fichier (`g` flag si besoin). `package.json` : `"theme:build": "bun scripts/theme-build.ts"`.

- [ ] **Step 2: Normalisation initiale + preuve de déterminisme**

```bash
rtk proxy bun run theme:build
rtk git diff --stat lib/        # diff attendu : lignes Generated normalisées
rtk proxy bun run theme:build
rtk git diff --stat lib/        # IDENTIQUE au précédent (2e run = zéro diff supplémentaire)
```

- [ ] **Step 3: Step CI de fraîcheur**

Lire `.github/workflows/a11y.yml` (structure, setup bun existant). Ajouter un step après l'install :

```yaml
      - name: Check built theme freshness
        run: |
          bun run theme:build
          git diff --exit-code lib/
```

Valider localement la commande exacte du step (`bun run theme:build && git diff --exit-code lib/` -> exit 0).

- [ ] **Step 4: Validation du lot et commit**

```bash
rtk proxy bun lint && rtk proxy bun test && rtk npm run build
rtk git add -A && rtk git commit -m "chore: make theme build deterministic and add CI freshness check"
```

Rapport final : sorties des deux runs axe de la Task 1, verdict SR, preuve de déterminisme, commande CI validée.
