# Astryx Full Application Switch Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Migrer les 13 fichiers restants de shadcn/ui vers Astryx (settings, users, auth, topbar, changelog, toasts), puis supprimer shadcn et ses dépendances (radix-ui, CVA, tw-animate-css, TanStack, sonner).

**Architecture:** Continuation de la phase 1 sur la même branche : les fondations (thème buildé, cascade layers explicites dans `app/globals.css:5`, providers) existent déjà. Chaque tâche migre un groupe cohérent de fichiers par remplacement direct de primitives, en réutilisant les idiomes établis. Les toasts passent de l'API module de sonner au hook `useToast()` d'Astryx. Le nettoyage final supprime `components/ui/*` et 5 dépendances.

**Tech Stack:** Next.js 16, React 19, Bun, Tailwind 4, `@astryxdesign/core` 0.1.7 (épinglé), thème buildé `lib/speedtest.*`.

**Spec:** `docs/superpowers/specs/2026-07-21-astryx-full-switch-design.md`

## Global Constraints

- Toutes les commandes shell préfixées par `rtk` (`rtk proxy <cmd>` pour l'exécution brute).
- Ne PAS modifier l'ordre des cascade layers de `app/globals.css:5` ; les utilities Tailwind gagnent sur `astryx-base`.
- `components/ui/*` reste en place jusqu'à la tâche de nettoyage (Task 10) - des fichiers non encore migrés en dépendent entre-temps.
- Plancher tactile 44px mobile sur tout contrôle interactif : `min-h-11 md:min-h-7` (ou `min-h-11 min-w-11 md:min-h-7 md:min-w-7` pour les boutons icône), via wrapper `[&_button]` si le composant avale son `className` (ToggleButton, Token).
- `padding={0}` + classes de spacing explicites quand la structure interne d'une Card gère son propre padding ; sinon laisser le padding Astryx par défaut.
- Si de nouveaux tokens sont nécessaires (Banner, Toast, Dialog) : les ajouter dans `lib/astryx-theme.ts` PUIS régénérer via `rtk proxy bunx astryx theme build` (sortie `lib/speedtest.*`) dans le même commit.
- Commits : une seule ligne de titre, anglais, conventional commits, pas de body ni trailer. Commentaires code : tirets, jamais de tirets cadratins.
- Gates avant chaque commit : `rtk proxy bun lint` (exit 0, seuls les 2 warnings préexistants de `lib/runtime-config.ts` tolérés) et `rtk proxy bun test` (178/178).
- Astryx 0.1.7 en bêta : chaque tâche lit les `.d.ts` des composants qu'elle introduit AVANT d'appliquer le code du plan, et adapte si les signatures diffèrent. Le code du plan est la référence d'intention.
- Vérification de rendu sans navigateur : script jetable `renderToStaticMarkup` (supprimé après, jamais committé) + curl du serveur dev ; les pages authentifiées (settings, users) ne sont vérifiables que statiquement - le noter dans les rapports.
- API Toast vérifiée (0.1.7) : `useToast()` depuis `@astryxdesign/core/Toast` retourne `toast(options: ToastOptions) => dismiss` ; `ToastOptions = {body, type?: 'info'|'error', isAutoHide?, autoHideDuration?, endContent?, uniqueID?, onHide?}`. PAS de type 'success' : les messages de succès deviennent type info (défaut). `ToastViewport` optionnel (viewport auto-monté sinon), positions `'topEnd'|'topStart'|'bottomEnd'|'bottomStart'`.

## File Structure

| Tâche | Fichiers |
|---|---|
| 1 Toasts | `app/layout.tsx`, `components/settings/alerts-card.tsx`, `components/settings-form.tsx`, `components/auth/password-change-card.tsx`, `components/users/{delete-user,reset-password,add-user}-dialog.tsx`, `components/users/users-card.tsx` (appels toast uniquement) |
| 2 Auth | `components/auth/login-form.tsx`, `components/auth/setup-form.tsx` |
| 3 Password card | `components/auth/password-change-card.tsx` |
| 4 Settings form | `components/settings-form.tsx` |
| 5 Alerts card | `components/settings/alerts-card.tsx` |
| 6 Dialogs users | `components/users/{add-user,delete-user,reset-password}-dialog.tsx` |
| 7 Users table | `components/users/users-card.tsx` |
| 8 Topbar | `components/topbar.tsx` |
| 9 Pages | `app/changelog/page.tsx`, `app/settings/page.tsx` |
| 10 Cleanup | `components/ui/*` (suppression), `package.json`, `app/globals.css` |
| 11 Validation | aucun nouveau fichier |

---

### Task 1: Migration des toasts (sonner -> useToast Astryx)

**Files:**
- Modify: `app/layout.tsx:6,63` (import Toaster + `<Toaster position="top-right" richColors closeButton />`)
- Modify: les 7 fichiers listés ci-dessus (appels `toast.success/error` uniquement, aucune autre primitive)

**Interfaces:**
- Consumes: `useToast` et `ToastViewport` depuis `@astryxdesign/core/Toast` (API vérifiée, voir Global Constraints)
- Produces: plus aucun import `sonner` dans `app/` ni `components/` ; les tâches 3-7 retrouveront ces fichiers avec les toasts déjà migrés

- [ ] **Step 1: Lire le .d.ts de ToastViewport**

```bash
rtk proxy sh -c "cat node_modules/@astryxdesign/core/dist/Toast/ToastViewport.d.ts"
```

Expected: props de positionnement (attendu `position?: ToastPosition`). Adapter le Step 2 si besoin.

- [ ] **Step 2: Remplacer le Toaster dans `app/layout.tsx`**

Supprimer `import { Toaster } from 'sonner';` et remplacer :

```tsx
          <Toaster position="top-right" richColors closeButton />
```

par :

```tsx
          <ToastViewport position="topEnd" />
```

avec l'import :

```tsx
import { ToastViewport } from '@astryxdesign/core/Toast';
```

Note : `ToastViewport` est un composant client ; si `app/layout.tsx` (Server Component) refuse de le rendre directement, le déplacer dans `components/astryx-providers.tsx` (client) à la place, après `{children}` - documenter le choix dans le rapport.

- [ ] **Step 3: Convertir les appels dans les 7 fichiers**

Dans chaque fichier : supprimer `import { toast } from 'sonner';`, ajouter `import { useToast } from '@astryxdesign/core/Toast';` et `const toast = useToast();` en tête du composant qui contient les handlers. Conversions mécaniques :

```tsx
// avant
toast.success('Alerts saved');
toast.error(apiErr.message);
toast.error(err instanceof Error ? err.message : 'Save failed');

// après
toast({ body: 'Alerts saved' });
toast({ body: apiErr.message, type: 'error' });
toast({ body: err instanceof Error ? err.message : 'Save failed', type: 'error' });
```

Attention : `useToast` est un hook - il doit être appelé au niveau du composant, pas dans un handler ni dans une fonction utilitaire hors composant. Si un fichier appelle `toast` hors composant React, remonter le hook dans le composant appelant et passer la fonction en argument.

- [ ] **Step 4: Vérifier qu'aucun usage sonner ne reste dans le code**

```bash
rtk grep -rn "from 'sonner'" app components
```

Expected: aucune occurrence. (`lib/generated/releases.json` peut mentionner sonner : fichier généré de notes de release, hors périmètre.) Ne PAS retirer sonner de package.json ici (Task 10).

- [ ] **Step 5: Gates et vérification comportementale**

```bash
rtk proxy bun lint
rtk proxy bun test
```

Expected: PASS. Les toasts d'erreur ne s'auto-ferment pas par défaut (comportement Astryx voulu : `isAutoHide` défaut false pour error) - c'est un changement accepté vs sonner, le noter dans le rapport. Vérification de déclenchement réel différée à la passe visuelle (pages authentifiées).

- [ ] **Step 6: Commit**

```bash
rtk git add -A && rtk git commit -m "feat: migrate toasts from sonner to Astryx useToast"
```

---

### Task 2: Formulaires auth (login-form, setup-form)

**Files:**
- Modify: `components/auth/login-form.tsx` (153 lignes)
- Modify: `components/auth/setup-form.tsx` (200 lignes)

**Interfaces:**
- Consumes: `Card` (`@astryxdesign/core/Card`), `Heading` (`@astryxdesign/core/Text`), `Button` (`@astryxdesign/core/Button`, prop `label`, pas de children), `TextInput` (`@astryxdesign/core/TextInput` - `label`, `value`, `onChange(v: string)`, `type` parmi `'text'|'password'|'email'`, `isRequired`, `status={{type: 'error', message}}`, `width`), `Banner` (`@astryxdesign/core/Banner` - `status`, `title`, `description`), `FormLayout` (`@astryxdesign/core/FormLayout`)
- Produces: pages `/login` et `/setup` sans import `@/components/ui/*`

- [ ] **Step 1: Lire les .d.ts de Banner et FormLayout**

```bash
rtk proxy sh -c "cat node_modules/@astryxdesign/core/dist/Banner/Banner.d.ts | head -80; cat node_modules/@astryxdesign/core/dist/FormLayout/*.d.ts | head -60"
```

Expected: valeurs de `BannerStatus` (attendu au moins error/warning/info/success) et directions de FormLayout.

- [ ] **Step 2: Migrer `login-form.tsx`**

Mapping (logique de soumission, better-auth et redirections inchangées) :

- `Card`/`CardContent`/`CardHeader`/`CardTitle` -> `Card` + `Heading level={1}` (c'est le titre principal de la page login) + divs, idiome phase 1.
- `Input` + `Label htmlFor` -> `TextInput label="Email" type="email" ...` (le label intégré remplace le Label séparé ; supprimer les `id`/`htmlFor` devenus inutiles).
- `PasswordInput` -> `TextInput label="Password" type="password"`. Si l'ancien composant avait un bouton afficher/masquer, vérifier si `TextInput` l'offre (`hasClear`/variantes dans le .d.ts) ; sinon le perdre et le noter au rapport (écart mineur accepté).
- `Alert` d'erreur -> `Banner status="error" title={message}` (garder le rôle d'annonce : vérifier que Banner rend `role="alert"` ou équivalent aria-live ; sinon conserver un wrapper `role="alert"`).
- `Button type="submit"` -> `<Button type="submit" label="Sign in" isLoading={pending} width="100%" />` - vérifier dans Button.d.ts que `type="submit"` passe au DOM (prop native via rest) ; s'il ne passe pas, envelopper dans un `<form onSubmit>` avec le clic du bouton, mais NE PAS perdre la soumission par touche Entrée.

- [ ] **Step 3: Migrer `setup-form.tsx`**

Même mapping que le Step 2 (email, password, confirmation password, erreurs). La logique de création du premier compte ne change pas.

- [ ] **Step 4: Vérifier sur la page publique**

```bash
rtk proxy bun lint && rtk proxy bun test
rtk npm run dev &
sleep 4 && rtk curl http://localhost:3003/login | grep -c "astryx"
```

Expected: lint/tests PASS ; le HTML de /login contient des classes Astryx et plus aucune classe des composants shadcn migrés. Tuer le serveur. Soumission réelle du formulaire vérifiable en Task 11 (axe + navigateur).

- [ ] **Step 5: Commit**

```bash
rtk git add components/auth/login-form.tsx components/auth/setup-form.tsx && rtk git commit -m "feat: migrate auth forms to Astryx"
```

---

### Task 3: password-change-card

**Files:**
- Modify: `components/auth/password-change-card.tsx` (123 lignes, toasts déjà migrés en Task 1)

**Interfaces:**
- Consumes: mêmes composants que Task 2 (Card, Heading level={2}, TextInput type password, Button, Banner)
- Produces: carte settings sans import `@/components/ui/*`

- [ ] **Step 1: Migrer le fichier**

Mapping identique à la Task 2 : Card+Header/Title -> Card + `Heading level={2}` (c'est une carte de la page settings, pas un titre de page), 3 PasswordInput -> TextInput type password (current/new/confirm), Button submit avec `isLoading`, erreurs -> Banner status="error". Validation côté client (longueur, correspondance) inchangée.

- [ ] **Step 2: Gates et commit**

```bash
rtk proxy bun lint && rtk proxy bun test
rtk git add components/auth/password-change-card.tsx && rtk git commit -m "feat: migrate password change card to Astryx"
```

Expected: PASS. Page authentifiée : vérification statique seulement, le noter.

---

### Task 4: settings-form

**Files:**
- Modify: `components/settings-form.tsx` (249 lignes, toasts déjà migrés)

**Interfaces:**
- Consumes: Card, Heading, TextInput, `Selector` (`@astryxdesign/core/Selector` - `label`, `isLabelHidden` si le design le veut, `options`, `value`, `onChange(v: string)`), Button
- Produces: formulaire intervalle + rétention sans import `@/components/ui/*`

- [ ] **Step 1: Migrer le fichier**

Deux sections (intervalle de mesure, rétention). Mapping : Input+Label -> TextInput (garder `inputMode`/patterns actuels s'ils existent et que TextInput les propage via rest ; sinon noter la perte), Select -> Selector (options en strings, comme le pageSize de history-table), Button submit avec isLoading. La logique de fetch PATCH et la gestion d'erreur par champ (`status={{type:'error', message}}` sur le champ concerné si le code actuel le fait par champ) inchangées.

- [ ] **Step 2: Gates et commit**

```bash
rtk proxy bun lint && rtk proxy bun test
rtk git add components/settings-form.tsx && rtk git commit -m "feat: migrate settings form to Astryx"
```

---

### Task 5: alerts-card

**Files:**
- Modify: `components/settings/alerts-card.tsx` (370 lignes, toasts déjà migrés)

**Interfaces:**
- Consumes: Card, Heading, TextInput, `Switch` (`@astryxdesign/core/Switch` - `label`, `value` booléen contrôlé, `onChange(checked: boolean)`, `description`), Banner, Button
- Produces: carte alertes email sans import `@/components/ui/*`

- [ ] **Step 1: Lire le .d.ts de Switch pour le nom exact de la prop d'état**

```bash
rtk proxy sh -c "cat node_modules/@astryxdesign/core/dist/Switch/Switch.d.ts | head -100"
```

Expected: confirmer `value: boolean` (convention Astryx : composants contrôlés par `value`, pas `checked`).

- [ ] **Step 2: Migrer le fichier**

Mapping : shadcn Switch (`checked`/`onCheckedChange`) -> Astryx Switch (`value`/`onChange(checked)`) avec son `label` intégré (supprimer le Label séparé) ; Inputs SMTP/destinataires -> TextInput (type email où pertinent) ; Alert de statut -> Banner ; Badge éventuels -> Token. Les 44px tactiles s'appliquent au Switch si sa taille est sous le plancher (wrapper `[&_button]`/`[&_input]` selon le DOM rendu - vérifier). Logique de test SMTP et de sauvegarde inchangée.

- [ ] **Step 3: Gates et commit**

```bash
rtk proxy bun lint && rtk proxy bun test
rtk git add components/settings/alerts-card.tsx && rtk git commit -m "feat: migrate alerts card to Astryx"
```

---

### Task 6: Dialogs users (add, delete, reset-password)

**Files:**
- Modify: `components/users/add-user-dialog.tsx` (164 lignes)
- Modify: `components/users/delete-user-dialog.tsx` (101 lignes)
- Modify: `components/users/reset-password-dialog.tsx` (160 lignes)

**Interfaces:**
- Consumes: `Dialog` (`@astryxdesign/core/Dialog` - `isOpen`, `onOpenChange(open: boolean)`, `width`, `padding`, children libres ; focus trap et Escape gérés par l'élément `<dialog>` natif), Heading, TextInput, Button, Banner
- Produces: les 3 dialogs gardent leurs API publiques `{open, onOpenChange, ...}` consommées par `users-card.tsx` (qui les rouvre en Task 7 sans changement de contrat)

- [ ] **Step 1: Lire le .d.ts du Dialog et repérer les sous-composants**

```bash
rtk proxy sh -c "cat node_modules/@astryxdesign/core/dist/Dialog/*.d.ts | head -200"
```

Expected: props exactes (`variant`, `purpose`, `position`) et sous-composants éventuels (DialogHeader/DialogBody/DialogFooter ou children libres). Adapter le pattern du Step 2.

- [ ] **Step 2: Convertir `add-user-dialog.tsx` (pattern de référence pour les trois)**

```tsx
// avant (Radix via shadcn)
<Dialog open={open} onOpenChange={handleOpenChange}>
  <DialogContent>
    <DialogHeader>
      <DialogTitle>Add user</DialogTitle>
      <DialogDescription>...</DialogDescription>
    </DialogHeader>
    {/* formulaire */}
    <DialogFooter>...</DialogFooter>
  </DialogContent>
</Dialog>

// après (Astryx, children libres si pas de sous-composants dédiés)
<Dialog isOpen={open} onOpenChange={handleOpenChange} width={480}>
  <div className="flex flex-col gap-4">
    <div className="flex flex-col gap-1">
      <Heading level={2}>Add user</Heading>
      <Text type="body" className="text-muted-foreground">...</Text>
    </div>
    {/* formulaire : TextInput email + TextInput password, inchangés en logique */}
    <div className="flex justify-end gap-2">
      <Button variant="ghost" label="Cancel" onClick={() => handleOpenChange(false)} />
      <Button type="submit" label="Create user" isLoading={pending} />
    </div>
  </div>
</Dialog>
```

`DialogClose` disparaît (le Dialog Astryx gère Escape/backdrop) ; `open` -> `isOpen` ; le titre doit rester lié au dialog pour l'accessible name (vérifier si Dialog pose `aria-labelledby` automatiquement ou s'il faut `aria-label` sur le Dialog - le .d.ts du Step 1 le dit).

- [ ] **Step 3: Convertir `delete-user-dialog.tsx` et `reset-password-dialog.tsx`**

Même pattern. delete-user est une confirmation destructive : le bouton principal passe en `variant="destructive"` avec `label="Delete user"`. reset-password a un état de résultat (mot de passe généré affiché) : le conserver tel quel dans les children.

- [ ] **Step 4: Vérification de rendu statique des trois dialogs**

Script jetable `renderToStaticMarkup` (supprimé après) rendant chaque dialog avec `open={true}` dans le Theme : asserter la présence du Heading, des champs et des boutons. Si `<dialog>` natif ne se rend pas en SSR statique (showModal étant impératif), utiliser `isInline` UNIQUEMENT dans le script de test jetable (jamais dans le code de prod) et le documenter.

- [ ] **Step 5: Gates et commit**

```bash
rtk proxy bun lint && rtk proxy bun test
rtk git add components/users/ && rtk git commit -m "feat: migrate user dialogs to Astryx Dialog"
```

Expected: PASS. Re-test manuel focus/Escape différé à la passe visuelle (spec : risque assumé, 6 modales à re-tester).

---

### Task 7: users-card (Table Astryx, retrait TanStack du fichier)

**Files:**
- Modify: `components/users/users-card.tsx` (387 lignes, toasts déjà migrés)

**Interfaces:**
- Consumes: le pattern Table établi dans `components/history-table.tsx` (RÉFÉRENCE À LIRE : colonnes `TableColumn<T>` avec `renderCell` et `width: proportional()/pixel()`, `idKey`, `plugins={{sort: ...}}` seulement si la table users est triable aujourd'hui) ; Card, Heading, Button, Token ; les 3 dialogs de la Task 6 (API `{open, onOpenChange}` inchangées)
- Produces: plus aucun import `@tanstack/react-table` dans le projet (users-card était le dernier)

- [ ] **Step 1: Lire `components/history-table.tsx` comme référence du pattern**

C'est la migration jumelle déjà validée : colonnes data-driven, `idKey`, widths. La table users est plus simple (peu de lignes, pas de pagination serveur a priori - vérifier dans le fichier actuel ce que TanStack y fait réellement et ne reproduire QUE ça).

- [ ] **Step 2: Migrer le fichier**

- ColumnDef TanStack -> `TableColumn` avec `renderCell` et `width` explicites dès le départ (leçon phase 1 : `proportional(2)` pour la colonne principale email/nom, `pixel()` pour les colonnes d'actions).
- La colonne actions (boutons edit/delete/reset) -> `IconButton`s avec `label` accessible + plancher 44px.
- Badges de rôle -> `Token`.
- Si TanStack n'y faisait que du rendu (probable), pas de plugin de tri.
- Supprimer tous les imports `@tanstack/react-table` et vérifier :

```bash
rtk grep -rn "@tanstack" app components lib
```

Expected: zéro occurrence. Ne PAS retirer la dépendance ici (Task 10).

- [ ] **Step 3: Gates et commit**

```bash
rtk proxy bun lint && rtk proxy bun test
rtk git add components/users/users-card.tsx && rtk git commit -m "feat: migrate users table to Astryx Table"
```

---

### Task 8: Topbar

**Files:**
- Modify: `components/topbar.tsx` (469 lignes - le plus gros fichier restant et la surface la plus visible)

**Interfaces:**
- Consumes: `DropdownMenu` (`@astryxdesign/core/DropdownMenu` - prop `button`, `placement`, items en children), Button/IconButton, Token
- Produces: topbar sans import `@/components/ui/*` ; le skip-link, `FocusMainOnNavigate` et la navigation ne changent pas

- [ ] **Step 1: Lire le .d.ts du DropdownMenu et de ses items**

```bash
rtk proxy sh -c "cat node_modules/@astryxdesign/core/dist/DropdownMenu/*.d.ts | head -250"
```

Expected: signature de `button` (ReactNode ou props de bouton ?), composants d'item (MenuItem/DropdownMenuItem), support des séparateurs, des labels de section et d'un état coché (le menu thème actuel affiche un Check sur le thème actif - trouver l'équivalent : item avec `icon`, `isSelected`, ou role menuitemradio).

- [ ] **Step 2: Migrer le menu utilisateur et le menu thème**

- `DropdownMenu`+`DropdownMenuTrigger asChild`+`DropdownMenuContent` -> `DropdownMenu button={...} placement="..."` avec les items Astryx en children.
- Le sous-menu thème (Light/Dark/System avec Check sur l'actif) garde `useTheme()` de next-themes comme source ; l'état coché utilise le mécanisme natif des items Astryx trouvé au Step 1, sinon `icon={<Check/>}` conditionnel.
- `DropdownMenuSeparator` -> l'équivalent Astryx (Divider dans le menu) ; `DropdownMenuLabel` -> l'équivalent section/label.
- Le bouton burger mobile et les liens de nav : Button/IconButton Astryx avec plancher 44px ; les liens restent des `next/link` (le `LinkProvider` de la phase 1 fait déjà le pont pour les composants Astryx à `href`).

- [ ] **Step 3: Migrer le reste du fichier**

Badges/indicateurs -> Token ; boutons -> Button/IconButton avec `label`. Le déclenchement de mesure (bouton Play) garde son état `isLoading`/disabled pendant un run. Ne pas toucher au `<header>` sémantique ni au skip-link.

- [ ] **Step 4: Vérification renforcée (surface la plus visible)**

```bash
rtk proxy bun lint && rtk proxy bun test
rtk npm run dev &
sleep 4 && rtk curl -s http://localhost:3003/login | grep -o "<header[^>]*>" | head -1
```

Plus script jetable `renderToStaticMarkup` de la topbar (Theme + ThemeProvider mockée si nécessaire) : asserter le skip-link, le bouton menu avec accessible name, et l'absence de classes shadcn. Tuer le serveur. Menus ouverts/fermés : passe visuelle Task 11.

- [ ] **Step 5: Commit**

```bash
rtk git add components/topbar.tsx && rtk git commit -m "feat: migrate topbar to Astryx"
```

---

### Task 9: Pages changelog et settings

**Files:**
- Modify: `app/changelog/page.tsx` (149 lignes)
- Modify: `app/settings/page.tsx` (71 lignes)

**Interfaces:**
- Consumes: Card, Heading, Token, Banner (selon ce que chaque page importe réellement de `@/components/ui/*`)
- Produces: plus AUCUN fichier du projet n'importe `@/components/ui/*` (dernières occurrences)

- [ ] **Step 1: Migrer les deux pages**

ATTENTION : `app/changelog/page.tsx` et `app/settings/page.tsx` sont probablement des Server Components (pas de `'use client'`). Vérifier que les composants Astryx utilisés y sont RSC-compatibles (la doc Astryx a une page RSC-Utilities ; Card/Heading/Token rendent du DOM statique et devraient passer). Si un composant exige le client, extraire un petit composant client plutôt que de marquer la page entière `'use client'`. Mapping standard sinon : Card+Heading, Badge -> Token (versions du changelog), Alert -> Banner.

- [ ] **Step 2: Vérifier qu'il ne reste aucun consommateur shadcn**

```bash
rtk grep -rn "from '@/components/ui/" app components | grep -v "^components/ui/"
```

Expected: zéro occurrence.

- [ ] **Step 3: Gates et commit**

```bash
rtk proxy bun lint && rtk proxy bun test
rtk npm run dev &
sleep 4 && rtk curl -s -o /dev/null -w "%{http_code}" http://localhost:3003/changelog
```

Expected: PASS et 200 (changelog est public). Tuer le serveur.

```bash
rtk git add app/changelog/page.tsx app/settings/page.tsx && rtk git commit -m "feat: migrate changelog and settings pages to Astryx"
```

---

### Task 10: Nettoyage final

**Files:**
- Delete: `components/ui/` (les 15 fichiers)
- Modify: `package.json` (retrait de 5 dépendances + script theme:build)
- Modify: `app/globals.css` (layer `properties` explicite + purge des styles morts)

**Interfaces:**
- Consumes: le fait établi par les Tasks 1-9 que plus rien n'importe `@/components/ui/*`, sonner ni `@tanstack/react-table`
- Produces: projet 100% Astryx ; `bun run theme:build` disponible

- [ ] **Step 1: Supprimer components/ui et les dépendances**

```bash
rtk grep -rn "from '@/components/ui/\|from 'sonner'\|@tanstack" app components lib
rtk proxy rm -rf components/ui
rtk proxy bun remove radix-ui class-variance-authority tw-animate-css @tanstack/react-table sonner
```

Expected: le grep préalable retourne zéro occurrence AVANT le rm (sinon STOP : un fichier a été oublié, le migrer d'abord). Attention : `tailwind-merge` et `clsx` restent (utilisés par `cn()` dans `lib/utils.ts`, qui sert toujours aux className Tailwind).

- [ ] **Step 2: Backlog trivial - layer properties et script theme:build**

Dans `app/globals.css:5`, ajouter `properties` en tête de la déclaration d'ordre :

```css
@layer properties, theme, base, components, reset, astryx-base, utilities, astryx-theme;
```

Dans `package.json` scripts :

```json
"theme:build": "bunx astryx theme build"
```

(Vérifier la commande exacte utilisée par le commit 98902ee de la phase 1 : `rtk git show 98902ee --stat` et reprendre la même invocation. Lancer une fois `rtk proxy bun run theme:build` et vérifier par `rtk git diff lib/` que la sortie est stable - aucune diff attendue.)

- [ ] **Step 3: Purge des styles morts dans globals.css**

Chercher les classes définies pour les composants supprimés :

```bash
rtk grep -n "kpi-flash\|live-glow\|label-eyebrow\|skip-link\|app-backdrop\|pulse-ring\|kpi-value-gradient" app/globals.css
```

Pour chacune, vérifier qu'un fichier `.tsx` la référence encore (`rtk grep -rn "<classe>" app components`) ; supprimer celles qui ne sont plus référencées. Prudence : la plupart sont encore utilisées par les composants migrés - ne supprimer que les orphelines avérées.

- [ ] **Step 4: Knip et gates complets**

```bash
rtk proxy bunx knip
rtk proxy bun lint && rtk proxy bun test && rtk npm run build
```

Expected: knip sans nouvelle dépendance morte (`@astryxdesign/cli` est maintenant utilisé par theme:build) ; lint/tests/build PASS.

- [ ] **Step 5: Commit**

```bash
rtk git add -A && rtk git commit -m "chore: remove shadcn, radix, CVA, TanStack and sonner after Astryx switch"
```

---

### Task 11: Validation finale

**Files:** aucun nouveau ; corrections éventuelles issues des vérifications.

**Interfaces:**
- Consumes: tout le travail des Tasks 1-10
- Produces: branche prête pour la passe visuelle utilisateur puis le merge

- [ ] **Step 1: Gates complets et build**

```bash
rtk proxy bun lint && rtk proxy bun test && rtk npm run build
```

Expected: tout PASS. Le poids CSS (surveillé depuis la phase 1 : 229KB) sera comparé par le Lighthouse CI au push - noter le chiffre du rapport dans le commit de merge ou la PR.

- [ ] **Step 2: Audit accessibilité sur les pages publiques**

```bash
rtk npm run start &
rtk proxy bunx @axe-core/cli http://localhost:3003/login --tags wcag2a,wcag2aa,wcag21a,wcag21aa
rtk proxy bunx @axe-core/cli http://localhost:3003/changelog --tags wcag2a,wcag2aa,wcag21a,wcag21aa
```

Expected: aucune violation NOUVELLE vs main (le contraste du bouton login préexiste, déjà documenté en phase 1). Arrêter le serveur. Attention à l'épinglage d'axe-core/cli (quirk bunx rencontré en phase 1, voir task-9-report.md).

- [ ] **Step 3: Préparer la passe visuelle utilisateur**

Relancer le serveur dev et lister pour l'utilisateur les écrans à vérifier : /login, /setup (si accessible), dashboard (déjà validé phase 1 - vérifier l'absence de régression), /settings (formulaires, switch, cartes, les 3 dialogs, table users), /changelog, topbar (menus, thème, mobile), toasts (sauvegarder un réglage). Rappeler les 6 modales à tester au clavier (focus trap, Escape, retour de focus).

- [ ] **Step 4: Commit final si corrections**

```bash
rtk git status
```

Si des corrections ont été faites : `rtk git add -A && rtk git commit -m "fix: polish full Astryx switch after final validation"`. Sinon rien.
