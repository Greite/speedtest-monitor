# Astryx Dashboard Migration Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Migrer le contenu du dashboard (page principale) de shadcn/ui vers le design system Astryx de Meta, avec fondations réutilisables (thème custom, providers), en retirant `@tanstack/react-table`.

**Architecture:** Astryx est consommé en mode "pre-built CSS" (pas de plugin de build) : imports CSS dans `globals.css`, composant `Theme` + `LinkProvider` dans un provider client, thème custom via `defineTheme` mappé sur les tokens oklch existants. Les 6 composants du dashboard remplacent leurs primitives shadcn par les équivalents Astryx en gardant la logique métier intacte. La table passe au modèle data-driven d'Astryx (`columns` + `data` + `renderCell`), le tri/filtres/pagination restant côté serveur.

**Tech Stack:** Next.js 16 (App Router), React 19, Bun, Tailwind CSS 4, `@astryxdesign/core`, `@astryxdesign/theme-neutral`, next-themes, Recharts (conservé), Biome.

**Spec:** `docs/superpowers/specs/2026-07-21-astryx-dashboard-migration-design.md`

## Global Constraints

- Toutes les commandes shell sont préfixées par `rtk` (proxy token-optimisé, passthrough sûr).
- Versions Astryx épinglées en exact : toujours `bun add --exact` (Astryx est en bêta).
- Ne PAS importer `@astryxdesign/core/reset.css` : le preflight Tailwind est déjà actif, un second reset casserait les pages non migrées.
- Les composants `components/ui/*` (shadcn) ne sont PAS modifiés ni supprimés : ils servent encore la topbar, le footer et les autres pages.
- API publiques préservées : `TimeRangePicker` garde `{value, onChange, className}`, `HistoryTable` garde `{refreshSignal}`, `Dashboard` inchangé.
- Messages de commit : une seule ligne de titre (pas de body, pas de trailer), en anglais, style conventional commits du repo.
- Astryx est en bêta : chaque tâche qui utilise un composant peu documenté commence par lire son `.d.ts` dans `node_modules` et adapte le code fourni si les signatures diffèrent. Le code fourni est la référence d'intention.
- Validation transverse à chaque tâche : `bun lint` (tsc + biome) doit passer avant chaque commit.
- Langue du code, des labels UI et des commits : anglais (comme l'existant).

## File Structure

| Fichier | Rôle |
|---|---|
| Create: `lib/astryx-theme.ts` | Thème custom `defineTheme`, source unique des overrides de tokens |
| Create: `components/astryx-providers.tsx` | Provider client : `Theme` (pont next-themes) + `LinkProvider` |
| Create: `components/time-range-picker.test.tsx` | Test de rendu du nouveau TimeRangePicker |
| Modify: `app/globals.css` | Imports CSS Astryx ; suppression du CSS `.segmented-*` orphelin |
| Modify: `app/layout.tsx` | Branche `AstryxProviders` dans l'arbre |
| Modify: `components/dashboard.tsx` | Card/Skeleton Astryx (fallback du chart) |
| Modify: `components/kpi-cards.tsx` | Card/Heading Astryx |
| Modify: `components/time-range-picker.tsx` | Réécriture sur SegmentedControl |
| Modify: `components/history-chart.tsx` | Card/Heading/Button Astryx, Recharts intact |
| Modify: `components/table-filters.tsx` | Découplage TanStack (interface contrôlée) + inputs Astryx |
| Modify: `components/history-table.tsx` | Table Astryx data-driven, retrait TanStack |
| Modify: `package.json` | + packages Astryx, - `@tanstack/react-table` |

---

### Task 1: Installer Astryx et brancher le CSS

**Files:**
- Modify: `package.json` (via bun)
- Modify: `app/globals.css:1-2`

**Interfaces:**
- Consumes: rien
- Produces: packages `@astryxdesign/core`, `@astryxdesign/theme-neutral`, `@astryxdesign/cli` installés en versions exactes ; CSS Astryx chargé globalement (inerte tant qu'aucun composant Astryx n'est rendu)

- [ ] **Step 1: Installer les packages en versions exactes**

```bash
rtk proxy bun add --exact @astryxdesign/core @astryxdesign/theme-neutral
rtk proxy bun add --exact --dev @astryxdesign/cli
```

Expected: `package.json` contient les trois packages sans `^`.

- [ ] **Step 2: Vérifier la structure du package (sous-chemins d'import)**

```bash
rtk ls node_modules/@astryxdesign/core
rtk proxy cat node_modules/@astryxdesign/core/package.json | head -60
```

Expected: un champ `exports` exposant `./astryx.css`, `./Button`, `./Card`, `./Table`, `./theme`, etc. Noter les chemins exacts si différents de ceux utilisés dans les tâches suivantes (p. ex. `./css/astryx.css`) et les reporter.

- [ ] **Step 3: Ajouter les imports CSS dans `app/globals.css`**

Remplacer :

```css
@import 'tailwindcss';
@import 'tw-animate-css';
```

par :

```css
@import 'tailwindcss';
@import 'tw-animate-css';
@import '@astryxdesign/core/astryx.css';
@import '@astryxdesign/theme-neutral/theme.css';
```

Ne PAS importer `reset.css` (voir Global Constraints).

- [ ] **Step 4: Vérifier que rien ne casse visuellement**

```bash
rtk npm run dev
```

Ouvrir http://localhost:3003 (dashboard), /login et /settings. Expected: rendu strictement identique à `main` (le CSS Astryx est chargé mais aucun composant Astryx n'est rendu). Vérifier aussi le dark mode via le toggle de la topbar.

- [ ] **Step 5: Lint et commit**

```bash
rtk proxy bun lint
rtk git add package.json bun.lock app/globals.css && rtk git commit -m "feat: install Astryx design system and wire base CSS"
```

Expected: lint PASS, commit créé.

---

### Task 2: Thème custom et providers (pont next-themes)

**Files:**
- Create: `lib/astryx-theme.ts`
- Create: `components/astryx-providers.tsx`
- Modify: `app/layout.tsx:57-62`

**Interfaces:**
- Consumes: `defineTheme`, `Theme` depuis `@astryxdesign/core/theme` ; `LinkProvider` depuis `@astryxdesign/core/Link` ; `useTheme` de next-themes
- Produces: `astryxTheme` (export de `lib/astryx-theme.ts`) ; `AstryxProviders({children})` (export de `components/astryx-providers.tsx`) consommés par toutes les tâches suivantes

- [ ] **Step 1: Vérifier l'API de theming dans les types installés**

```bash
rtk proxy find node_modules/@astryxdesign/core -name '*.d.ts' | xargs grep -l "defineTheme" | head -3
rtk grep -rn "mode" node_modules/@astryxdesign/core/dist/theme*.d.ts 2>/dev/null | head -20
rtk proxy sh -c "grep -oE -- '--[a-z0-9-]+' node_modules/@astryxdesign/theme-neutral/theme.css | sort -u | head -60"
```

Expected: signature de `defineTheme`, valeurs admises du prop `mode` du composant `Theme` (attendu : `'light' | 'dark' | 'system'`), et la liste réelle des noms de tokens CSS. Ajuster les noms de tokens du Step 2 avec ceux listés (les noms documentés sont `--color-accent`, `--color-surface`, `--radius-container` ; compléter background/border/typo avec les noms réels trouvés).

- [ ] **Step 2: Créer `lib/astryx-theme.ts`**

Les valeurs oklch reprennent exactement `app/globals.css` (`:root` et `.dark`), en tuples `[light, dark]` :

```ts
import { defineTheme } from '@astryxdesign/core/theme';

// Values mirror the shadcn tokens in app/globals.css ([light, dark] tuples).
export const astryxTheme = defineTheme({
  name: 'speedtest',
  tokens: {
    '--color-accent': ['oklch(0.58 0.19 250)', 'oklch(0.7 0.17 240)'],
    '--color-surface': ['oklch(1 0 0)', 'oklch(0.19 0.008 260)'],
    '--color-background': ['oklch(0.99 0.002 250)', 'oklch(0.135 0.01 260)'],
    '--color-border': ['oklch(0.922 0 0)', 'oklch(1 0 0 / 10%)'],
    '--radius-container': '0.625rem',
    '--font-family-base': "var(--font-sans), ui-sans-serif, system-ui, sans-serif",
    '--font-family-mono': "var(--font-mono), ui-monospace, monospace",
  },
});
```

Remplacer les clés par les noms réels relevés au Step 1 si différents. `var(--font-sans)` / `var(--font-mono)` sont fournis par next/font dans `app/layout.tsx` (Instrument Sans, JetBrains Mono).

- [ ] **Step 3: Créer `components/astryx-providers.tsx`**

```tsx
'use client';

import { LinkProvider } from '@astryxdesign/core/Link';
import { Theme } from '@astryxdesign/core/theme';
import Link from 'next/link';
import { useTheme } from 'next-themes';
import type { ReactNode } from 'react';

import { astryxTheme } from '@/lib/astryx-theme';

export function AstryxProviders({ children }: { children: ReactNode }) {
  const { resolvedTheme } = useTheme();
  // Before hydration resolvedTheme is undefined: fall back to system so the
  // Astryx color-scheme matches what next-themes will resolve.
  const mode = resolvedTheme === 'dark' ? 'dark' : resolvedTheme === 'light' ? 'light' : 'system';
  return (
    <Theme theme={astryxTheme} mode={mode}>
      <LinkProvider component={Link}>{children}</LinkProvider>
    </Theme>
  );
}
```

- [ ] **Step 4: Brancher dans `app/layout.tsx`**

Ajouter l'import :

```tsx
import { AstryxProviders } from '@/components/astryx-providers';
```

Et remplacer :

```tsx
        <ThemeProvider attribute="class" defaultTheme="system" enableSystem>
          <FocusMainOnNavigate />
          <SessionShell>{children}</SessionShell>
          <Toaster position="top-right" richColors closeButton />
        </ThemeProvider>
```

par :

```tsx
        <ThemeProvider attribute="class" defaultTheme="system" enableSystem>
          <AstryxProviders>
            <FocusMainOnNavigate />
            <SessionShell>{children}</SessionShell>
            <Toaster position="top-right" richColors closeButton />
          </AstryxProviders>
        </ThemeProvider>
```

- [ ] **Step 5: Vérifier le rendu et l'hydratation**

```bash
rtk npm run dev
```

Expected: dashboard identique, pas d'erreur d'hydratation en console, l'attribut `data-astryx-theme` est présent sur l'élément racine (inspecter le DOM). Basculer light/dark via la topbar : pas de flash, pas d'erreur.

- [ ] **Step 6: Lint et commit**

```bash
rtk proxy bun lint
rtk git add lib/astryx-theme.ts components/astryx-providers.tsx app/layout.tsx && rtk git commit -m "feat: add Astryx theme and providers bridged to next-themes"
```

Expected: lint PASS, commit créé.

---

### Task 3: TimeRangePicker sur SegmentedControl

**Files:**
- Modify: `components/time-range-picker.tsx` (réécriture complète)
- Create: `components/time-range-picker.test.tsx`
- Modify: `app/globals.css:294-320` (suppression CSS orphelin)

**Interfaces:**
- Consumes: `SegmentedControl` depuis `@astryxdesign/core/SegmentedControl` ; `AstryxProviders` (Task 2) déjà monté dans le layout
- Produces: `TimeRangePicker({value, onChange, className})` et `type Range = '6h' | '12h' | '24h' | '7d' | '30d'` : API publique inchangée, consommée par `dashboard.tsx` et `app/page.tsx` (`isRange`)

- [ ] **Step 1: Lire l'API réelle du SegmentedControl**

```bash
rtk proxy sh -c "find node_modules/@astryxdesign/core -name '*.d.ts' -path '*Segmented*' -exec cat {} +"
```

Expected: props du `SegmentedControl` (attendu : `value`, `onChange`, items via children `SegmentedControlItem {value, label}` ou prop `options`). Adapter le Step 2 à la signature réelle.

- [ ] **Step 2: Écrire le test de rendu (échec attendu)**

Créer `components/time-range-picker.test.tsx` :

```tsx
import { describe, expect, it } from 'bun:test';

import { renderToStaticMarkup } from 'react-dom/server';

import { TimeRangePicker } from './time-range-picker';

describe('TimeRangePicker', () => {
  it('renders all five ranges with the active value marked', () => {
    const html = renderToStaticMarkup(<TimeRangePicker value="24h" onChange={() => {}} />);
    for (const label of ['6h', '12h', '24h', '7d', '30d']) {
      expect(html).toContain(label);
    }
    // The active item must be conveyed to AT (aria-pressed, aria-checked or aria-selected).
    expect(html).toMatch(/aria-(pressed|checked|selected)="true"/);
  });
});
```

```bash
rtk proxy bun test components/time-range-picker.test.tsx
```

Expected: PASS trivial sur l'ancien composant (il rend déjà `aria-pressed`) ou FAIL selon l'implémentation SSR ; ce test verrouille le contrat pendant la réécriture. Si `renderToStaticMarkup` échoue car le SegmentedControl exige le contexte `Theme`, wrapper le rendu du test dans `<Theme theme={astryxTheme} mode="light">` (imports depuis `@astryxdesign/core/theme` et `@/lib/astryx-theme`).

- [ ] **Step 3: Réécrire `components/time-range-picker.tsx`**

Remplacer tout le fichier par :

```tsx
'use client';

import { SegmentedControl, SegmentedControlItem } from '@astryxdesign/core/SegmentedControl';

export type Range = '6h' | '12h' | '24h' | '7d' | '30d';

const RANGES: { value: Range; label: string }[] = [
  { value: '6h', label: '6h' },
  { value: '12h', label: '12h' },
  { value: '24h', label: '24h' },
  { value: '7d', label: '7d' },
  { value: '30d', label: '30d' },
];

export function TimeRangePicker({
  value,
  onChange,
  className,
}: {
  value: Range;
  onChange: (next: Range) => void;
  className?: string;
}) {
  return (
    <SegmentedControl
      value={value}
      onChange={(next: string) => onChange(next as Range)}
      aria-label="Time range"
      size="sm"
      className={className}
    >
      {RANGES.map((r) => (
        <SegmentedControlItem key={r.value} value={r.value} label={r.label} />
      ))}
    </SegmentedControl>
  );
}
```

Adapter noms/props à la signature relevée au Step 1 (p. ex. `options={RANGES}` au lieu de children). La gestion manuelle de la pill animée (refs, useLayoutEffect, ~90 lignes) disparaît.

- [ ] **Step 4: Supprimer le CSS orphelin**

Dans `app/globals.css`, supprimer le bloc commençant à `/* ---- Underline glide for segmented controls ---- */` (lignes ~294-320) : règles `.segmented-track` et `.segmented-pill`. Vérifier qu'aucun autre fichier ne les référence :

```bash
rtk grep -rn "segmented-track\|segmented-pill" app components lib
```

Expected: aucune occurrence restante.

- [ ] **Step 5: Tester**

```bash
rtk proxy bun test components/time-range-picker.test.tsx
rtk npm run dev
```

Expected: test PASS. En manuel sur http://localhost:3003 : cliquer 6h/7d/30d change le chart et met à jour `?range=` dans l'URL ; navigation clavier (flèches ou tab) fonctionnelle ; rendu correct en light et dark.

- [ ] **Step 6: Lint et commit**

```bash
rtk proxy bun lint
rtk git add components/time-range-picker.tsx components/time-range-picker.test.tsx app/globals.css && rtk git commit -m "feat: migrate TimeRangePicker to Astryx SegmentedControl"
```

Expected: lint PASS, commit créé.

---

### Task 4: dashboard.tsx sur Card/Skeleton Astryx

**Files:**
- Modify: `components/dashboard.tsx:11-24`

**Interfaces:**
- Consumes: `Card` depuis `@astryxdesign/core/Card`, `Skeleton` depuis `@astryxdesign/core/Skeleton`
- Produces: `Dashboard({initial, initialRange})` inchangé pour `app/page.tsx`

- [ ] **Step 1: Remplacer les imports et le fallback de chargement**

Remplacer :

```tsx
import { Card, CardContent } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
```

par :

```tsx
import { Card } from '@astryxdesign/core/Card';
import { Skeleton } from '@astryxdesign/core/Skeleton';
```

Et remplacer le fallback du dynamic import :

```tsx
  loading: () => (
    <Card>
      <CardContent className="p-5">
        <Skeleton className="h-64 w-full" />
      </CardContent>
    </Card>
  ),
```

par :

```tsx
  loading: () => (
    <Card>
      <Skeleton height={256} />
    </Card>
  ),
```

(Le Skeleton Astryx est full-width par défaut ; `height` en pixels remplace `h-64` = 16rem = 256px.)

- [ ] **Step 2: Vérifier**

```bash
rtk npm run dev
```

Expected: recharger le dashboard avec le cache vidé (ou throttling réseau) montre brièvement le skeleton dans une Card avant le chart. Aucun autre changement visuel (le heading "Overview" et la structure ne bougent pas).

- [ ] **Step 3: Lint et commit**

```bash
rtk proxy bun lint
rtk git add components/dashboard.tsx && rtk git commit -m "feat: migrate dashboard chart fallback to Astryx Card and Skeleton"
```

Expected: lint PASS, commit créé.

---

### Task 5: kpi-cards.tsx sur Card/Heading Astryx

**Files:**
- Modify: `components/kpi-cards.tsx:17,214-263`

**Interfaces:**
- Consumes: `Card` depuis `@astryxdesign/core/Card`, `Heading` depuis `@astryxdesign/core/Text`
- Produces: `KpiCards({latest, averages, busy, measurements})` inchangé pour `dashboard.tsx`

- [ ] **Step 1: Remplacer l'import shadcn**

Remplacer :

```tsx
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
```

par :

```tsx
import { Card } from '@astryxdesign/core/Card';
import { Heading } from '@astryxdesign/core/Text';
```

- [ ] **Step 2: Adapter la structure du composant `Kpi`**

La Card Astryx applique son propre padding (Container Padding System) ; les paddings manuels internes sont conservés en neutralisant celui de la Card. Remplacer dans `Kpi` :

```tsx
    <Card
      aria-label={summary}
      className="relative gap-0 overflow-hidden border-border/60 bg-card/80 py-0 backdrop-blur-sm transition-shadow hover:shadow-md"
    >
```

par :

```tsx
    <Card
      aria-label={summary}
      className="relative gap-0 overflow-hidden p-0 backdrop-blur-sm transition-shadow hover:shadow-md"
    >
```

(`border-border/60 bg-card/80 py-0` étaient des overrides des styles shadcn ; bordure et fond viennent maintenant du thème Astryx. `p-0` neutralise le padding intégré car les divs internes gèrent le leur.)

Puis remplacer la paire header/title :

```tsx
        <CardHeader className="px-0 pb-0">
          <CardTitle as="h2" className="label-eyebrow flex items-center justify-between gap-2">
```

par :

```tsx
        <div>
          <Heading level={2} className="label-eyebrow flex items-center justify-between gap-2">
```

et fermer en remplaçant `</CardTitle>` par `</Heading>` et `</CardHeader>` par `</div>`. Enfin remplacer `<CardContent className="px-0 pb-0">` par `<div>` et son `</CardContent>` par `</div>`.

Le contenu interne (valeur, DeltaBadge, Sparkline, logique de flash) ne change pas.

- [ ] **Step 3: Vérifier**

```bash
rtk npm run dev
```

Expected: les 3 cartes KPI ont le même layout qu'avant (eyebrow + valeur mono + delta + sparkline en bas), fonds/bordures cohérents en light et dark, l'animation de flash au retour d'une mesure fonctionne toujours (attendre un run ou déclencher une mesure). Si la typo du `Heading` Astryx écrase `label-eyebrow`, garder la classe et vérifier qu'elle gagne (elle est chargée après dans la cascade Tailwind utilities).

- [ ] **Step 4: Lint et commit**

```bash
rtk proxy bun lint
rtk git add components/kpi-cards.tsx && rtk git commit -m "feat: migrate KPI cards to Astryx Card and Heading"
```

Expected: lint PASS, commit créé.

---

### Task 6: history-chart.tsx sur Card/Heading/Button Astryx

**Files:**
- Modify: `components/history-chart.tsx:17-18,72-94,101-128`

**Interfaces:**
- Consumes: `Card` depuis `@astryxdesign/core/Card`, `Heading` depuis `@astryxdesign/core/Text`, `Button` depuis `@astryxdesign/core/Button`
- Produces: `HistoryChart({measurements, running})` inchangé pour `dashboard.tsx` (import dynamique)

- [ ] **Step 1: Remplacer les imports**

Remplacer :

```tsx
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
```

par :

```tsx
import { Button } from '@astryxdesign/core/Button';
import { Card } from '@astryxdesign/core/Card';
import { Heading } from '@astryxdesign/core/Text';
```

- [ ] **Step 2: Migrer l'état vide (lignes ~72-94)**

Même transformation que Task 5 : `CardHeader` → `div`, `CardTitle as="h2"` → `Heading level={2}` (mêmes classes conservées), `CardContent` → `div`. La Card englobante garde ses defaults Astryx (pas de classes shadcn à reporter ici).

- [ ] **Step 3: Migrer la Card principale (lignes ~101-128)**

Remplacer :

```tsx
    <Card
      className={cn(
        'relative overflow-hidden border-border/60 bg-card/80 backdrop-blur-sm transition-shadow',
        running && 'live-glow',
      )}
    >
```

par :

```tsx
    <Card
      className={cn('relative overflow-hidden backdrop-blur-sm transition-shadow', running && 'live-glow')}
    >
```

Même transformation header/title/content que Task 5. Le bouton "View as table" est un Button Astryx à `label` (pas de children) :

```tsx
          <Button
            variant="ghost"
            size="sm"
            icon={<TableIcon aria-hidden />}
            label={showTable ? 'Hide table' : 'View as table'}
            aria-pressed={showTable}
            aria-controls="chart-data-table"
            onClick={() => setShowTable((v) => !v)}
          />
```

(Astryx n'a pas de size `xs` documentée : `sm` est la plus proche. Vérifier `Button.d.ts` si doute : `rtk proxy sh -c "find node_modules/@astryxdesign/core -name '*.d.ts' -path '*Button*' -exec cat {} +"`.)

Tout le rendu Recharts (SVG, tooltips, axes) et `buildSummary` restent intacts.

- [ ] **Step 4: Vérifier**

```bash
rtk npm run dev
```

Expected: chart identique, légende intacte, toggle "View as table" affiche/masque la table de données accessible (`chart-data-table`), effet `live-glow` visible pendant une mesure, état vide correct (tester avec `?range=6h` si aucune donnée récente).

- [ ] **Step 5: Lint et commit**

```bash
rtk proxy bun lint
rtk git add components/history-chart.tsx && rtk git commit -m "feat: migrate history chart chrome to Astryx components"
```

Expected: lint PASS, commit créé.

---

### Task 7: table-filters.tsx : interface contrôlée + inputs Astryx

**Files:**
- Modify: `components/table-filters.tsx` (réécriture de l'interface et des contrôles)

**Interfaces:**
- Consumes: `TableFilters` (type) et `SortColumn` depuis `@/lib/measurements-query` ; `Button` depuis `@astryxdesign/core/Button`, `IconButton` depuis `@astryxdesign/core/IconButton`, `TextInput` depuis `@astryxdesign/core/TextInput`, `Token` depuis `@astryxdesign/core/Token`
- Produces: `TableFilters({ value, onChange }: { value: TableFiltersType; onChange: (next: TableFiltersType) => void })` : NOUVELLE interface publique, consommée par Task 8. Les types exportés `NumericRange`, `TimeRange`, `StatusValue` sont conservés tels quels.

- [ ] **Step 1: Supprimer le couplage TanStack**

Supprimer l'import :

```tsx
import type { Column, Table } from '@tanstack/react-table';
```

Remplacer la signature du composant (l'actuelle reçoit `{ table: Table<MeasurementDto> }`) par :

```tsx
import type { TableFilters as TableFiltersType } from '@/lib/measurements-query';

export function TableFilters({
  value,
  onChange,
}: {
  value: TableFiltersType;
  onChange: (next: TableFiltersType) => void;
}) {
```

Remplacer les helpers `setNumericRange` / `setTimeRange` (qui appelaient `col.setFilterValue`) par des mises à jour immutables du `TableFiltersType` :

```tsx
function withNumericRange(
  current: TableFiltersType,
  key: 'download' | 'upload' | 'latency',
  next: NumericRange,
): TableFiltersType {
  const { [key]: _removed, ...rest } = current;
  if (next.min == null && next.max == null) {
    return rest;
  }
  return { ...rest, [key]: next };
}

function withTimeRange(current: TableFiltersType, next: TimeRange): TableFiltersType {
  const { time: _removed, ...rest } = current;
  if (next.from == null && next.to == null) {
    return rest;
  }
  return { ...rest, time: next };
}
```

Chaque site d'appel devient `onChange(withNumericRange(value, 'download', {...}))` (idem `upload`, `latency`, `time`, et affectation directe pour `server` et `status`). L'état courant se lit depuis `value.download`, `value.time`, etc. au lieu de `column.getFilterValue()`. Les helpers de parsing (`parseNumber`, `parseTime`, `toDateTimeLocal`) et les résumés (`formatNumericSummary`, ...) ne changent pas.

- [ ] **Step 2: Migrer les contrôles vers Astryx**

Mapping systématique dans tout le fichier :

- `<Input ... />` + `<Label htmlFor=...>` → `<TextInput label="..." value={...} onChange={(v) => ...} size="sm" />`. Le `onChange` Astryx reçoit la valeur directement (pas d'event) : `onChange={(v) => onChange(withNumericRange(value, 'download', { ...cur, min: parseNumber(v) }))}`. Les inputs datetime-local : vérifier si `TextInput` accepte `type="datetime-local"`, sinon utiliser `DateTimeInput` depuis `@astryxdesign/core/DateTimeInput` (lire son `.d.ts` : `rtk proxy sh -c "find node_modules/@astryxdesign/core -name '*.d.ts' -path '*DateTime*' -exec cat {} +"`).
- Chips de filtres actifs `<Badge>` avec bouton `X` → `<Token label={summary} onRemove={() => onChange(...)} />` (le Token intègre le bouton de suppression accessible).
- `<Button variant="ghost" size="...">` avec texte → `<Button variant="ghost" size="sm" label="..." onClick={...} />`.
- Boutons icône seule (X, chevrons) → `<IconButton icon={<X aria-hidden />} label="Clear filter" size="sm" variant="ghost" onClick={...} />` (le `label` devient l'accessible name).
- Les toggles de statut (OK/Timeout/Error) : conserver la logique de sélection multiple sur `value.status`, rendus en `Token` cliquables (`onClick`) avec `color` reflétant l'état actif (`green`/`yellow`/`red` si actif, `default` sinon).

- [ ] **Step 3: Vérifier la compilation seule**

```bash
rtk proxy bun tsc
```

Expected: les seules erreurs restantes pointent vers `history-table.tsx` (qui passe encore `table={...}`) : c'est attendu, Task 8 le corrige. Aucune erreur dans `table-filters.tsx` lui-même.

- [ ] **Step 4: Commit**

```bash
rtk git add components/table-filters.tsx && rtk git commit -m "feat: decouple table filters from TanStack and migrate to Astryx inputs"
```

Expected: commit créé. (Le lint complet passera en fin de Task 8, le build étant transitoirement cassé entre les deux tâches ; les deux commits sont adjacents.)

---

### Task 8: history-table.tsx sur Table Astryx, retrait TanStack

**Files:**
- Modify: `components/history-table.tsx` (réécriture du state et du rendu)
- Modify: `package.json` (retrait `@tanstack/react-table`)

**Interfaces:**
- Consumes: `TableFilters({value, onChange})` (Task 7) ; `Table` et `useTableSortable`/`useTableSortableState` depuis `@astryxdesign/core/Table` ; `Card`, `Heading`, `Selector`, `IconButton`, `Token` d'Astryx ; `useTableMeasurements` (inchangé)
- Produces: `HistoryTable({refreshSignal})` inchangé pour `dashboard.tsx`

- [ ] **Step 1: Lire l'API réelle de la Table et du plugin de tri**

```bash
rtk proxy sh -c "find node_modules/@astryxdesign/core -name '*.d.ts' -path '*Table*' | head; find node_modules/@astryxdesign/core -name '*.d.ts' -path '*Table*' -exec cat {} + | head -200"
```

Expected: signatures de `TableProps` (dont la prop d'accessible name : `aria-label` ou `caption`), `TableColumn`, `useTableSortable`, `useTableSortableState` (tri contrôlé). Adapter le code du Step 2 aux signatures réelles, en particulier le câblage du tri contrôlé.

- [ ] **Step 2: Réécrire le state et le rendu**

Supprimer tous les imports `@tanstack/react-table`, `flexRender` inclus, et les imports shadcn (`Badge`, `Button`, `Card...`, `Select...`, `Table...`). Nouveaux imports :

```tsx
import { Card } from '@astryxdesign/core/Card';
import { IconButton } from '@astryxdesign/core/IconButton';
import { Selector } from '@astryxdesign/core/Selector';
import { Table, type TableColumn, useTableSortable, useTableSortableState } from '@astryxdesign/core/Table';
import { Heading } from '@astryxdesign/core/Text';
import { Token } from '@astryxdesign/core/Token';
```

Remplacer le state TanStack (`SortingState`, `ColumnFiltersState`, `PaginationState`, `useReactTable`, `buildFiltersFromState`, `COLUMN_TO_SORT`) par :

```tsx
const [sort, setSort] = useState<{ column: SortColumn; dir: 'asc' | 'desc' }>({ column: 'timestamp', dir: 'desc' });
const [filters, setFilters] = useState<TableFiltersType>({});
const [page, setPage] = useState(1);
const [pageSize, setPageSize] = useState(25);

const query = useMemo<TableQuery>(
  () => ({ page, pageSize, sort: sort.column, sortDir: sort.dir, filters }),
  [page, pageSize, sort, filters],
);

const { measurements, totalCount, loading } = useTableMeasurements(query, refreshSignal);
const pageCount = Math.max(1, Math.ceil(totalCount / pageSize));
```

Colonnes (le `statusBadge` shadcn devient `statusToken` ; les icônes lucide dans le badge de statut sont abandonnées, la couleur du Token porte l'information avec le libellé) :

```tsx
function statusToken(status: MeasurementDto['status']) {
  if (status === 'success') {
    return <Token label="OK" color="green" size="sm" />;
  }
  if (status === 'timeout') {
    return <Token label="Timeout" color="yellow" size="sm" />;
  }
  return <Token label="Error" color="red" size="sm" />;
}

const columns: TableColumn<MeasurementDto>[] = [
  { key: 'timestamp', header: 'Time', sortable: { sortKey: 'timestamp' }, renderCell: (m) => <TimeCell ts={m.timestamp} /> },
  {
    key: 'download',
    header: 'Download',
    sortable: { sortKey: 'downloadMbps' },
    renderCell: (m) => <span className="font-mono text-speed-down">{formatMbps(m.downloadMbps)}</span>,
  },
  {
    key: 'upload',
    header: 'Upload',
    sortable: { sortKey: 'uploadMbps' },
    renderCell: (m) => <span className="font-mono text-speed-up">{formatMbps(m.uploadMbps)}</span>,
  },
  { key: 'latency', header: 'Latency (u/l)', sortable: { sortKey: 'latencyLoadedMs' }, renderCell: (m) => <LatencyCell m={m} /> },
  {
    key: 'server',
    header: 'Server',
    renderCell: (m) => <span className="text-xs text-muted-foreground">{m.serverLocations?.join(' | ') ?? '-'}</span>,
  },
  { key: 'status', header: 'Status', sortable: { sortKey: 'status' }, renderCell: (m) => statusToken(m.status) },
];
```

(`LatencyCell` = extraction en composant du JSX actuel de la cellule latence, inchangé : pastille de niveau + `sr-only` + valeurs mono. `TimeCell` inchangé. Les `sortKey` sont directement les `SortColumn` du serveur, ce qui supprime `COLUMN_TO_SORT`.)

Tri contrôlé (forme attendue, à ajuster au `.d.ts` du Step 1) :

```tsx
const sortableState = useTableSortableState({
  sort: { key: sort.column, direction: sort.dir },
  onChange: (next) => {
    setSort({ column: next.key as SortColumn, dir: next.direction });
    setPage(1);
  },
});
const sortable = useTableSortable(sortableState);
```

Rendu :

```tsx
return (
  <Card className="backdrop-blur-sm">
    <div className="flex flex-col gap-4">
      <Heading level={2} className="label-eyebrow flex items-center gap-2">
        <span className="size-1.5 rounded-full bg-brand" aria-hidden />
        Recent measurements
      </Heading>
      <TableFilters
        value={filters}
        onChange={(next) => {
          setFilters(next);
          setPage(1);
        }}
      />
      {measurements.length === 0 ? (
        <div className="py-6 text-center text-muted-foreground" role="status">
          {loading && 'Loading...'}
          {!loading && totalCount === 0 && 'No measurements.'}
          {!loading && totalCount !== 0 && 'No rows match filters.'}
        </div>
      ) : (
        <Table
          data={measurements}
          columns={columns}
          plugins={[sortable]}
          density="compact"
          aria-label="Recent speedtest measurements, sortable and filterable."
        />
      )}
      <div
        className="flex flex-col gap-2 text-xs tabular-nums text-muted-foreground sm:flex-row sm:items-center sm:justify-between"
        aria-live="polite"
        aria-atomic="true"
      >
        <div>{totalCount === 0 ? 'No rows' : `Showing ${firstRow}-${lastRow} of ${totalCount}`}</div>
        <div className="flex items-center gap-4">
          <Selector
            label="Rows per page"
            isLabelHidden
            size="sm"
            options={PAGE_SIZES.map((n) => String(n))}
            value={String(pageSize)}
            onChange={(v) => {
              setPageSize(Number(v));
              setPage(1);
            }}
          />
          <div className="flex items-center gap-2">
            <span>
              Page {totalCount === 0 ? 0 : page} of {pageCount}
            </span>
            <IconButton
              icon={<ChevronLeft aria-hidden />}
              label="Previous page"
              variant="secondary"
              size="sm"
              isDisabled={page <= 1}
              onClick={() => setPage((p) => Math.max(1, p - 1))}
            />
            <IconButton
              icon={<ChevronRight aria-hidden />}
              label="Next page"
              variant="secondary"
              size="sm"
              isDisabled={page >= pageCount}
              onClick={() => setPage((p) => Math.min(pageCount, p + 1))}
            />
          </div>
        </div>
      </div>
    </div>
  </Card>
);
```

avec `firstRow`/`lastRow` recalculés depuis `page`/`pageSize` (formules identiques à l'existant, `pageIndex` = `page - 1`). Les imports lucide `ArrowDown/ArrowUp/ArrowUpDown` sautent (les indicateurs de tri viennent de la Table Astryx) ; `CircleCheck/CircleAlert/OctagonAlert` aussi (remplacés par les couleurs de Token).

Note TypeScript : `MeasurementDto` est un type alias objet, il satisfait la contrainte `T extends Record<string, unknown>` de la Table. Si tsc refuse, typer `Table` explicitement : `<Table<MeasurementDto> ... />`.

- [ ] **Step 3: Retirer TanStack des dépendances**

```bash
rtk grep -rn "@tanstack/react-table" app components lib
rtk proxy bun remove @tanstack/react-table
```

Expected: le grep ne montre plus aucune occurrence avant le remove ; `package.json` et `bun.lock` mis à jour.

- [ ] **Step 4: Vérifier le comportement complet**

```bash
rtk proxy bun lint
rtk proxy bun test
rtk npm run dev
```

Expected: lint et tests PASS. En manuel : tri par colonne (Time, Download, Upload, Latency, Status) déclenche un refetch serveur trié et revient page 1 ; `aria-sort` présent sur la colonne active (inspecter le DOM) ; filtres (plage numérique, dates, serveur, statuts) refetchent et les chips Token se suppriment ; pagination et taille de page fonctionnent ; le live-update (nouvelle mesure) rafraîchit la table via `refreshSignal`.

- [ ] **Step 5: Commit**

```bash
rtk git add components/history-table.tsx package.json bun.lock && rtk git commit -m "feat: migrate history table to Astryx Table and drop TanStack"
```

Expected: commit créé.

---

### Task 9: Validation finale

**Files:**
- Aucun nouveau fichier ; corrections éventuelles issues des vérifications.

**Interfaces:**
- Consumes: tout le travail des Tasks 1-8
- Produces: branche prête pour revue

- [ ] **Step 1: Vérifier qu'aucun résidu shadcn ne subsiste dans le périmètre**

```bash
rtk grep -rn "@/components/ui/" components/dashboard.tsx components/kpi-cards.tsx components/history-chart.tsx components/history-table.tsx components/table-filters.tsx components/time-range-picker.tsx
```

Expected: aucune occurrence.

- [ ] **Step 2: Vérifier les dépendances et exports morts**

```bash
rtk proxy bunx knip
```

Expected: pas de nouveau finding lié à la migration (les composants `components/ui/*` encore utilisés par la topbar/footer/autres pages ne doivent PAS être signalés ; si `select.tsx` ou `table.tsx` deviennent orphelins, les laisser : ils partent avec la migration complète, le noter dans le commit de la phase suivante).

- [ ] **Step 3: Build de production et tests**

```bash
rtk proxy bun lint
rtk proxy bun test
rtk npm run build
```

Expected: tout PASS, build Next.js sans erreur ni warning nouveau. Le poids de page sera comparé à `main` par le Lighthouse CI existant (`.lighthouserc.json`) au push : vérifier son rapport une fois la branche poussée.

- [ ] **Step 4: Audit accessibilité**

```bash
rtk npm run start &
rtk proxy bunx @axe-core/cli http://localhost:3003 --tags wcag2a,wcag2aa,wcag21a,wcag21aa
```

Expected: 0 violation (même niveau que `main`). Arrêter le serveur ensuite.

- [ ] **Step 5: Vérification visuelle finale light/dark**

Sur http://localhost:3003 : comparer avec `main` (les deux modes) : KPI cards, chart, table, filtres, segmented control, états de chargement. Les écarts mineurs de rendu Astryx (ombres, focus rings) sont acceptables ; tout écart de layout ou de couleur de marque se corrige dans `lib/astryx-theme.ts`, jamais dans les composants.

- [ ] **Step 6: Commit final si corrections**

```bash
rtk git status
rtk git add -A && rtk git commit -m "fix: polish Astryx dashboard migration after final validation"
```

Expected: uniquement si des corrections ont été faites aux Steps 1-5 ; sinon rien à committer.
