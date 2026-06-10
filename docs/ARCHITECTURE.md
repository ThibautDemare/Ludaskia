# Architecture — Ludaskia

> Document **« état courant »** : il décrit l'architecture telle qu'elle est
> aujourd'hui, et se met à jour **sur place** à chaque évolution. L'historique
> des décisions vit dans les commits, les PR et les issues — pas ici.

## Vue d'ensemble
Mini-application web d'entraînement **multi-matières** (niveau CE2) : aujourd'hui
**calcul mental** (maths) et **conjugaison** (français). Génération aléatoire
d'exercices, correction instantanée, chronomètre, et une couche de gamification
(records, médailles, trophées, objectifs, XP) avec gestion de profils. 100 %
**côté client** (aucun serveur) ; la progression est stockée en `localStorage`.

Le contenu est organisé en hiérarchie **Matière → Catégorie → Leçon**
(`src/core/catalog.ts`). Chaque leçon porte un **`ExerciseType`**
(`src/core/exercise.ts`) qui encapsule la **génération** et la **vérification**
d'un exercice — c'est ce qui rend le moteur agnostique de la matière. Le document
de conception initial est `docs/design-multi-subject.md`.

## Stack & outillage
- **TypeScript** (`strict`) en **modules ES**, bundlé par **Vite**.
- Styles en **SCSS** (compilés par Vite).
- Tests : **Vitest** (environnement `happy-dom`).
- Qualité : **ESLint** (flat config + `typescript-eslint`) et **Prettier**.
- Déploiement : **GitHub Pages** via GitHub Actions (build Vite → `dist/`).

### Commandes
| Commande | Rôle |
|----------|------|
| `npm install` | installer les dépendances |
| `npm run dev` | serveur de dev + HMR |
| `npm run build` | build de production → `dist/` |
| `npm test` | tests Vitest |
| `npm run typecheck` | `tsc --noEmit` (strict) |
| `npm run lint` | ESLint |
| `npm run format` / `format:check` | Prettier |

La CI (`.github/workflows/ci.yml`, job `test`) enchaîne `format:check → lint →
typecheck → test` sur chaque PR et push `main`.

## Structure des sources (`src/`)
On sépare la **logique pure** (testable sans DOM) du **rendu/interactions DOM**.
Les dépendances entre fichiers sont **explicites** (`import`/`export`) : l'ordre
de chargement est géré par le bundler, pas par l'ordre des `<script>`.

```
src/
  main.ts        # point d'entrée : styles + bootstrap ordonné + câblage DOM
  core/          # logique pure (aucun accès DOM au chargement)
  ui/            # rendu et interactions DOM
  data/          # contenus statiques par matière (ex. francais/conjugaison.ts)
  styles/        # *.scss (importés depuis main.ts)
```

