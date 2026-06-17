# CLAUDE.md — Ludaskia

Mini-application web d'entraînement au **calcul mental** (CE2) : génération de
calculs, correction instantanée, chronomètre, gamification (records, médailles,
trophées, objectifs) et profils. 100 % côté client (`localStorage`).
**TypeScript + Vite + SCSS**, tests **Vitest**.

## Où trouver quoi
- **Architecture technique** (stack, structure `src/`, données, build, déploiement,
  gamification) → **`docs/ARCHITECTURE.md`** (doc « état courant », tenue à jour).
- **Process de contribution** (branche → PR → CI → rebase-merge, Conventional
  Commits, `main` protégée) → **`CONTRIBUTING.md`**.

## Agents-conseils (à mobiliser selon le sujet)
- **`pedagogue-primaire`** — justesse pédagogique : contenu, difficulté,
  progression, correspondance au programme, formulation des consignes, santé
  d'une mécanique vue comme apprentissage.
- **`designer-ux-enfant`** — interface enfant (tablette/smartphone) : couleurs,
  lisibilité, cibles tactiles, responsive, micro-interactions, rendu visuel et
  ressenti émotionnel des récompenses.
- **`gamification-enfant`** — game design : structure des mécaniques (XP,
  niveaux, médailles, trophées, objectifs), courbes de progression, paliers de
  déblocage, boucles d'engagement, équilibrage effort/récompense, dark patterns
  à éviter. *Quoi/combien/quand récompenser*, pas la pédagogie ni le rendu.
- **`specialiste-troubles-apprentissage`** — accessibilité « dys- » et attention
  (dyslexie, dyscalculie, dyspraxie, TDAH…) : « pro tips » d'adaptation
  concrète (consignes, présentation des nombres, saisie, multimodalité/audio,
  pression temporelle, mémoire de travail). *Lever l'obstacle du trouble sans
  baisser l'exigence* ; renvoie au pédagogue pour la notion, au designer pour
  le rendu, à gamification pour les mécaniques.
- Les trois premiers conseillers se recoupent sur la **gamification** : prendre celui
  dont c'est l'angle (sens pédagogique → pédagogue ; rendu → designer ;
  mécanique/équilibrage → gamification), quitte à en croiser deux.
- **`relecteur-qualite`** — qualité technique & maintenabilité : relecture de
  code avant PR, respect de l'architecture (séparation `core`/`ui`, invariants
  du moteur), **et surtout vérification que tous les tests nécessaires existent**
  (Vitest pour la logique, smoke Playwright pour toute fonctionnalité visuelle).
  Fait tourner `typecheck`/`lint`/`test` et explique les échecs ; donne un avis,
  ne modifie pas le code.
- **`gestionnaire-github`** — issues / PR / milestones (voir Workflow Git plus bas).

## Lancer
- `npm install` puis `npm run dev` (serveur + HMR).
- Avant de pousser : `npm run typecheck`, `npm run lint`, `npm test`. Si la PR
  ajoute une fonctionnalité visuelle, lancer aussi sa spec : `npm run test:e2e`
  (au 1er usage, `npx playwright install chromium`).
- Build de prod : `npm run build` (→ `dist/`).

## Workflow Git/GitHub (sessions agent)
- `main` est **protégée** : **jamais** de commit/push direct dessus. Toute
  modification passe par une **branche + PR** ; la CI doit être verte ; merge en
  **rebase**.
- **Issues, PR et milestones → déléguer à l'agent `gestionnaire-github`** dès
  qu'on veut en ouvrir ou en modifier un. Il connaît déjà les labels, les
  conventions de langue et le workflow ci-dessous : lui fournir le sujet, il
  rédige, étiquette, crée et renvoie les URL. **Ne pas appeler `gh` « à la main »
  pour ça** (même si on a les conventions en tête) ; le réserver aux opérations
  git brutes (commit, branche, `fetch`, rebase) ou au cas où l'agent serait
  indisponible.
