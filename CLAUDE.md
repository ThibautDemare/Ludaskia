# CLAUDE.md — Ludaskia

Mini-application web d'entraînement **multi-matières** (CE2, et **début de
CM1**) : **maths** (numération, calcul, calcul mental, grandeurs & mesures,
géométrie, problèmes) et **français** (grammaire, conjugaison, orthographe,
vocabulaire). Génération d'exercices, correction instantanée, chronomètre,
gamification (records, médailles, trophées, objectifs, XP) et profils. 100 %
côté client (`localStorage`). **TypeScript + Vite + SCSS**, tests **Vitest** +
**Playwright**.

## Où trouver quoi
- **Architecture technique** (stack, structure `src/`, données, build, déploiement,
  gamification) → **`docs/ARCHITECTURE.md`** (doc « état courant », tenue à jour).
- **Process de contribution** (branche → PR → CI → rebase-merge, Conventional
  Commits, `main` protégée) → **`CONTRIBUTING.md`**.
- **Programmes officiels** (extraits sourcés des attendus/repères CE2-CM1, maths
  & français) → **`docs/reference/programmes/`**. Les agents (le pédagogue en
  tête) consultent ce cache local **avant** d'aller sur eduscol.

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
- **`auteur-tests-logique`** — **écrit** et fait tourner les tests **Vitest**
  (`tests/`) de la logique pure (fabrique d'`ExerciseType`, générateurs, score/XP,
  règles de langue, normalisation). Pendant de `auteur-tests-e2e` côté logique.
  Son intérêt : **auteur des tests distinct de l'auteur du code** (pas d'angle mort
  hérité de l'implémentation), il **dérive les attendus lui-même** et éprouve les
  **cas tricky** (bornes par échantillon, zéros, déterminisme du tirage `r`,
  distracteurs QCM). Écrit dans `tests/`, ne touche pas au code applicatif.
