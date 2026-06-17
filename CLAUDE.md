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
- **`relecteur-accessibilite`** — accessibilité **technique/normative** (a11y) :
  contraste WCAG, cibles tactiles, ARIA et libellés des figures SVG, navigation
  clavier/focus, qualité du TTS. Complète le `specialiste-troubles-apprentissage`
  (cognitif) et le `designer-ux-enfant` (rendu). Avis, ne modifie pas le code.
- **`redacteur-contenu-francais`** — relecture **conseil** de la langue des
  énoncés et libellés (orthographe, clarté, ambiguïté, registre CE2). Pur
  conseiller : il **signale et suggère**, ne réécrit jamais à l'aveugle.
  Respecte les choix actés (formulations validées par le `pedagogue-primaire`,
  apostrophe droite `'` retenue pour l'accessibilité clavier) ; renvoie au
  pédagogue pour le fond.
- Les trois premiers conseillers se recoupent sur la **gamification** : prendre celui
  dont c'est l'angle (sens pédagogique → pédagogue ; rendu → designer ;
  mécanique/équilibrage → gamification), quitte à en croiser deux.
- **`relecteur-qualite`** — qualité technique & maintenabilité : relecture de
  code avant PR, respect de l'architecture (séparation `core`/`ui`, invariants
  du moteur), **et surtout vérification que tous les tests nécessaires existent**
  (Vitest pour la logique, smoke Playwright pour toute fonctionnalité visuelle).
  Fait tourner `typecheck`/`lint`/`test` et explique les échecs ; donne un avis,
  ne modifie pas le code. Couvre aussi la **propreté du code** (duplication,
  taille des fonctions, nommage, couplage — garde-fou anti-spaghetti).
- **`auteur-tests-e2e`** — **écrit** et fait tourner la spec Playwright (`e2e/`)
  d'une fonctionnalité visuelle (leçon, type d'exercice, mode, écran), selon le
  pattern maison. Le bras armé de la règle « pas de visuel sans sa spec ».
- **`integrateur-lecon`** — **implémente** une nouvelle leçon de bout en bout,
  **exploration technique comprise** (données `src/data/`, fabrique d'`ExerciseType`,
  branchement catalogue, modes, figures SVG) **plus ses tests**. Il **explore
  lui-même** le code et **sollicite** `pedagogue-primaire` (fond) / `designer-ux-enfant`
  (rendu) pour combler un manque, au lieu de s'arrêter ; il **ne tranche pas seul un
  arbitrage produit majeur** (périmètre, ce qu'on diffère, compromis UX) → il le
  remonte. N'ouvre pas la PR lui-même.
- **`gestionnaire-github`** — issues / PR / milestones (voir Workflow Git plus bas).

### Comment orchestrer les agents (réflexes, pas optionnels)
- **Déléguer l'implémentation d'une leçon — tôt ou pas du tout.** Leçon
  **routinière sur un moteur existant** (banque QCM, conversion, variante d'un type
  déjà en place) → confier la **tranche entière dès le départ** à `integrateur-lecon`
  (il explore + implémente + teste dans **son** contexte, ce qui garde le fil
  principal léger). Leçon à **architecture ou rendu nouveaux** (nouveau renderer/runner,
  UX sensible où le mainteneur réagit) → **garder le cadrage** (exploration + pédago +
  designer) et ne déléguer que des sous-parties. **Anti-pattern à éviter** :
  explorer/charger soi-même tout le contexte *puis* passer l'implémentation à l'agent
  (on cumule le coût de contexte **et** le risque de passation).
- **Relecteurs — à lancer AVANT d'ouvrir la PR**, en parallèle, selon ce que la PR
  touche (réflexe déclenché par la dimension, pas par l'humeur) :
  - code logique/structurel non trivial, nouveau module/type → **`relecteur-qualite`** ;
  - rendu, **figure SVG**, **TTS / audio**, couleurs ou thème, cibles tactiles,
    focus/navigation clavier → **`relecteur-accessibilite`** ;
  - **nouveaux énoncés, consignes ou libellés** en français → **`redacteur-contenu-francais`** ;
  - toute fonctionnalité **visuelle/navigable** → sa **spec Playwright** via
    **`auteur-tests-e2e`** (dans la même PR ; cf. règle e2e plus bas).
  Plusieurs dimensions touchées → plusieurs relecteurs (ex. une nouvelle leçon à
  figure avec énoncés FR = qualité **+** accessibilité **+** langue).

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
