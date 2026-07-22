# Astryx Post-Migration Polish Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Traiter le backlog non bloquant post-migration : déduplication (NativeInputAttrs, chrome de dialog, Badge/Token), améliorations UX (NumberInput, couleurs de statut, glyphes du menu thème, purge backdrop-blur) et contraste du bouton Sign in (dernière violation axe).

**Architecture:** Tout est du raffinement sur du code migré et revu : extractions vers `lib/`, adoption de sous-composants Astryx déjà présents dans le package, et un ajustement de token synchronisé entre `globals.css` et le thème buildé. Aucune nouvelle dépendance, aucun changement d'API publique.

**Tech Stack:** existant (Astryx 0.1.7 épinglé, Tailwind 4, Bun). Décisions actées : cartes opaques (blur supprimé), brand clair assombri app-wide.

**Spec:** `docs/superpowers/specs/2026-07-21-astryx-polish-design.md`

## Global Constraints

- rtk prefix pour les commandes shell ; commits une seule ligne de titre, anglais, pas de body/trailers ; commentaires avec tirets, jamais de tirets cadratins.
- Gates avant chaque commit : `rtk proxy bun lint` (seuls les 2 warnings préexistants de `lib/runtime-config.ts`) et `rtk proxy bun test` (178/178).
- Toute modification de `lib/astryx-theme.ts` s'accompagne de `rtk proxy bun run theme:build` DANS LE MÊME COMMIT (lib/speedtest.* régénérés) - c'est la règle de synchronisation établie.
- Ordre des cascade layers de `app/globals.css:5` intouchable.
- Les `.d.ts` des composants Astryx nouvellement utilisés (NumberInput, DialogHeader, DropdownMenuItem composé) se lisent AVANT d'appliquer le code du plan ; adaptations documentées au rapport.
- Vérifications de rendu : scripts jetables `renderToStaticMarkup` supprimés après, jamais committés.

## File Structure

| Tâche | Fichiers |
|---|---|
| 1 DRY | Create `lib/native-input-attrs.ts`, `components/use-dialog-a11y-ids.ts` ; Modify les 7 fichiers à NativeInputAttrs local, les 4 dialogs, `components/settings-form.tsx`, `lib/astryx-theme.ts` (+ speedtest.* rebuild) |
| 2 UX | Modify `components/table-filters.tsx`, `components/settings/alerts-card.tsx`, `components/users/users-card.tsx` (pills), `components/topbar.tsx` (menu thème), cartes avec backdrop-blur, `lib/utils.ts` (statusPillClasses) |
| 3 Contraste | Modify `app/globals.css:81`, `lib/astryx-theme.ts` (+ rebuild) |
| 4 Validation | aucun nouveau fichier |

---

### Task 1: Sweep DRY

**Files:**
- Create: `lib/native-input-attrs.ts`
- Create: `components/use-dialog-a11y-ids.ts`
- Modify: `components/auth/login-form.tsx`, `components/auth/setup-form.tsx`, `components/auth/password-change-card.tsx`, `components/settings-form.tsx`, `components/settings/alerts-card.tsx`, `components/users/add-user-dialog.tsx`, `components/users/reset-password-dialog.tsx` (import du type partagé)
- Modify: `components/users/add-user-dialog.tsx`, `components/users/reset-password-dialog.tsx` (DialogHeader)
- Modify: `components/users/delete-user-dialog.tsx`, `components/topbar.tsx` (hook a11y ids)
- Modify: `components/settings-form.tsx` (pastille env-default), `lib/astryx-theme.ts` + `lib/speedtest.*` (retrait BadgeVariantMap)

**Interfaces:**
- Consumes: `DialogHeader` depuis `@astryxdesign/core/Dialog` (lire le .d.ts : props titre/description/onClose, et son focus-sur-titre)
- Produces: `export type NativeInputAttrs` (lib/native-input-attrs.ts) et `export function useDialogA11yIds(): { labelId: string; descriptionId: string }` (components/use-dialog-a11y-ids.ts), consommés par les tâches suivantes et le futur code

