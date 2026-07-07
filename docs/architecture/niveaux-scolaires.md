[← Architecture Ludaskia](../ARCHITECTURE.md)

# Niveaux scolaires (#225)

Le **niveau scolaire** (`SchoolLevel = cp|ce1|ce2|cm1|cm2|6e`) est un **réglage de
contenu**, par matière — distinct du niveau d'**XP** (récompense). Vocabulaire enfant :
« **classe** » pour le scolaire, « niveau »/rang pour l'XP.

## Modules

- **`levels.ts`** (pur) — `LEVEL_ORDER`, `LEVEL_LABEL`, `effectiveLevel(lesson, niveau)`
  et `closestSupported(supported, niveau)` (niveau demandé, sinon plus haut supporté
  **en-dessous**, sinon plus bas — repli/clamp), `availableLevels(lessons)` (union des
  niveaux présents), `lessonsForLevel(lessons, niveau)`, et
  **`niveauDefautCatalogue(lessons)`** (le plus bas niveau ayant du contenu — **source
  unique** du repli « aucune classe choisie » ; appelé par `niveau-actif.ts` et
  `encadrant-stats.ts`, #351).
- **`level-combinators.ts`** (pur) — `calibrated(table, build)` : **un seul `id`**
  recalibré par une table de paramètres par niveau (génératif : numération…), expose
  ses `levels`; `bankByLevel(items)` : banque QCM tagguée par item, dérive l'union des
  niveaux. Le catalogue dérive `LessonDef.levels` de ces combinateurs (numération,
  grandeurs & mesures — conversions CE2 + CM1, décimaux CM1 #248) ou de la donnée
  (conjugaison taggée).
- **`niveau-actif.ts`** — résout le niveau au **seam** profil/catalogue (lit la méta
  profil **directement** via `storage`, pour éviter un cycle `progress → niveau-actif →
  profiles`). `niveauActif()` (classe de référence), `niveauActifMatiere(subject)`
  (= `niveauParMatiere[subject] ?? niveauReference ?? niveauDefautCatalogue(getAllLessons())`), `niveauLecon(lesson)`
  (= `effectiveLevel` sur la matière, **passé à `generate`/`genLessonItem`** par
  `build`/runners/`revision`/`sprint`), `besoinChoixNiveau()`, `lessonsNiveauActif()`.

## Progression namespacée `lessonId@niveau`

**Progression namespacée `lessonId@niveau`** (`progress.ts`) — étoiles, stats,
premier passage, **état SR**. Les `load*` renvoient une **vue scopée** au niveau actif
**par matière** (clés `lessonId` simples → consommateurs inchangés) ; les `load*All`
/ `starsEarnedAll` agrègent **tous niveaux** (effort, cumul « trésor » qui ne baisse
jamais). Écriture clampée via `niveauLecon`. Migration unique `migrateNiveauNamespacing`
(legacy → `@ce2`, via `lsSetQuiet` pour ne pas bumper `updatedAt`).

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
