# Migration du dashboard vers Astryx - Design

Date : 2026-07-21
Branche : `feat/astryx-dashboard`

## Contexte

Astryx (https://astryx.atmeta.com/) est le design system open source de Meta (licence MIT, actuellement en bêta) : React + StyleX en interne, exposé sous forme de CSS pré-compilé et de composants typés, plus de 150 composants accessibles, theming par CSS custom properties, CLI et serveur MCP pour les agents IA.

La migration complète du projet vers Astryx est actée. Cette première étape migre la page principale (dashboard) et pose les fondations réutilisables pour les pages suivantes.

## Objectif et périmètre

- Migrer le contenu du dashboard : `dashboard.tsx`, `kpi-cards.tsx`, `time-range-picker.tsx`, `history-chart.tsx`, `history-table.tsx`, `table-filters.tsx`.
- Hors périmètre : topbar, footer, pages settings/changelog/login/setup. Ils restent en shadcn/ui pour cette phase.
- Critère de succès : parité visuelle et fonctionnelle avec l'existant, zéro régression a11y.

## Fondations

- Packages : `@astryxdesign/core`, `@astryxdesign/theme-neutral` (dependencies), `@astryxdesign/cli` (devDependency).
- Versions épinglées en exact (pas de `^`) tant qu'Astryx est en bêta.
- Imports CSS Astryx et `ThemeProvider` dans `app/layout.tsx`. Le provider est global mais n'affecte visuellement que les composants Astryx, donc uniquement le dashboard dans cette phase.

## Theming

- Fichier `lib/astryx-theme.ts` créant le thème via `defineTheme` (API officielle Astryx) : chaque token accepte un tuple `[light, dark]`, mappé sur les valeurs oklch existantes de `globals.css` (brand, background, card, border, radius, typographie).
- Pont dark mode : le composant `Theme` d'Astryx reçoit un `mode` contrôlé, piloté par `resolvedTheme` de `next-themes`. Un seul mécanisme de toggle, celui qui existe déjà.
- Objectif : transition visuellement invisible pour l'utilisateur, cohérence avec la topbar/footer non migrés.

## Migration des composants

Remplacement direct des primitives, logique métier intacte :

| Fichier | shadcn actuel | Astryx |
|---|---|---|
| `dashboard.tsx` | Card, CardContent, Skeleton | Card, Skeleton |
| `kpi-cards.tsx` | Card, CardContent, CardHeader, CardTitle | Card, Heading |
| `time-range-picker.tsx` | Segmented control fait main (pill animée, ~90 lignes) | SegmentedControl |
| `history-chart.tsx` | Button, Card, CardContent, CardHeader, CardTitle | Button, Card (Recharts conservé) |
| `history-table.tsx` | Badge, Button, Card, Select, Table + TanStack Table | Card, Heading, Selector, IconButton, Token, Table Astryx (data-driven : `columns` + `data` + `renderCell`) |
| `table-filters.tsx` | Badge, Button, Input, Label | TextInput, DateTimeInput, Token, Button, IconButton, ToggleButtonGroup/ToggleButton |

Notes :

- Les composants shadcn de `components/ui` restent en place (utilisés par la topbar, le footer et les autres pages). Ils seront supprimés en fin de migration complète, pas dans cette phase.
- La Table Astryx est data-driven et ne peut pas envelopper du markup TanStack. Comme le tri, les filtres et la pagination de `history-table` sont déjà gérés côté serveur (`/api/measurements/table`) avec du state local, TanStack n'y sert que de couche de rendu : il est remplacé par les `TableColumn` Astryx (`renderCell`) et son plugin de tri contrôlé. Décision validée le 2026-07-21. Amendement d'implémentation : le retrait de `@tanstack/react-table` du package.json est reporté à la phase settings, car `components/users/users-card.tsx` (hors périmètre dashboard) en dépend encore ; plus aucun fichier du dashboard ne l'importe.
- `@astryxdesign/charts` n'existe qu'en canary : Recharts est conservé pour `history-chart.tsx`, avec un style de tooltip aligné sur les tokens Astryx.
- Le SegmentedControl Astryx remplace la gestion manuelle de la pill animée du `time-range-picker` ; l'API publique du composant (`value`, `onChange`, `className`) ne change pas.

## Ce qui ne change pas

- `useLiveMeasurements`, `use-table-measurements`, tout `lib/`.
- Les routes, le flux de données, le rendu serveur de `app/page.tsx`.
- Recharts.
- Tout ce qui est hors dashboard.

## Validation

- `bun lint` (tsc + biome), `bun test`.
- `bun test:a11y` (axe-core, WCAG 2.1 AA) sur la page d'accueil.
- Vérification visuelle light/dark.
- Comparaison du poids de page via le Lighthouse CI existant (`.lighthouserc.json`).

## Risques assumés

- Astryx est en bêta : API potentiellement mouvante, d'où l'épinglage exact des versions.
- CSS Astryx ajouté au bundle : mesuré via Lighthouse, à surveiller.
- Rendu du SegmentedControl Astryx potentiellement différent de l'animation pill actuelle : accepté si l'écart reste mineur.

## Conventions pour les pages suivantes

- Tout nouveau composant UI s'écrit directement avec Astryx.
- Les pages restantes (settings, changelog, login, setup, puis topbar/footer) seront migrées dans des phases ultérieures, chacune avec sa propre spec si nécessaire.
- Le thème custom (`lib/astryx-theme.ts`) est la source unique des overrides : ne pas dupliquer de tokens dans les composants.