- [ ] **Step 1: Créer `lib/native-input-attrs.ts`**

```ts
import type { InputHTMLAttributes } from 'react';

// Astryx TextInput's typed props extend the generic HTMLAttributes, not
// InputHTMLAttributes, so native input attributes are missing from the type.
// Its ...rest props DO spread onto the real <input> (verified in
// TextInput.js), so passing them works at runtime and in SSR - this Pick
// makes that escape hatch type-safe. Usage:
//   <TextInput {...({ autoComplete: 'email' } satisfies NativeInputAttrs)} />
export type NativeInputAttrs = Pick<
  InputHTMLAttributes<HTMLInputElement>,
  'autoComplete' | 'required' | 'minLength' | 'inputMode' | 'pattern'
>;
```

Puis dans les 7 fichiers : supprimer la définition locale (type + commentaire) et importer `import type { NativeInputAttrs } from '@/lib/native-input-attrs';`. Les `satisfies NativeInputAttrs` existants restent valides (le Pick partagé est un sur-ensemble).

- [ ] **Step 2: Créer `components/use-dialog-a11y-ids.ts`**

```ts
'use client';

import { useId } from 'react';

// Astryx Dialog does not auto-wire aria-labelledby/aria-describedby (unlike
// its own AlertDialog, whose manual pattern our destructive confirms
// replicate). This hook centralizes the id pairing.
export function useDialogA11yIds(): { labelId: string; descriptionId: string } {
  const labelId = useId();
  const descriptionId = useId();
  return { labelId, descriptionId };
}
```

Adopter dans `delete-user-dialog.tsx` et le `LogoutConfirmDialog` de `topbar.tsx` (remplace leurs paires `useId()` locales ; le câblage `aria-labelledby={labelId}` / `aria-describedby={descriptionId}` ne change pas).

- [ ] **Step 3: DialogHeader sur les dialogs de formulaire**

Lire d'abord : `rtk proxy sh -c "cat node_modules/@astryxdesign/core/dist/Dialog/DialogHeader.d.ts"`. Puis dans `add-user-dialog.tsx` et `reset-password-dialog.tsx`, remplacer le bloc manuel Heading+Text+ids par `DialogHeader` avec ses props titre/description (le composant fournit le bouton X et le focus-sur-titre). Si `DialogHeader` pose lui-même l'accessible name du Dialog, retirer les `aria-labelledby`/`aria-describedby` manuels de ces deux fichiers ; sinon les garder branchés sur les ids que DialogHeader expose. Le X ferme via `onOpenChange(false)` - vérifier la prop de fermeture du DialogHeader (probablement `onClose`).

- [ ] **Step 4: Pastille env-default en Token + liaison aria**