- **Référence `gh`** (utilisée par l'agent ; fallback pour les opérations
  directes) — `gh` est installé et authentifié.
  - **`gh` n'est PAS dans le `PATH`.** L'appeler par son chemin complet, **depuis
    PowerShell** (l'outil Bash ne le voit pas) :
    `& "C:\Program Files\GitHub CLI\gh.exe" <commande>`.
  - Pour un `--body`/`--title` multi-ligne (issues, PR, en **français** avec
    accents), utiliser un **here-string PowerShell** `@'...'@` (le `'@` final
    collé à la colonne 0) et passer la variable : `& $gh issue create --body $body`.
    Penser à doubler les apostrophes (`d''XP`) dans un here-string simple-quote.
- **Une PR par changement**, liée à son issue le cas échéant (`Closes #N`) ;
  attendre la CI verte puis rebase-merge. **Ne pas merger sans le feu vert du
  mainteneur.**
- **Labels obligatoires à la création d'une issue.** Toujours étiqueter, avec
  **au moins un label de type** + **exactement une priorité** + **exactement un
  effort**. Vérifier les labels réels du dépôt via `gh label list`.
  - **Type** (un ou plusieurs) : `bug` (dysfonctionnement, « ça ne marche pas »),
    `enhancement` (nouvelle fonctionnalité), `polish` (existant fonctionnel à
    peaufiner : sous-optimal, obsolète, à mettre à jour), `refacto`
    (restructuration sans nouveauté visible), `architecture` (changements
    structurels fondateurs), `content` (ajout de données/exercices),
    `gamification` (trophées, XP, objectifs, récompenses), `documentation`.
  - **Priorité** (un seul) : `priority: high` / `priority: medium` / `priority: low`.
  - **Effort** (un seul) : `effort: low` / `effort: medium` / `effort: high`.
  - Génériques GitHub disponibles au besoin : `duplicate`, `question`,
    `good first issue`, `help wanted`, `invalid`, `wontfix`.
- Le mainteneur peut travailler **en parallèle** dans une autre session :
  `git fetch` + vérifier l'état (local vs distant) **avant de pusher**.
- Détails : `CONTRIBUTING.md`.

## Conventions
- **Code, UI, commentaires, docs et issues : en français.** Messages de commit/PR :
  en **anglais** (Conventional Commits — voir `CONTRIBUTING.md`).
- **TypeScript `strict`** ; passer par **ESLint + Prettier** (`npm run lint` /
  `format`). La CI vérifie `format:check → lint → typecheck → test`.
- **Stockage** : toujours via `lsGet/lsSet` (jamais `localStorage` directement,
  sauf accès bruts dédiés dans `src/core/storage.ts`).
- **Séparation** logique (`src/core/`, testable sans DOM) / rendu (`src/ui/`).
  Lancer `npm test` après toute modif de logique.
- **Tests e2e systématiques pour toute fonctionnalité visuelle.** Dès qu'on
  ajoute du visible/navigable — **nouvelle leçon**, **nouveau type d'exercice
  ou mode**, **nouvel écran/vue** — on écrit **dans la même PR** une **spec
  Playwright** dans `e2e/` (au moins un *smoke test* : la vue se rend sans erreur
  et l'interaction clé fonctionne). C'est un **réflexe**, pas une option : pas de
  fonctionnalité visuelle sans sa spec.
  - **Pattern** (voir specs existantes `e2e/*.spec.ts`) : naviguer via `gotoHash`,
    poser `watchErrors` et vérifier `expect(errors).toEqual([])`, **sélecteurs
    stables** (`#btnVerify`, `.lesson-item`, `.ans`, `.mark.correct`, `.mode-btn`,
    `#ltuiSlot`…), remplir un champ avec son `data-answer` puis valider. Un nouveau
    type d'exercice mérite **son** fichier spec (ex. `numeration.spec.ts`,
    `position.spec.ts`).
  - **Portée** : tester le contenu **de la branche** ; rester **ciblé et robuste**
    (peu de tests, pas de suite exhaustive fragile). Conventions détaillées dans
    `e2e/README.md`.
- **Commits : aucune attribution Claude** (`Co-Authored-By` / « Generated with
  Claude Code »).

Tenir `docs/ARCHITECTURE.md` à jour quand l'architecture évolue (et garder ce
fichier court).