- **`integrateur-lecon`** — **implémente** une nouvelle leçon de bout en bout,
  **exploration technique comprise** (données `src/data/`, fabrique d'`ExerciseType`,
  branchement catalogue, modes, figures SVG) **plus ses tests**. Il **explore
  lui-même** le code et **sollicite** `pedagogue-primaire` (fond) / `designer-ux-enfant`
  (rendu) pour combler un manque, au lieu de s'arrêter ; il **ne tranche pas seul un
  arbitrage produit majeur** (périmètre, ce qu'on diffère, compromis UX) → il le
  remonte. N'ouvre pas la PR lui-même.
- **`expert-documentation`** — référent **doc & capacités du code**. On le
  consulte pour savoir **ce que le code sait faire** et **où c'est documenté**
  (« a-t-on déjà ce moteur ? », « où est géré l'XP ? », « comment marche X ? ») :
  il explore lui-même `src/` (qui fait foi) et la doc, et répond de façon sourcée.
  Et en **fin de dev**, il vérifie que le changement se reflète dans la doc « état
  courant » (`docs/ARCHITECTURE.md` + `docs/architecture/*`, READMEs de test) **et
  dans les surfaces utilisateur** (`README.md`, vitrine `index.html`, guide parents
  `guide.html`), puis **édite** pour combler l'écart. **Édite la doc, jamais le
  code** (renvoie à `relecteur-qualite` / `integrateur-lecon` / `auteur-tests-e2e` /
  `auteur-tests-logique`) — seule exception, le **contenu rédactionnel**
  d'`index.html` et de `guide.html`, dont il ne touche ni le JS ni le SCSS.
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
  - **logique pure** ajoutée ou modifiée (générateur, `check`, score/XP/niveau,
    règle d'accord/homophone, normalisation) → ses **tests Vitest** via
    **`auteur-tests-logique`**. Réflexe clé : l'**invoquer séparément de l'auteur
    du code** (celui qui écrit la logique — souvent `integrateur-lecon` ou le fil
    principal — ne rédige pas ses propres tests), pour garder **auteur ≠ testeur**.
  Plusieurs dimensions touchées → plusieurs relecteurs (ex. une nouvelle leçon à
  figure avec énoncés FR = qualité **+** accessibilité **+** langue).
- **Doc — resync en fin de dev.** Quand un dev touche l'architecture (nouveau
  module/type/convention, nouvelle leçon/catégorie, mode, mécanique, clé de
  stockage…), passer le diff à **`expert-documentation`** : il vérifie que la doc
  « état courant » (`docs/ARCHITECTURE.md` + `docs/architecture/*`) reste fidèle au
  code et la met à jour. C'est aussi l'agent à interroger en amont pour savoir si
  une capacité **existe déjà** avant de la réimplémenter.
  - **Le réflexe vaut aussi pour ce que voit l'utilisateur.** Dès que le dev
    ajoute une capacité **visible** (mode, catégorie, niveau, mécanique, fonction
    de l'espace encadrants, option d'accessibilité, export/impression), le même
    passage doit vérifier **`README.md`**, la **vitrine `index.html`** et le
    **guide parents `guide.html`**. Ces pages se périment plus vite que la doc
    technique : personne ne les relit en écrivant du code, et l'écart ne se voit
    qu'après des mois. Le guide est le plus fragile des trois — il cite des
    parcours et des libellés précis, donc un bouton déplacé le rend faux. Si
    l'édition change une structure comptée par `e2e/vitrine.spec.ts` ou
    `e2e/guide.spec.ts` (sections, entrées de FAQ), la spec suit via
    **`auteur-tests-e2e`**.

## Style de réponse (Claude et agents)
- **Direct et concis.** Aller droit au but : pas de phrase d'introduction, pas de
  reformulation de la question, pas de remplissage ni de récapitulatif inutile.
  Répondre, puis s'arrêter.
- **Esprit critique, pas de complaisance.** Ne pas valider par défaut. Si une
  proposition est discutable, fragile ou améliorable, le dire et expliquer
  pourquoi, puis proposer mieux. Pas de flatterie (« excellente idée », « très
  bonne question », « tu as raison »).

## Hygiène de contexte (coût tokens)
- **`/clear` aux frontières de tâche** : quand une leçon / PR / sujet autonome est
  bouclé et qu'on enchaîne sur autre chose d'indépendant, **proposer à
  l'utilisateur de `/clear`** avant de continuer (le contexte accumulé ne sert plus).
- Sur une **même** grosse tâche dont le contexte gonfle, suggérer **`/compact`** à
  un point d'arrêt propre (tests verts, commit fait), sans attendre l'auto-compact.
- Les **agents-conseils** tournent en **Sonnet** ; **Opus** est réservé à
  `integrateur-lecon` (seul à écrire le code applicatif). Ne pas re-passer un
  conseiller en Opus sans raison forte, et garder un fan-out **sélectif** (cf.
  orchestration) plutôt que tous les relecteurs à chaque fois.

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
  - **Appeler `gh` « nu »**, **depuis PowerShell** : `gh <commande>` (p. ex.
    `gh issue view 235`). Le dossier `C:\Program Files\GitHub CLI` est dans le PATH
    utilisateur. **Ne plus** utiliser le chemin complet `& "C:\…\gh.exe" …` ni une
    variable `$gh = …; & $gh …` : ces formes (opérateur d'appel `&` / variable) **ne
    sont pas reconnues par l'allow-list des permissions** et redemandent confirmation
    à chaque appel. Les verbes de **lecture** (issue/pr `view`/`list`, `repo view`,
    `label list`, `pr diff`/`checks`, `run view`, `auth status`) et de **gestion
    issues/PR** (issue/pr `create`/`edit`/`comment`) sont pré-autorisés dans
    `.claude/settings.local.json` ; `pr merge`, `repo delete/edit/archive/rename`,
    `issue delete`, `secret`/`variable`, `auth token/logout` y sont **refusés**, et
    `gh api` en écriture demande confirmation.
  - **Corps multi-ligne** (issue, PR, milestone, en **français** avec accents) :
    ne **jamais** le passer en `--body` inline ni via un here-string `@'...'@`
    (risque de casse d'encodage sous PowerShell). Écrire le corps dans un fichier
    `.md` UTF-8 **avec l'outil Write** (p. ex. dans le scratchpad de session), le
    passer avec **`--body-file`**, puis supprimer le fichier.
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
  - **Niveau scolaire** (optionnel — **complète** les labels obligatoires, ne les
    remplace pas) : tag transversal de **classe** pour le contenu multi-niveaux
    (#225), aussi destiné à étiqueter les **leçons** par classe. Existants :
    `ce2`, `cm1` ; famille extensible (futurs `cp`, `ce1`, `cm2`, `6e`).
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
  sauf accès bruts dédiés dans `src/core/storage.ts`), et **toute clé commence par
  `ludaskia_`** — c'est le filtre d'`appKeys()`, donc ce qui fait entrer la donnée
  dans l'export de sauvegarde et la fait disparaître avec le profil supprimé. Tenu
  par `tests/cles-stockage-gate.test.ts` (#597).
- **Séparation** logique (`src/core/`, testable sans DOM) / rendu (`src/ui/`).
  Lancer `npm test` après toute modif de logique.
- Ces deux règles ne sont plus à vérifier à l'œil : **ESLint les fait échouer**
  (#579, `eslint.config.js`), y compris un `window.localStorage` détourné.
- **Couleurs : mesurer, jamais contourner feuille par feuille.** Une couleur qui
  passe mal se rattrape trop facilement par un override local — c'est comme ça
  qu'un `--muted` sous AA a survécu des années (#576). Avant de poser une valeur :
  `node tools/contrast/contrast.mjs "#xxxxxx" "#yyyyyy"`. Les couples de tokens
  constatés dans les feuilles sont tenus **sur les six thèmes** par
  `tests/contraste-tokens.test.ts` (#582) ; un **nouveau** couple (texte sur une
  surface, bordure de composant) n'est gardé que si on l'**ajoute à sa table**.
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
- **Journal d'erreurs systématique : pas de correction sans sa capture.** Tout
  chemin qui **corrige une réponse d'enfant** doit journaliser ses erreurs pour
  l'espace encadrant (#391) — **nouveau runner**, **nouveau mode d'un type
  existant**, **nouveau widget interactif**, chemin de **révision**. Réflexe au
  même titre que la spec e2e : un mode qui ne journalise pas rend le suivi
  parental **silencieusement partiel** (le parent croit tout voir), et le trou ne
  se remarque qu'à l'usage, des semaines plus tard.
  - **Comment** : appeler `capterErreur` (`src/ui/erreur-capture.ts`) au moment de
    la correction, avec un **énoncé lisible hors de l'appli**, la réponse donnée et
    la réponse attendue **déjà mises en forme** (`figure` pour signaler un dessin).
    Une entrée sans `lessonId` ou sans énoncé est **ignorée** : c'est le piège
    principal, vérifier que les deux sont fournis.
  - **Granularité** : une entrée par **erreur ciblable** (un mot mal classé, une
    sous-question de problème, une paire mal reliée), jamais une par cellule ni un
    « c'est faux » global. Mise en forme partagée dans
    `src/core/erreur-representation.ts` (pure, donc testée) ; un widget qui a une
    réponse composite expose `reponse()` (cf. `TuileController`).
  - **Vérifier la couverture** : le journal doit se remplir **dans tous les modes**
    du type touché (une leçon à deux modes = deux chemins de correction).
  - **Deux gates** tiennent désormais la règle, et il faut nourrir les deux.
    (1) **Statique, au niveau module** (#580, `tests/erreurs-journal-gate.test.ts`) :
    un runner `lecon-*.ts` qui n'importe pas `capterErreur` fait échouer `npm test`,
    et toute exception doit être écrite dans le test avec sa raison.
    (2) **Table de couverture par FORMAT** (#581, `e2e/journal-couverture.ts`) : un
    nouveau `type` dans l'union `Exercise` doit y déclarer sa leçon d'exemple et le
    geste qui produit une erreur, sinon `npm run typecheck` **et** `npm test`
    échouent ; la spec paramétrée `e2e/journal-couverture.spec.ts` joue ensuite ce
    geste pour de vrai et exige que l'erreur remonte côté encadrant, avec un énoncé
    et **deux réponses non vides**.
    La table de #581 ne déclarant **qu'un mode par format**, un troisième gate
    (#598, `tests/couverture-e2e-gate.test.ts`) tient l'autre moitié : **chaque id
    de mode** du catalogue et **chaque runner** `src/ui/lecon-*.ts` doit être joué
    par une spec. Ajouter un mode à un type existant, ou un runner, sans le
    couvrir en e2e fait donc échouer `npm test`.
- **Commits : aucune attribution Claude** (`Co-Authored-By` / « Generated with
  Claude Code »).

Tenir `docs/ARCHITECTURE.md` à jour quand l'architecture évolue (et garder ce
fichier court).