### `src/data/`
Contenus statiques en TypeScript (`as const`-friendly), une arborescence par
matière. Ex. **`francais/conjugaison.ts`** : tables de 13 verbes (être, avoir,
1er groupe *aimer*, 2e groupe *finir*, aller, faire, venir, voir, dire, pouvoir,
vouloir, prendre, naître) aux 4 temps **présent**, **futur**, **imparfait** et
**passé composé** (les formes du passé composé incluent l'auxiliaire conjugué),
fabrique `conjugationType(verbId, tense)` (un `ExerciseType` à deux modes :
`saisie` par défaut — l'enfant écrit la forme — et `qcm` — choix entre plusieurs
formes, **distracteurs dérivés du paradigme** du verbe, toutes de **vraies formes
correctement orthographiées**, jamais une faute affichée) et descripteurs
`CONJ_LESSONS` (une leçon par verbe × temps). Dossier `francais` sans cédille
pour des chemins d'import ASCII portables ; le libellé affiché reste « Français ».

### `src/core/`
- **`utils.ts`** — aléatoire (`rnd`, `choice`, `sample`), déduplication
  (`uniqueComm/Exact`, `commKey`), `escapeHTML`, `fmt` (mm:ss).
- **`storage.ts`** — `lsGet/lsSet` (clés préfixées par profil), accès bruts
  (`lsKeysRaw/lsRemoveRaw/lsSetRaw`, `appKeys`), `setActivePrefix`, constante
  `PROFILES_KEY`, et `setOnDataWrite(fn)` (hook appelé après chaque écriture de
  donnée de profil — branché depuis `main.ts`).
- **`profiles.ts`** — profils (UUID, préfixe, `updatedAt`), `initProfiles`,
  export/import. ⚠️ Plus d'effet de bord au chargement : `initProfiles()` et le
  branchement du hook sont appelés par `main.ts`.
- **`items.ts`** — item de rendu `{text, answer, answers?, kind?}` (`@` = champ).
  Fabriques math (`add/sub/mul/dbl/half/comp/facteur`), `renderItem` (champ
  numérique ou **texte** selon `kind`), `checkItemAnswer` (correction numérique
  **ou** texte NFC stricte), `gridHTML`, `ficheHTML`/`ficheHTMLGeneric`,
  `lessonAttr()`. État de module exposé via accesseurs (voir plus bas).
- **`exercise.ts`** — abstraction d'exercice : type `Exercise`
  (`text` | `qcm`), interface **`ExerciseType`** (`generate()` / `check()`), et
  `checkAnswer` (normalisation trim + NFC ; **accents et apostrophes exigés**).
- **`catalog.ts`** — hiérarchie `SUBJECTS` / `CATEGORIES` / `LessonDef`
  (`id, label, subject, category, level, exerciseType`), helpers
  `getAllLessons/getLessonById/getLessonsBySubject/getLessonsByCategory`,
  `MATH_LESSON_NUM` (pont id→`bilanQ`), et **`genLessonItem(lesson)`** qui produit
  un `Item` pour n'importe quelle matière (maths → `bilanQ` ; texte → `generate()`).
- **`lessons.ts`** — contenu **maths** : `LESSONS` (15 leçons constructibles
  isolément), `bilanQ` (générateur réutilisé par le catalogue). Côté impression :
  `PrintScope` + **`buildPrintableDOM(scope)`** (contextuel, **multi-matières** via
  `buildLessonFiche`/`bilanBlocksForIds`), `coverHTML(scope)` (garde dynamique),
  pagination 2 fiches/A4. (`buildFiches`/`bilanHTML` historiques conservés.)
- **`build.ts`** — construction **générique multi-matières** : `genItems`,
  `buildLessonFiche` (aiguille maths riche / autres matières en liste texte),
  `bilanBlocksForIds`, `buildFichesForIds` (bilans personnalisés).
- **`bilan-express.ts`** — express **borné** (~20 q, cible ~10 min CE2) :
  `expressQuestionsPerLesson` (≤ 3, 1 quand il y a beaucoup de leçons),
  `sampleExpressLessons` (tirage **pondéré** — leçons fragiles/jamais vues
  prioritaires — et **tournant** — évite le tirage précédent), et
  `buildExpressConfig` qui en fait un `BilanConfig`. Branché sur l'express de
  catégorie ; le bilan personnalisé reste explicite (non borné).
- **`bilans.ts`** — persistance des `BilanConfig` favoris (`ludaskia_bilans`).
- **`revision.ts`** — **révision espacée** (#45), brique **pure** : escalier
  d'intervalles CE2 (`etatNeuf`, `avancerEtat`, `estDu`/`estAcquis` ; `now` passé
  en paramètre). État `EtatRevision` partagé par les mots d'orthographe et les
  leçons maths/conjugaison.
- **`revision-select.ts`** — sélection des éléments **dus** (mots + leçons),
  **regroupés par catégorie** et plafonnés (`selectDueGroups`, `countDue`).
- **`progress.ts`** — records de bilans (`recordRun`, `cmpRun` « score puis
  temps »), série (`updateStreak`, `streakSuffix`), étoiles
  (`recordLessonResult`, `starsEarned`), stats par leçon (`recordLessonStats`,
  `lessonAvgPct`), **XP global** (`getXP`/`addXP`, `ludaskia_xp`) et **niveaux
  dérivés** (`niveauDepuisXP`, `progressionNiveau`, `xpVersSuivant`,
  `xpPourNiveau`, `NIVEAU_MAX`), périodes calendaires (`startOfWeek/Month`,
  `countSince`).
- **`rewards.ts`** — défi du jour contextuel (`CHALLENGES`, `getGoal`,
  `updateGoal`) et trophées (`TROPHIES`, `tiers()`, `evaluateTrophies`,
  `gSnapshot`), dont des groupes **par matière** et **par catégorie** générés
  depuis le catalogue.

### `src/ui/`
- **`chrono.ts`** — chronomètre croissant de la barre (sessions).
- **`effects.ts`** — `sparkline` (SVG), `confetti`, modale `showCelebration`, et
  modale dédiée **passage de niveau** `showLevelUp`/`hideLevelUp` (médaillon doré
  animé ; un `then` optionnel enchaîne sur `showCelebration` s'il y a d'autres
  gains).
- **`render.ts`** — rendus accueil/sélecteur/profils (`renderHomeStats` et
  favoris, badge **niveau + barre** dans `renderToolbarProfile`,
  `renderObjectives`, `renderGoal`, `renderTrophies`,
  `renderLessons` + `lessonCardHTML` réutilisable,
  `renderProfileMenu`, `renderProfiles`, `boardHTML`/`sprintBoardHTML`,
  `pctColor`, config `REGULARITY`).
- **`catalog-nav.ts`** — navigation **Matière → Catégorie → Leçons**
  (`renderSubjects`, `renderCategories`, `renderCategorie`) ; l'écran d'une
  catégorie donne accès au bilan express (borné) / complet, au sprint, et à
  « Je choisis mes leçons » (bilan sur mesure scopé à la catégorie).
- **`bilan.ts`** — **bilan personnalisé** : `renderBilanConfigScreen(el, categoryId?)`
  (global, ou scopé à une catégorie via `#bilan-cat-<id>` — liste à plat,
  pensée tablette), choix du nombre de questions par intention, favoris
  (`renderFavoris`), exécution (`runBilanConfig`).
- **`navigation.ts`** — routing par hash (`route`), vues (`showHomeView`,
  `showMatieresView`/`showMatiereView`/`showCategorieView`,
  `showSprintConfigView`, `showBilanCustomView`, `showProfilesView`,
  `runComplet/Express/Lecon/Revision`), `setToolbar`, `afterStart`, état de
  session.
- **`sprint.ts`** — mode sprint 5 min (compte à rebours, questions une par une),
  **filtrable** (toutes matières / une matière / une catégorie) via un écran de
  configuration ; correction par `checkItemAnswer` (numérique ou texte).
- **`session.ts`** — `verify` (correction + enregistrement), saisie clavier,
  impression contextuelle (#40) : **chemin A** `printAll()` imprime l'écran courant
  vierge (le CSS print met `.ans` en transparent) ; **chemin B** `printScope(scope)`
  pose un périmètre que `beforeprint` rend via `buildPrintableDOM(scope)`. Le 🖨 de
  la barre n'apparaît qu'en exercice (drapeau `print` de `setToolbar`).
- **`menu.ts`** — liste déroulante de profils (`open/close/toggleProfileMenu`),
  extrait pour éviter un cycle `main ↔ navigation`.

### `src/main.ts` (entrée)
Importe les feuilles SCSS, puis initialise **dans cet ordre** :
1. `setOnDataWrite(touchActiveProfile)` (hook de bump `updatedAt`),
2. `initProfiles()`,
3. câblage du DOM + `route()` initiale — exécuté immédiatement si le DOM est
   prêt, sinon sur `DOMContentLoaded` (les modules sont différés).

`index.html` ne charge qu'**une seule** entrée : `<script type="module"
src="/src/main.ts">`.

### État de module partagé (accesseurs)
En modules ES, on ne peut pas réassigner une variable d'un autre module. Les
états globaux mutables d'autrefois sont donc exposés via des paires
accesseur/mutateur, **comportement identique** :
- `items.ts` : `get/setInputCounter` (+ `nextInputId`), `get/setSessionItems`,
  `get/setRenderLesson` ;
- `chrono.ts` : `get/setTimer` (le handle d'intervalle est réutilisé par le sprint) ;
- `navigation.ts` : `get/set` pour `currentMode`, `currentLessonId`,
  `sessionRecorded`, `lastErrors`, `pendingRevision`.

## Modes & navigation
Vues routées **par hash** (le Précédent/Suivant du navigateur fonctionne, et un
hébergement statique sous sous-chemin `/Ludaskia/` ne nécessite aucune config de
fallback SPA) : `#accueil` · `#matieres` · `#matiere-<id>` · `#categorie-<id>` ·
`#lecon-<id>` · `#sprint-config` · `#sprint` · `#bilan-custom` · `#bilan-cat-<id>` ·
`#revision-espacee` · `#profils` · `#revision` (`#lecons`, ancien sélecteur plat, reste
routable mais n'est plus lié). Les identifiants de leçon sont des **chaînes**
(`math-tables-addition`, `fr-conj-etre-present`…). Les déclencheurs changent juste
le hash ; `route()` (sur `hashchange`) rend la vue.

Modes d'exercice : **une leçon à la fois** (atteinte via Matière → Catégorie),
**bilan express/complet** (au niveau d'une catégorie ; l'express est borné),
**bilan personnalisé** (sélection libre, ou scopé à une catégorie, + favoris),
**sprint 5 min** (filtrable, multi-matières), **révision des erreurs** (rejoue les
erreurs d'une session, n'enregistre rien). L'accueil ne propose plus de cartes
express/complet : on y accède par Matière → Catégorie. Le **mode Révision**
(accueil, `#revision-espacee`) rejoue les éléments **dus** par répétition espacée
— mots d'orthographe **et** leçons maths/conjugaison — **regroupés par catégorie**,
un élément à la fois, sans chrono ni record.

### Pipeline multi-matières
Le cœur du moteur est agnostique de la matière. Une `LessonDef` porte un
`ExerciseType` ; `genLessonItem(lesson)` (catalog) produit un `Item` de rendu —
pour les maths via le générateur numérique existant (`bilanQ`), pour les autres
matières en convertissant l'`Exercise` texte. `build.ts` assemble fiches et
bilans à partir de là (les leçons de calcul gardent leur rendu riche : grilles,
décomposition). La **correction** est routée par `checkItemAnswer` selon le type
de l'item : comparaison numérique (virgule tolérée) ou comparaison de chaîne
**trim + NFC stricte** (accents et apostrophes exigés). `verify()` (session) et
le sprint passent tous deux par ce point.

## Données (`localStorage`)
Tout passe par `lsGet/lsSet`. Les clés sont **préfixées par le profil actif**
(`<uuid>/ludaskia_…`) sauf la méta globale `ludaskia_profiles`. Clés par profil :
`ludaskia_runs_{complet,express,sprint}`, `ludaskia_streak`, `ludaskia_stars`,
`ludaskia_lessonStats`, `ludaskia_lessonRevision` (état SR par leçon),
`ludaskia_goal`, `ludaskia_goalsDone`, `ludaskia_trophies`, `ludaskia_xp`,
`ludaskia_bilans` (configs de bilans favoris). L'état SR des **mots** d'orthographe
vit dans `ludaskia_ortho` (`MotOrtho.revision`).
Les étoiles et stats sont désormais indexées par **id de leçon (chaîne)**.

## Profils
- Chaque profil a un **UUID stable** (id inter-appareils) et un **`updatedAt`**
  (ms) bumpé à chaque écriture via le hook `onDataWrite`.
- Sélecteur = **liste déroulante dans la barre d'outils** (bascule rapide +
  « Gérer »). Écran `#profils` : créer / renommer / avatar / réinitialiser /
  supprimer (jamais le dernier).
- **Export/import par profil** (`exportProfiles`/`importProfiles`) : fusion par
  **UUID**, écrase un profil existant **seulement si la sauvegarde est plus
  récente** (`updatedAt`), ajoute si l'UUID est inconnu.
- Pas de migration de données prévue (on part de profils vierges).

## Gamification (pédagogie : régularité espacée, pas de pression quotidienne)
- **Médailles** = podiums des classements (🥇🥈🥉), réservés au **sprint** (seul
  ensemble stable, donc comparable). Les **bilans** (express/complet) ne sont
  **pas classés** — leurs leçons varient d'un essai à l'autre — mais restent
  enregistrés (régularité + trophées cumulatifs). **Trophées** = succès cumulatifs.
- **Objectifs de régularité** (panneau d'accueil, périodes calendaires) :
  3 sprints/semaine, 2 bilans express/mois, 1 bilan complet/mois. Les bilans de
  catégorie et personnalisés y comptent (mode déduit du nombre de questions :
  « toutes » → complet, sinon express).
- **Défi du jour** contextuel et « qualité » : jamais un défi impossible
  (remédiation seulement s'il existe une leçon < 70 % ; « bats ton record »
  seulement s'il y a un record).
- **Série de jours** calculée en coulisse, uniquement pour les trophées 3/7 jours
  (one-shot, jamais reperdus) ; pas d'affichage anxiogène.
- Trophées à paliers via `tiers(prefix, icon, metric, levels)` ; un trophée se
  déclare par `{metric, n}` (compilé en test `g[metric] >= n`) ou un `test`
  explicite. `gSnapshot()` fournit les métriques, dont des agrégats **par matière**
  et **par catégorie** (`subjectCorrect/Stars`, `categoryCorrect/Stars`) ; des
  groupes de trophées par matière/catégorie sont **générés depuis le catalogue**
  (ils s'étendent automatiquement avec les nouvelles matières).
- **XP & niveaux** : 1 point d'XP par bonne réponse, tous modes confondus
  (`addXP`). L'XP totale (`ludaskia_xp`) reste l'unique source de vérité ; le
  **niveau (1 → 100)** en est *dérivé* par fonction pure (`niveauDepuisXP`),
  donc aucune migration. Courbe « de plus en plus dure » : coût d'un palier
  `round(12 × L^0,89)` (`xpVersSuivant`), calibrée (avis pédagogique CE2) pour
  qu'une leçon isolée fasse gagner au plus 1 niveau au début ; ~37 900 XP pour
  le niveau 100, dernier palier ~717 XP (pas un mur).
  Affiché dans la barre d'outils en **badge niveau + barre de progression**
  (`progressionNiveau`) ; l'XP brute n'apparaît plus qu'en infobulle.
- **Règle des 60 %** : un bilan/leçon ne « compte » (temps, record, étoile,
  objectif, trophée) que si ≥ 60 % des calculs ont une réponse. Le sprint compte
  s'il va au bout des 5 minutes.
- Une récompense déclenche une **modale + confettis** (jamais de confettis sans
  explication).

## Tests
`tests/logic.test.ts` (Vitest) importe directement les modules de `src/core/` (et
quelques-uns de `src/ui/`) et couvre la **logique pure** (génération, persistance,
récompenses, profils), pas le rendu DOM. L'environnement DOM/`localStorage` est
fourni par `happy-dom`.

L'état des modules ES étant un singleton, un `beforeEach` reproduit la fraîcheur
de l'ancien runner : `localStorage.clear()`, rebranchement du hook
(`setOnDataWrite`), remise à zéro de l'état du module `items`, puis
`initProfiles()`. **Lancer `npm test` après toute modif de logique.**

## Build & déploiement
- `vite.config.ts` fixe `base: '/Ludaskia/'` (site « projet » servi sous
  sous-chemin) et `build.outDir: 'dist'`.
- `npm run build` produit un bundle minifié/hashé dans `dist/`.
- `.github/workflows/pages.yml` : `npm ci` → `npm run build` → publication de
  `dist/` sur GitHub Pages à chaque push `main`.

## Piste d'évolution
La hiérarchie **Matière → Catégorie → Leçon**, les réponses **texte normalisées**
(+ variantes) et la gamification **agnostique de la matière** sont désormais en
place. Restent à explorer, en gardant le format « question courte → réponse
vérifiable » (filtre : **automatisme/mémorisation**) :
- **mode QCM** : désormais disponible en **conjugaison** (`conjugationType`,
  mode `qcm` — utilisé en sprint, distracteurs dérivés du paradigme) ; piste pour
  la mémorisation (capitales/dates). *Écarté pour l'orthographe* (risque d'ancrage
  de la faute) ;
- d'autres contenus : maths étendus (conversions d'unités), verbes irréguliers
  anglais ;
- **filtrage par niveau scolaire** (chaque `LessonDef` porte déjà un `level`) ;
- **affiner** la révision espacée : réglage de l'escalier d'intervalles, et
  généralisation (la brique `revision.ts` est déjà agnostique du type d'élément).
- **corrigé imprimable** (page réponses) et **accessibilité/dys** de l'impression
  (police, contraste) — hors périmètre de #40, à explorer.
