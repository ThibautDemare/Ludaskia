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
  `encadrant-stats.ts`, #351), **`labelLecon(lesson, niveau?)`** (#436, ci-dessous) et
  **`niveauInferieurImmediat(reference)`** (#232 — niveau juste en dessous sur l'échelle,
  `undefined` pour le plus bas ou hors échelle : périmètre de l'entretien du niveau
  inférieur en révision espacée, cf. [Logique pure](core.md)).
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
jamais). **Seule exception** : l'état SR expose aussi, À PART (`loadLessonRevisionsBasNiveau`,
avec son niveau de clé), les entrées du niveau immédiatement inférieur pour l'entretien en
révision espacée (#232, cf. [Logique pure](core.md)) — un croisement volontaire de la règle
« vue scopée = niveau actif seul », borné à un seul niveau d'écart. Écriture clampée via
`niveauLecon`. Migration unique `migrateNiveauNamespacing`
(legacy → `@ce2`, via `lsSetQuiet` pour ne pas bumper `updatedAt`). Même patron pour la
carte de déclarations « vues en classe » (`core/vu-ailleurs.ts`, #478) : clés
`lessonId@niveau`, vue scopée au niveau actif via `scopeActif` (`loadVuAilleurs`) —
une déclaration faite au CE2 ne rend pas la leçon rencontrée au CM1.

**Deuxième contrat de lecture, pour une référence DÉSIGNÉE (#556)** : `scopeActif` exclut
par construction ce qui n'est pas au niveau actif de la matière — juste pour un PÉRIMÈTRE
(récap, complétude), faux pour une leçon qu'un adulte a délibérément assignée hors de la
classe suivie (épingle « à revoir », cible d'une étape de programme), jouée et stockée au
niveau qui est le SIEN. `scopeStockage` lit donc chaque leçon à son niveau de STOCKAGE
(`niveauStockage`, celui de sa clé) plutôt qu'au niveau actif ; les deux vues coïncident
pour tout ce qui appartient déjà au niveau actif. `loadStarsStockage`/
`loadLessonStatsStockage` en sont les pendants de `loadStars`/`loadLessonStats` — consommés
par `revoirActives` ([Espace encadrant](espace-encadrant.md)), qui ne filtre plus sur le
niveau depuis #556. `etoilesParNiveau(raw)` (pur) détaille, à l'inverse, le cumul « trésor »
PAR CLASSE (une fois par `lessonId@niveau` étoilée, ordre scolaire) : réservé à l'espace
encadrant (`RecapProfil.etoilesParNiveau`), pour dire à l'adulte quelle part du travail se
fait hors de la classe suivie — côté enfant, le trésor reste un total unique, sans détail.

## Scoping gamification

**Scoping gamification** (`rewards.ts`) — **complétude** (`allgreen`, par
matière/catégorie) et **objectif du jour** scopés au niveau actif ; **XP, déblocages
(forêt), trophées d'effort/régularité (`vol`/`sprint`/`streak`/`goal`/`ortho`)
restent GLOBAUX** (`loadRunsAll` agrège tous niveaux — un trophée acquis ne se
reverrouille jamais au changement de classe).

**Paliers ⭐ (`stars5`/`stars15`/`stars30`) : GLOBAUX depuis #559**, sur la métrique
`starsTousNiveaux` (= `starsEarnedAll()`, le cumul « trésor » tous niveaux confondus) —
et non plus sur les étoiles du niveau actif : c'est ce cumul que l'accueil met en avant
(compteur `#recLecon`, cf. [`ui/`](ui.md)), un enfant ne pouvant pas comprendre un
trophée hors de portée de ce qu'il lit. Les **ids ne changent pas**, ce qui garantit
qu'aucun trophée déjà acquis ne se reverrouille. `starsAll` (« Sans faute partout »)
**reste seul SCOPÉ** au niveau actif dans cette famille : il se compare à
`totalLessons`, le catalogue de la classe active, une métrique qui n'a pas de sens
« tous niveaux ».

## Tour de matière : une troisième nature, le niveau porté par l'id (#276)

Les trophées de tour (`tour-<matière>-<niveau>`, `rewards.ts:tourMatiereTrophies`,
cf. [Gamification](gamification.md)) n'entrent dans **aucune** des deux cases
ci-dessus. Pas SCOPÉS : un tour acquis au CE2 doit rester acquis quand la matière
passe au CM1 (comme tout trophée). Pas GLOBAUX : contrairement à `starsTousNiveaux`,
un même id ne peut pas représenter à la fois « tout le CE2 » et « tout le CM1 » sans
perdre l'un des deux diplômes. La solution est une **troisième nature** : le niveau
est **porté par l'id lui-même**, un id par couple matière × niveau **peuplé** — la
clé de stockage (`loadTrophies`) suffit alors à ne jamais reverrouiller un tour,
sans qu'aucune vue scopée ni aucun cumul n'ait à s'en mêler.

**Pourquoi la maille est MATIÈRE × NIVEAU, et non le seul niveau** (arbitrage tracé
sur #276) : nommer le trophée d'après la classe de RÉFÉRENCE (`niveauActif()`)
mentirait dès qu'une matière est réglée ailleurs (le niveau se règle **par matière**,
cf. « Modules » ci-dessus) — un enfant en référence CM1 avec les maths laissées au
CE2 aurait décroché « Tour complet — CM1 » sans une seule leçon de maths de CM1, et
ce diplôme déjà acquis aurait rendu muet le jour où les vraies maths de CM1 seraient
enfin finies : le « second diplôme silencieux » que ce lot supprime serait revenu par
cette porte. La maille matière × niveau laisse les deux tours (CE2 puis CM1)
atteignables indépendamment, chacun au rythme propre de sa matière.

### Rejet écrit : le calcul en direct a une fenêtre de perte, assumée (#585)

`gSnapshot().toursMatiere: Record<'matière@niveau', boolean>` est recalculé EN DIRECT
à chaque évaluation des trophées, à partir des cartes d'étoiles et de report en
cours — rien n'est mémorisé pour dire « le tour du CE2 était fait ». Remontée
d'`auteur-tests-logique` en relecture : si un encadrant change le niveau d'une
matière **entre** l'instant où le tour s'achève et son évaluation, le diplôme est
**perdu pour toujours** — les leçons jamais tentées d'un niveau abandonné ne
reviennent dans aucun pool de tirage (#232), donc ce niveau ne redeviendra jamais
« tout franchi » de lui-même. En pratique la fenêtre est étroite :
`core/lesson-run.ts` évalue les trophées dans le même appel que celui qui enregistre
l'essai qui termine le tour, et `ui/render.ts` rattrape à chaque affichage de
l'accueil — il faut une intervention d'adulte pile entre les deux pour la manquer.

**Écarté volontairement** : mémoriser le tour par niveau (un état posé une fois pour
toutes, indépendant du calcul en direct) fermerait cette fenêtre, mais au prix d'un
défaut pire pour un enfant qui avance à un rythme inégal entre ses deux matières (ex.
maths passées au CM1, français resté au CE2) — le niveau quitté avant d'y avoir tout
fini ne repasserait alors plus jamais par l'état « tout franchi », son tour resterait
donc **définitivement inatteignable**. Le calcul en direct paie une fenêtre de
quelques secondes contre ce risque permanent ; ce n'est pas à rouvrir sans un cas
concret qui le justifie.

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
actif seul dans les pools de tirage** (sprint/révision), toujours vrai aujourd'hui — le
**mélange biaisé vers le bas** de ces pools reste une piste (cf. [Piste
d'évolution](pistes-d-evolution.md)). L'**entretien du niveau inférieur en révision
espacée**, lui, est sorti de cette piste : livré (#232, cf. [Logique pure](core.md)).

**Exception côté ADULTE (#556)** : le sélecteur de leçon de l'espace encadrant
(`core/catalogue-arbre.ts`/`ui/selecteur-lecon.ts`, cf. [Espace
encadrant](espace-encadrant.md)) ne filtre PAS par défaut sur le niveau — il expose tout le
catalogue, la classe devenant un filtre parmi d'autres (barre de jetons) plutôt qu'une
frontière. Ce renversement reste réservé à l'adulte qui DÉSIGNE une leçon précise : les
pools de tirage de l'enfant ci-dessus (sprint/révision) restent scopés à sa classe.
