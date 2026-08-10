[← Architecture Ludaskia](../ARCHITECTURE.md)

# Niveaux scolaires (#225)

Le **niveau scolaire** (`SchoolLevel = cp|ce1|ce2|cm1|cm2|6e`) est un **réglage de
contenu**, par matière — distinct du niveau d'**XP** (récompense). Vocabulaire enfant :
« **classe** » pour le scolaire, « niveau »/rang pour l'XP.

## Modules

- **`levels.ts`** (pur) — `LEVEL_ORDER`, `LEVEL_LABEL`, `effectiveLevel(lesson, niveau)`
  et `closestSupported(supported, niveau)` (niveau demandé, sinon plus haut supporté
  **en-dessous**, sinon plus bas — repli/clamp), `availableLevels(lessons)` (union des
  niveaux présents), `lessonsForLevel(lessons, niveau)`,
  **`niveauDefautCatalogue(lessons)`** (le plus bas niveau ayant du contenu — **source
  unique** du repli « aucune classe choisie » ; appelé par `niveau-actif.ts` et
  `encadrant-stats.ts`, #351) et **`labelLecon(lesson, niveau?)`** (#436, ci-dessous).
- **`level-combinators.ts`** (pur) — `calibrated(table, build)` : **un seul `id`**
  recalibré par une table de paramètres par niveau (génératif : numération…), expose
  ses `levels`; `bankByLevel(items)` : banque QCM tagguée par item, dérive l'union des
  niveaux — **premier usage réel en #250**, côté **maths** (banques `BANQUE_DIVISIBILITE`
  de `data/maths/divisibilite.ts` et `BANQUE_ORDRE_GRANDEUR` de
  `data/maths/ordre-grandeur.ts` : deux banques CM1-only, chaque item porte
  `levels: ['cm1']`), jusque-là défini mais mobilisé par aucune donnée. **Premier usage
  côté français en #254** (`BANQUE_HOMONYMES` de `data/francais/homonymie.ts`, banque
  CM1-only d'homographes). Le catalogue dérive `LessonDef.levels` de ces combinateurs
  (numération,
  grandeurs & mesures — conversions CE2 + CM1, décimaux CM1 #248) ou de la donnée
  (conjugaison taggée). Une leçon peut aussi poser `levels` directement sur son
  `ExerciseType` (champ générique de `exercise.ts`) **sans passer par un
  combinateur** : ex. le helper local `cm1Only(exerciseType)` de
  `data/maths/fractions.ts` (#249), qui marque CM1-only les 3 leçons « fractions
  comme nombres » par un simple `{ ...exerciseType, levels: ['cm1'] }`. Variante côté
  **maths** : `maths/problemes.ts` (#255) pose `levels: ['ce2','cm1']` sur 4 de ses
  6 `ExerciseType` (composition, transformation, multiplication, comparaison) **et**
  branche `generate` lui-même sur `opts.level` (CE2 inchangé, CM1 = mix entiers/
  décimaux) — **sans passer par `calibrated`** : à l'époque, le combinateur ne recopiait
  pas `exerciseKind` et cassait donc `isProblemeLesson` (classification sans appeler
  `generate()`, #348) et l'exclusion du sprint qui en dépend. **Depuis #447**,
  `calibrated` **propage `exerciseKind`** (première leçon à runner dédié rendue
  multi-niveaux : la droite graduée `num-droite-entiers`, CE2 + CM1) : une leçon à
  runner dédié peut désormais être calibrée sans perdre son aiguillage. `problemes.ts`
  garde son branchement manuel (rien à y changer).
- **`niveau-actif.ts`** — résout le niveau au **seam** profil/catalogue (lit la méta
  profil **directement** via `storage`, pour éviter un cycle `progress → niveau-actif →
  profiles`). `niveauActif()` (classe de référence), `niveauActifMatiere(subject)`
  (= `niveauParMatiere[subject] ?? niveauReference ?? niveauDefautCatalogue(getAllLessons())`), `niveauLecon(lesson)`
  (= `effectiveLevel` sur la matière, **passé à `generate`/`genLessonItem`** par
  `build`/runners/`revision`/`sprint`), `besoinChoixNiveau()`, `lessonsNiveauActif()`.

## Ce qu'une leçon multi-niveaux décline par classe (#436)

Une même leçon servie à deux niveaux ne diffère pas seulement par sa **banque** : son
**libellé** et sa **consigne de fiche** peuvent aussi devoir changer, parce que le
vocabulaire de la notion n'est pas le même d'une classe à l'autre. Deux mécanismes,
même principe : **déclarés par la donnée, résolus à la LECTURE** avec le niveau du
lecteur — jamais figés à la construction (une valeur figée serait recopiée telle quelle
par les combinateurs, et un niveau lirait le texte de l'autre).

- **Libellé** — `LessonDef.labelNiveau?: Partial<Record<SchoolLevel, string>>`
  (surcroît **optionnel** : `label` suffit à la quasi-totalité des leçons), reporté par
  `toLessonDefs` depuis l'entrée de données, résolu par **`labelLecon(lesson, niveau)`**
  (`levels.ts`, repli/clamp par `effectiveLevel`). Résolu à l'affichage : runners (helper
  partagé **`leconTitreHTML`**, `ui/lecon-runner-shared.ts`), cartes de catalogue, leçon du
  jour, « à revoir », écran de choix de mode, reprise, sprint, révision, fiche/bilan
  (`core/build.ts`), et espace encadrant / impression **au niveau du profil consulté**.
  Sans niveau sous la main, `label` s'affiche : il doit donc rester **juste à tous les
  niveaux** (dégradation = perte de précision, jamais contresens).
- **Consigne de fiche** — `ExerciseType.consigne` accepte, en plus d'une chaîne, une
  **fonction** `(level?) => string | undefined` (`ConsigneFiche`, `core/exercise.ts`), lue
  **uniquement** via **`consignePourNiveau(type, level)`** (lecteurs : `core/build.ts` pour
  la fiche/bilan, `ui/revision.ts` pour la consigne d'action #265). C'est la forme fonction
  qui traverse sans effort la **recopie de métadonnées** de `calibrated` (et un futur
  `...base`) : une consigne fonction doit donc dériver du **niveau reçu en argument**,
  jamais des `params` capturés à la construction.

## Progression namespacée `lessonId@niveau`

**Progression namespacée `lessonId@niveau`** (`progress.ts`) — étoiles, stats,
premier passage, **état SR**. Les `load*` renvoient une **vue scopée** au niveau actif
**par matière** (clés `lessonId` simples → consommateurs inchangés) ; les `load*All`
/ `starsEarnedAll` agrègent **tous niveaux** (effort, cumul « trésor » qui ne baisse
jamais). Écriture clampée via `niveauLecon`. Migration unique `migrateNiveauNamespacing`
(legacy → `@ce2`, via `lsSetQuiet` pour ne pas bumper `updatedAt`). Même patron pour la
carte de déclarations « vues en classe » (`core/vu-ailleurs.ts`, #478) : clés
`lessonId@niveau`, vue scopée au niveau actif via `scopeActif` (`loadVuAilleurs`) —
une déclaration faite au CE2 ne rend pas la leçon rencontrée au CM1.

## Scoping gamification

**Scoping gamification** (`rewards.ts`) — **complétude** (`starsAll`, `allgreen`, par
matière/catégorie) et **objectif du jour** scopés au niveau actif ; **XP, déblocages
(forêt), trophées d'effort/régularité (`vol`/`sprint`/`streak`/`goal`/`ortho`)
restent GLOBAUX** (`loadRunsAll` agrège tous niveaux — un trophée acquis ne se
reverrouille jamais au changement de classe).

## Records de bilans/sprint scopés par niveau

**Records de bilans/sprint SCOPÉS par niveau** (`progress.ts`, #233) — clé
`ludaskia_runs_<mode>@<niveau>` (le niveau d'un record = **niveau actif**, un
sprint/bilan balayant le catalogue du niveau et non une matière). `loadRuns(mode)`
renvoie le **classement du niveau actif** (podiums/records affichés) ; `loadRunsAll(mode)`
agrège **tous niveaux** pour les compteurs d'EFFORT globaux (trophées, `countSince`).
Migration `migrateRunsNamespacing` (legacy `ludaskia_runs_<mode>` globale → `@ce2`,
silencieuse) intégrée à `migrateNiveauNamespacing`. Le défi quotidien « bats ton
record de sprint » reste, lui, scopé au niveau actif (pas un trophée).

## UI

**UI** — popup de **choix de classe** (`ui/onboarding.ts`, choix forcé, déclenchée si
`besoinChoixNiveau()`), filtrage catalogue/sprint par `niveauActifMatiere`, **réglage
parent** par matière (`ui/preferences.ts`), compteur d'accueil (cumul + objectif
scopé), badge « déjà maîtrisée en \<classe\> » (`etoileAuxNiveaux`). **V1 = niveau
actif seul** dans les pools ; mélange bas-niveau + entretien révision = **V2** (piste).
