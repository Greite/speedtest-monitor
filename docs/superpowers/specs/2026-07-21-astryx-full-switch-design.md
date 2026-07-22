# Switch complet de l'application vers Astryx - Design (phase 2)

Date : 2026-07-21
Branche : `feat/astryx-dashboard` (à la suite de la phase 1, non mergée)
Spec précédente : `2026-07-21-astryx-dashboard-migration-design.md`

## Contexte

La phase 1 (dashboard) est terminée et validée visuellement : fondations posées (thème buildé, cascade layers explicites, providers), 6 composants migrés, conventions établies. Le rendu est concluant : le switch du reste de l'application est acté.

## Objectif et périmètre

Migrer tout ce qui reste sur shadcn/ui, puis supprimer shadcn et ses dépendances. Fichiers concernés (12 fichiers UI + toasts) :

- Settings : `app/settings/page.tsx`, `components/settings-form.tsx`, `components/settings/alerts-card.tsx`, `components/auth/password-change-card.tsx`
- Users : `components/users/users-card.tsx` (TanStack -> Table Astryx), `add-user-dialog.tsx`, `delete-user-dialog.tsx`, `reset-password-dialog.tsx`
- Auth : `components/auth/login-form.tsx`, `components/auth/setup-form.tsx`
- Chrome : `components/topbar.tsx` (remplacement direct des primitives, pas de refonte TopNav)
- Changelog : `app/changelog/page.tsx`
- Toasts : `app/layout.tsx` (Toaster sonner) + les 7 fichiers appelant `toast(...)` -> Toast Astryx

Hors périmètre : `components/footer.tsx` et `components/markdown.tsx` (aucune primitive shadcn), tout `lib/`, les routes et flux de données.

Critère de succès : parité visuelle et fonctionnelle, zéro régression a11y, plus aucun import `@/components/ui/*` ni sonner/TanStack/radix dans le projet.

## Mapping des nouvelles primitives

| shadcn | Astryx | Usages |
|---|---|---|
| Alert | Banner | 9 |
| Dialog, ConfirmDialog | Dialog | 6 |
| Input + Label + RequiredMark | TextInput (`isRequired`) + FormLayout/Field | 15 |
| PasswordInput | TextInput `type="password"` | 5 |
| DropdownMenu (topbar) | DropdownMenu | 1 |
| Switch | Switch | 1 |
| sonner (`toast.*`) | Toast Astryx | layout + 7 fichiers |

Les primitives déjà mappées en phase 1 (Card+Heading, Button/IconButton, Badge->Token, Select->Selector, Skeleton, Table data-driven) réutilisent les idiomes établis. `users-card.tsx` suit le pattern `history-table` (colonnes `renderCell`, tri via `useTableSortable` si applicable, `width` par colonne dès le départ).

## Conventions réutilisées (phase 1)

- Ordre des cascade layers déclaré dans `app/globals.css:5` : ne pas le modifier ; les utilities Tailwind gagnent sur `astryx-base`.
- `padding={0}` + classes de spacing explicites quand la structure interne gère son propre padding.
- Plancher tactile 44px mobile (`min-h-11 md:min-h-7` et variantes) sur tout contrôle interactif.
- Wrappers `[&_button]` quand un composant Astryx avale son `className` (ToggleButton, Token).
- Thème buildé : si Banner/Toast/Dialog exigent de nouveaux tokens, les ajouter dans `lib/astryx-theme.ts` PUIS régénérer `lib/speedtest.*` via la CLI (`astryx theme build`).
- Versions Astryx épinglées exactes ; imports par sous-chemin ; `bun lint` avant chaque commit.

## Nettoyage final

Une fois les 12 fichiers migrés et les toasts remplacés :

- Supprimer `components/ui/*` en entier.
- `bun remove radix-ui class-variance-authority tw-animate-css @tanstack/react-table sonner` (lève l'amendement de la phase 1 sur TanStack).
- Vérifier via knip qu'aucun orphelin ni dépendance morte ne reste ; `@astryxdesign/cli` reste (build du thème).
- Purger de `app/globals.css` les styles devenus morts s'il y en a.

## Validation

- Gates par tâche : `bun lint`, `bun test`, et vérifications de rendu statiques proportionnées.
- Fin de parcours : build de prod, axe-core WCAG 2.1 AA sur `/login` et `/`, attention spécifique aux Dialogs (focus trap, Escape, retour de focus) et aux Toasts (aria-live).
- Passe visuelle finale par l'utilisateur, page par page (settings et users sont derrière l'authentification).
- Lighthouse CI au push (poids CSS déjà sous surveillance depuis la phase 1).

## Risques assumés

- L'API Toast Astryx est la principale inconnue : vérifiée en tout début de plan (comme la Table en phase 1) ; si elle ne couvre pas les usages actuels de sonner (richColors, closeButton, position), l'écart est documenté et arbitré avant de migrer les appels.
- Les Dialogs changent de mécanique de focus (Radix -> Astryx) : re-test manuel des 6 modales requis.
- La topbar est le composant le plus visible de l'application : sa tâche prévoit une vérification de rendu renforcée.

## Backlog hérité de la phase 1 (à traiter dans cette phase si trivial, sinon reporté)

- NumberInput pour les min/max des filtres de table.
- Couleurs par statut sur les toggles de filtre actifs.
- Translucidité des cartes (décision : accepter l'opaque ou ajouter un alpha au token card).
- Script `theme:build` dans package.json + check de fraîcheur CI de `lib/speedtest.*`.
- Layer `properties` explicite dans la déclaration d'ordre de `globals.css`.