Dans `components/settings-form.tsx` : remplacer le `Badge` « env default: N » par un `Token` (mêmes props visuelles que les Tokens d'alerts-card) ; pour la liaison au champ, intégrer l'information dans la `description` du TextInput (chaîne : composer « env default: N - between 1 and 1440... » si c'est lisible) OU garder la pastille visuelle en la marquant `aria-hidden` avec l'info dans la description - choisir la variante la plus lisible et la documenter. Retirer ensuite l'augmentation `BadgeVariantMap` de `lib/astryx-theme.ts` si plus rien ne l'utilise (grep Badge dans app/components d'abord) et lancer `rtk proxy bun run theme:build` (le diff lib/speedtest.* fait partie du commit).

- [ ] **Step 5: Gates, vérification, commit**

```bash
rtk grep -rn "NativeInputAttrs =" app components   # une seule définition attendue : lib/native-input-attrs.ts
rtk proxy bun lint && rtk proxy bun test
rtk git add -A && rtk git commit -m "refactor: share NativeInputAttrs and dialog a11y helpers, unify env pill on Token"
```

---

### Task 2: UX / visuel

**Files:**
- Modify: `lib/utils.ts` (ajout `statusPillClasses`), `components/table-filters.tsx`, `components/settings/alerts-card.tsx`, `components/topbar.tsx`, plus toute carte portant `backdrop-blur-sm` (grep)

**Interfaces:**
- Consumes: `NumberInput` depuis `@astryxdesign/core/NumberInput` (lire .d.ts : modèle de valeur number|undefined ?, onChange, min/max, label/isLabelHidden, size, width) ; `DropdownMenuItem` composé depuis `@astryxdesign/core/DropdownMenu` (props icon/endContent/onClick) ; `togglePillClasses` existant (lib/utils.ts)
- Produces: `statusPillClasses(level: 'ok' | 'warn' | 'bad'): string` dans lib/utils.ts

- [ ] **Step 1: NumberInput sur les champs numériques**

Lire le .d.ts. Si le modèle de valeur convient (contrôlé, number ou string numérique, onChange direct) : migrer les 6 min/max de `table-filters.tsx` (le `parseNumber` s'adapte ou disparaît selon le type reçu) et les 5 seuils d'`alerts-card.tsx` (même logique). Conserver labels cachés, `description`, statuts d'erreur et widths actuels. Si l'API est inadaptée (p. ex. pas de valeur vide représentable), rester sur TextInput et documenter précisément pourquoi au rapport - c'est le repli prévu par la spec.

- [ ] **Step 2: Couleurs de statut sur les toggles actifs**

Dans `lib/utils.ts`, à côté de `togglePillClasses` :

```ts
// Per-status color cues for pressed ToggleButtons, layered on top of
// togglePillClasses via nth-child (ToggleButton drops className, and the
// group requires direct children - see togglePillClasses rationale).
export function statusPillClasses(position: 1 | 2 | 3, level: 'ok' | 'warn' | 'bad'): string {
  return `[&_button:nth-of-type(${position})[aria-pressed='true']]:text-latency-${level} [&_button:nth-of-type(${position})[aria-pressed='true']]:border-latency-${level}/30 [&_button:nth-of-type(${position})[aria-pressed='true']]:bg-latency-${level}/10`;
}
```

ATTENTION Tailwind 4 : les classes construites dynamiquement ne sont pas détectées par le scanner. Écrire plutôt les trois variantes en littéraux complets (une constante par statut, chaînes statiques) - le code ci-dessus montre l'intention, l'implémentation DOIT être trois chaînes littérales statiques (`statusPillClassesOk`, `...Warn`, `...Bad` ou un objet à clés littérales). Appliquer sur le wrapper du groupe Status de `table-filters.tsx` (ordre des boutons : OK=1, Timeout=2, Error=3, avec un commentaire liant l'ordre au tableau STATUSES). Les groupes Role/Provider de users-card ne sont PAS concernés (pas de sémantique de couleur).

- [ ] **Step 3: Purge backdrop-blur**

```bash
rtk grep -rn "backdrop-blur" app components
```

Supprimer la classe sur toutes les cartes (décision opaque actée) ; ne pas toucher aux autres usages éventuels (vérifier le contexte de chaque hit ; l'`app-backdrop` du layout n'est pas une carte).

- [ ] **Step 4: Glyphes du menu thème**

Lire le .d.ts du `DropdownMenuItem` composé. Dans `topbar.tsx`, convertir le menu thème des items data-driven aux enfants composés : chaque item avec `icon` (Sun/Moon/Monitor, comme avant la migration), `endContent={active ? <Check aria-hidden /> : undefined}`, `onClick={() => setTheme(...)}` ; reconstruire le label de section « Theme » avec l'équivalent Astryx trouvé au .d.ts (sinon un item non interactif stylé, documenté). L'accessible name du déclencheur (`aria-label="Theme: ..."`) ne change pas.

- [ ] **Step 5: Gates, vérification statique, commit**

Script jetable : rendu du groupe Status avec un statut actif de chaque type - asserter la présence des classes latency-ok/warn/bad sur le bon bouton ; rendu du menu thème ouvert si possible (sinon assertion sur la structure des items). Supprimer le script.

```bash
rtk proxy bun lint && rtk proxy bun test
rtk git add -A && rtk git commit -m "feat: polish filters, status pills, theme menu glyphs and drop dead blur"
```

---

### Task 3: Contraste du bouton Sign in

**Files:**
- Modify: `app/globals.css:81` (`--brand` clair), `lib/astryx-theme.ts` (`--color-accent` clair) + `lib/speedtest.*` (rebuild)

**Interfaces:**
- Consumes: la règle de synchronisation theme:build (Global Constraints)
- Produces: un brand clair >= 4.5:1 sur texte blanc, axe /login à zéro violation

- [ ] **Step 1: Trouver empiriquement la valeur la plus claire qui passe**

L'oracle est axe sur la page réelle (il mesure le rendu, pas la théorie). Démarrer à `oklch(0.55 0.19 250)` :

1. Modifier `--brand` dans `app/globals.css` (`:root`, ligne ~81) ET `--color-accent` light dans `lib/astryx-theme.ts` avec la MÊME valeur ; `rtk proxy bun run theme:build`.
2. `rtk npm run build && rtk npm run start &` puis `rtk proxy bunx @axe-core/cli http://localhost:3003/login --tags wcag2a,wcag2aa,wcag21a,wcag21aa` (attention au quirk d'épinglage bunx documenté en phase 1).
3. Si la violation color-contrast persiste : descendre L de 0.01 et répéter. Si elle passe : tenter L+0.005 pour maximiser la fidélité, garder la plus claire qui passe.

Arrêter le serveur entre les itérations. Valeur attendue dans la zone 0.53-0.56.

- [ ] **Step 2: Vérifier zéro violation et l'absence d'effets de bord**

Run final : axe /login = 0 violation (c'était la dernière). `rtk git diff` doit montrer exactement : globals.css (1 valeur), astryx-theme.ts (1 valeur), lib/speedtest.* (régénérés). Le mode sombre est intouché.

- [ ] **Step 3: Gates et commit**

```bash
rtk proxy bun lint && rtk proxy bun test
rtk git add app/globals.css lib/astryx-theme.ts lib/speedtest.* && rtk git commit -m "fix: darken light brand token to meet WCAG contrast on Sign in"
```

---

### Task 4: Validation finale du lot

**Files:** aucun nouveau ; corrections éventuelles.

- [ ] **Step 1: Gates complets**

```bash
rtk proxy bun lint && rtk proxy bun test && rtk npm run build
```

- [ ] **Step 2: Vérifications de cohérence**

```bash
rtk grep -rn "NativeInputAttrs =" app components        # 0 hit (seul lib/ définit)
rtk grep -rn "backdrop-blur" app components             # 0 hit sur les cartes
rtk grep -rn "useId()" components/users components/topbar.tsx | grep -v use-dialog-a11y-ids   # 0 hit dans les confirms destructifs
rtk npm run start &
rtk proxy bunx @axe-core/cli http://localhost:3003/login --tags wcag2a,wcag2aa,wcag21a,wcag21aa   # 0 violation
```

Arrêter le serveur.

- [ ] **Step 3: Checklist visuelle pour l'utilisateur (dans le rapport)**

Teinte brand en mode clair (dashboard + login) ; pills de statut colorées quand actives ; glyphes + Check du menu thème ; bouton X et focus des dialogs add-user/reset-password ; rendu NumberInput (clavier numérique mobile) ; cartes opaques assumées.

- [ ] **Step 4: Commit final si corrections**

`rtk git status` ; si corrections : `rtk git add -A && rtk git commit -m "fix: polish batch final adjustments"`.
