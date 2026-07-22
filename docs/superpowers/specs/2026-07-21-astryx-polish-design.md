# Lot de polish post-migration Astryx - Design

Date : 2026-07-21
Branche : `feat/astryx-dashboard` (à la suite des phases 1 et 2)
Specs précédentes : `2026-07-21-astryx-dashboard-migration-design.md`, `2026-07-21-astryx-full-switch-design.md`

## Contexte

La migration complète vers Astryx est terminée et prête à merger. Ce lot traite le backlog non bloquant issu des revues : déduplication (sweep DRY), améliorations UX/visuelles, et le contraste du bouton Sign in (seule violation axe restante, préexistante à la migration).

Décisions actées avec l'utilisateur le 2026-07-21 :
- Cartes opaques ACCEPTÉES (pas de restauration de l'effet verre) ; les classes `backdrop-blur` mortes sont supprimées.
- Contraste : assombrissement du brand clair app-wide (pas de ton dédié au bouton).

## 1. Sweep DRY

- Type `NativeInputAttrs` partagé dans `lib/` (un seul point de vérité avec son commentaire de rationale) ; les 7 fichiers qui le dupliquent l'importent. Le Pick reste le sur-ensemble des clés utilisées (`autoComplete`, `required`, `minLength`, `inputMode`, `pattern`) - chaque site passe seulement ce dont il a besoin.
- Dialogs de formulaire (`add-user-dialog`, `reset-password-dialog`) : adoption du `DialogHeader` de la librairie (ramène le bouton X intégré et le focus-sur-titre à l'ouverture).
- Confirmations destructives (`delete-user-dialog`, `LogoutConfirmDialog` dans topbar) : pattern manuel conservé (aligné sur l'AlertDialog de la librairie) mais boilerplate `useId`/aria extrait dans un hook partagé `useDialogA11yIds()`.
- `settings-form` : pastille « env default » Badge -> Token (unification avec alerts-card) et liaison aria au champ. L'augmentation `BadgeVariantMap` du thème devenue inutile est retirée (+ rebuild du thème).

## 2. UX / visuel

- Champs numériques min/max des filtres de table + seuils d'alerts-card -> `NumberInput` Astryx, sous réserve que son modèle de valeur convienne (vérification .d.ts en début de tâche ; si inadapté, écart documenté et arbitré).
- Toggles de statut actifs : couleurs par statut (ok/warn/bad) via extension du pattern `togglePillClasses` avec ciblage `[&_button[aria-pressed='true']]`, par wrapper. Aucune modification du composant Astryx.
- Suppression des `backdrop-blur-sm` morts sur les cartes (décision opaque).
- Menu thème (topbar) : items data-driven -> enfants composés `DropdownMenuItem` avec `icon` (glyphe du thème) + `endContent` (Check sur l'actif) ; le label de section « Theme » est reconstruit manuellement.

## 3. Contraste Sign in

- `--brand` clair passe de `oklch(0.58 0.19 250)` à la valeur la plus claire de même teinte/chroma atteignant un ratio >= 4.5:1 avec du texte blanc (~`oklch(0.53 0.19 250)`, valeur exacte calculée à l'implémentation et vérifiée par axe).
- Le token vit à DEUX endroits qui doivent rester synchrones : `--brand` (`app/globals.css:81`) et `--color-accent` light (`lib/astryx-theme.ts`), suivi de `bun run theme:build` dans le même commit.
- Le mode sombre ne change pas (`oklch(0.7 0.17 240)`, texte foncé, pas de problème de contraste).

## Hors périmètre

- Demandes upstream Astryx (toggle password, alignement DropdownMenu).
- Check CI de fraîcheur theme:build (reste au backlog).
- Toute refonte au-delà des points listés.

## Validation

- Gates par tâche : `bun lint`, `bun test` (178/178) ; build de prod en fin de lot.
- axe-core sur `/login` : ZÉRO violation attendue (le contraste était la dernière).
- Passe visuelle utilisateur courte : teinte brand (clair), pills de statut colorées, glyphes du menu thème, bouton X des dialogs de formulaire, rendu NumberInput.

## Risques

- `NumberInput` est la seule API non encore utilisée du lot : vérifiée en début de tâche, repli TextInput documenté si inadaptée.
- L'assombrissement du brand touche tous les accents du mode clair (points de marque, gradients KPI, focus rings éventuels) : écart voulu, teinte identique ; la passe visuelle le confirme.
