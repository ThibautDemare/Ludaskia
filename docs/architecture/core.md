[← Architecture Ludaskia](../ARCHITECTURE.md)

# Logique pure (`src/core/`)

Modules **testables sans DOM** (aucun accès DOM au chargement). Regroupés ici par
thème ; le détail du dossier `src/data/` est dans [Contenu & leçons](contenu-et-lecons.md),
et les modules `levels.ts` / `level-combinators.ts` / `niveau-actif.ts` dans
[Niveaux scolaires](niveaux-scolaires.md). Le **moteur d'orthographe**
(`core/orthographe/` : `store`, `exercise`, `lessons`, `diff`, `types`, verbes) a sa
propre doc de conception : `docs/design-orthographe.md`.

## Fondations

- **`utils.ts`** — aléatoire (`rnd`, `choice`, `sample`), déduplication
  (`uniqueComm/Exact`, `commKey`), `escapeHTML`, `fmt` (mm:ss), et `normalizeText`
  (normalisation **partagée** des réponses texte : trim + espaces internes réduits + NFC).
  **RNG seedable (#41)** : tout l'aléa passe par `randFloat()` (source déroutable) ;
  `withSeed(seed, fn)` la rend déterministe le temps de `fn`, `randomSeed()` tire une
  graine. **Invariant** : les générateurs d'exercices ne doivent JAMAIS appeler
  `Math.random` directement (sinon le corrigé imprimable diverge de la feuille).
- **`storage.ts`** — `lsGet/lsSet` (clés préfixées par profil), accès bruts
  (`lsKeysRaw/lsRemoveRaw/lsSetRaw`, `appKeys`), `setActivePrefix`, constante
  `PROFILES_KEY`, et `setOnDataWrite(fn)` (hook appelé après chaque écriture de
  donnée de profil — branché depuis `main.ts`).
- **`profiles.ts`** — profils (UUID, préfixe, `updatedAt`), `initProfiles`,
  export/import. La **méta de profil** porte aussi `prefs` (a11y #42),
  `niveauReference` et `niveauParMatiere` (classe scolaire #225) — champs **additifs**
  (format export `v2` inchangé), emportés par l'export, survivent à « Réinitialiser ».
  `applyActive()` déclenche les migrations idempotentes (`migrateNiveauNamespacing`
  **avant** `migrateRevisions`). ⚠️ Plus d'effet de bord au chargement :
  `initProfiles()` et le branchement du hook sont appelés par `main.ts`.
- **`items.ts`** — item de rendu `{text, answer, answers?, kind?, figure?}` (`@` = champ).
  Fabriques math (`add/sub/mul/dbl/half/comp/facteur`), `renderItem` (champ
  numérique, **texte**, ou **grille posée** selon `kind`), `checkItemAnswer`
  (correction numérique **ou** texte via `normalizeText`), `gridHTML`,
  `ficheHTML`/`ficheHTMLGeneric`, `lessonAttr()`. Le `kind: 'posed'` (#97) est un
  item « conteneur » (`posed: {op, a, b}`) que **`posedGridHTML`** déploie en grille
  de colonnes — plusieurs champs `.ans` (chiffres de résultat / produits partiels,
  notés un à un) + cellules de retenue `.ans-free`. Le champ **`figure`** (#88) porte
  un fragment SVG (moteur `figures.ts`) que **`figureBlock`** affiche AU-DESSUS de la
  question ; `renderItem` l'ajoute, et les runners « une question à la fois » (QCM,
  sprint, révision) appellent `figureBlock` au même endroit pour un rendu identique
  partout. État de module via accesseurs.
- **`figures.ts`** — **moteur de figures SVG génératives (#88)**, module **PUR**
  (renvoie une chaîne de balisage, aucun accès DOM). Primitives bas niveau
  réutilisables (`svgCanvas` — viewBox carré + `role="img"` + `<title>`/`<desc>` +
  `aria-label` ; `line`, `circle`, `rect`, `polygon`, `polyline`, `text`,
  `pointOnCircle`, et **`arc(cx, cy, r, deg1, deg2)`** — path d'arc, #202) et un
  premier renderer **`renderHorloge(h, m)`** (cadran,
  graduations, chiffres, deux aiguilles distinctes — la petite/heures
  **proportionnelle aux minutes**), **`renderPolygoneCote(points, labels)`**
  (#99 — polygone dessiné **à l'échelle** depuis ses sommets, chaque côté coté à
  l'extérieur ; un label vide = côté non coté) et **`renderQuadrillage(cols, rows,
  cells)`** (#99 — figure rectiligne sur grille, **contour surligné** ; le helper
  **`boundaryEdges(cells)`** donne les côtés unitaires du tour, sa longueur = le
  périmètre en côtés de carreaux). `renderFigure(spec)` aiguille par données (union
  **`FigureSpec`** : `horloge` | `polygoneCote` | `quadrillage`, **point
  d'extension**). **C'est le socle réutilisable** des figures de « Grandeurs et
  mesures » / « Géométrie ». Côté géométrie (#100) : **`renderFigurePlane(shape,
  rotation)`** (figure pleine à reconnaître, rotation pour varier l'orientation) et
  **`renderSceneFigures(cells)`** (scène de plusieurs figures à compter, grille
  monochrome) et **`renderCercle(segment?, label?)`** (#102 — cercle + centre, rayon
  ou diamètre surligné et coté, ou marqué « ? » pour le vocabulaire) et
  **`renderSolide(solid)`** (#103 — schéma d'un solide en **perspective cavalière
  sans arêtes cachées** : cube, pavé droit, cylindre, cône, pyramide, boule ;
  primitive `ellipse` ajoutée) et **`renderGroupes(paniers, total)`** (#104 —
  division par le sens : `total` jetons en vrac + `paniers` contenants **vides** ;
  montre la SITUATION, jamais le résultat → l'enfant calcule, il ne compte pas une
  réponse déjà posée), **`renderSymMiroir(motif, axis)`** / **`renderSymImage(motif, axis, t)`**
  (#201 — symétrie axiale : figure devant un miroir, et scène-choix « figure + miroir + image »
  où l'image est un reflet/glissé/tourné ; reflet par réflexion exacte des points) et
  **`renderAngle(opening, bisector)`** (#202 — deux demi-droites depuis un sommet net : un
  **arc** matérialise l'ouverture d'un aigu/obtus, le **carré de codage** marque l'angle droit
  (jamais les deux), orientation variée par la bissectrice ; **aucune mesure affichée** et
  invariant « 90° ⇒ carré » garanti par `opening === 90`).
  `FigureSpec` couvre `horloge | polygoneCote | quadrillage | figurePlane | sceneFigures |
  cercle | solide | groupes | fraction* | symJuger | symMiroir | symImage | angle`. On compose
  avec les primitives, on ajoute un `renderXxx` (+ variant `FigureSpec` au besoin),
  jamais de SVG « à la main » dans une leçon. `svgCanvas(..., decorative)` rend un SVG
  **décoratif** (`aria-hidden`, sans role/label) quand un parent déjà nommé porte le sens
  (ex. une figure DANS un bouton-choix QCM dont l'`aria-label` décrit déjà le choix). Tokens de couleur dédiés
  (`--clock-min`…) ; styles dans `src/styles/figures.scss`.
- **`exercise.ts`** — abstraction d'exercice : type `Exercise`
  (`text` | `qcm` | `tuilesNombre` (numération #98) | `tuilesOrdre` (ordre
  alphabétique #108 : suite mélangée + suite triée) | `tuilesTri` (champs
  lexicaux #114 : tuiles + thème correct de chacune) | `posed` (calcul posé #97 :
  op + opérandes) | interactions ortho), interface **`ExerciseType`** : `modes?`
  (descripteurs **`ModeOption`** `{id, label, hint, icon, recommended}`, dans
  l'ordre d'affichage), `generate(opts? : {mode?, level?})` (le `level` #225 calibre
  une leçon multi-niveaux), `check()`. Helpers **`hasMode`** et
  **`defaultMode`** (les écrans dérivent leurs choix d'ici, **jamais en dur**, #69),
  et `checkAnswer` (normalisation partagée `normalizeText` ; **accents et
  apostrophes exigés**).
- **`fraction-text.ts`** (#42/#200) — module **pur** : libellé verbal d'une fraction
  (`texteParle` : « trois quarts ») et **rendu typographique empilé** (barre horizontale,
  numérateur au-dessus) via `mathInline`. La donnée garde la clé plate « num/den » ; ce
  module la transforme en affichage au rendu (l'oblique « 6/8 » se confondrait avec une
  division — avis pédagogue).
- **`aide.ts`** (#272) — **aide contextuelle** des runners à interaction non intuitive,
  module **pur** : porte le **contenu** des aides (`AIDES` : titre + étapes courtes ≤ 3 +
  voie alternative + filet anti-erreur) pour 5 types (`tuiles`, `ordre`, `tri`, `atelier`,
  `lettres`) et la **mémoire « aide déjà vue »** par profil (`ludaskia_aide_vue`, via
  `lsGet/lsSet`). Le rendu vit dans `ui/aide-exercice.ts`.
- **`icon-names.ts`** — type **pur** `IconName` : noms **sémantiques** (rôle, pas dessin)
  des icônes Phosphor, pour que les modules `core/`/données typent leur champ `icon` sans
  dépendre du rendu. L'association nom → SVG est dans `ui/icon.ts`.

## Enregistrement, catalogue & ordre pédagogique

- **`lesson-run.ts`** — **`recordLessonRun()`** : enregistrement d'un essai
  (série, stats par leçon, XP, montée de niveau, étoile, objectif, trophées),
  **commun à tous les rendus** (fiche en saisie *et* runner QCM) pour garantir la
  **parité** entre modes — aucun mode n'est plus rentable qu'un autre (#69).
- **`catalog.ts`** — hiérarchie `SUBJECTS` / `CATEGORIES` / `LessonDef`
  (`id, label, subject, category, levels: SchoolLevel[], exerciseType` — #225), helpers
  `getAllLessons/getLessonById/getLessonsBySubject/getLessonsByCategory` (ces deux
  derniers acceptent un `niveau?` optionnel : avec un niveau, ils **filtrent ET trient
  selon l'ordre pédagogique** #208, cf. `ordre.ts` ; sans niveau, ordre de déclaration),
  `MATH_LESSON_NUM` (pont id→`bilanQ`), et **`genLessonItem(lesson, level?)`** qui produit
  un `Item` pour n'importe quelle matière. Trois chemins, départagés par
  **`isLegacyMathLesson`** : maths **hérités** (calcul mental, dans
  `MATH_LESSON_NUM`) → `bilanQ` ; maths **modernes** (conversions #89, monnaie #96,
  numération #98…, moteur `ExerciseType`) → item depuis `generate()` (le `@` place
  le champ), `kind` déduit de la réponse via `answerEstNumerique` (nombre → `num`,
  signe `<`/`=`/`>` → `text`) ; autres matières → item **texte**. Ajouter une leçon
  math hors calcul mental ne touche donc plus à `bilanQ`/`LESSONS`.
  Catégories maths (#92) : `math-numeration`, **`math-calcul`** (opérations
  **posées**, à ne pas confondre avec **`math-calcul-mental`**, les 15 leçons de
  calcul mental historiques), `math-grandeurs-mesures`, `math-geometrie`. Les
  catégories sans `LessonDef` sont **légitimes** : la navigation affiche un écran
  « Bientôt disponible », les trophées de catégorie ne sont générés que pour les
  catégories peuplées (`rewards.ts`), et le sprint/bilan d'une catégorie vide ne
  tire rien (retour accueil / no-op) plutôt que de planter.
- **`ordre.ts`** — **ordre pédagogique** des leçons (#208). Consomme la table de
  données `data/ordre-pedagogique.ts` (`ORDRE_LECONS[matière][niveau]` = liste d'`id`
  **ordonnée** = progression de l'année, validée avec `pedagogue-primaire`) et expose
  `ordreLecons` / `positionLecon` / `trierParOrdre`. Le tri est **stable et TOTAL** :
  une leçon absente de l'ordre est reléguée **en queue** (ordre de déclaration), jamais
  perdue. `getLessonsBySubject/ByCategory` trient via lui dès qu'un `niveau` est fourni.
  **Invariant gardé par test** (`tests/ordre-pedagogique.test.ts`) : toute leçon figure
  dans l'ordre de chacun de ses niveaux → **ajouter une leçon impose de l'insérer dans
  `ORDRE_LECONS`** (sinon le test échoue ; cf. agent `integrateur-lecon`).
- **`lecon-du-jour.ts`** — la **« leçon du jour »** (#208), pure : le prochain pas à
  travailler, mis en avant sur l'accueil. Entrelace les séquences par matière — chacune
  à **son** niveau actif (`niveauActifMatiere` → multi-niveau natif) — en **alternance
  1:1 sur les leçons restant à acquérir** (`sequenceLeconDuJour`), et renvoie la
  **première non acquise** (`leconDuJour`) ; « acquise » = ≥ 1 étoile au niveau actif
  (`loadStars`). Avance par la **maîtrise**, jamais par calendrier ; `leconSuivante` =
  contournement « voir une autre leçon » (jamais de mur). Reste **distinct** de la
  révision espacée (avancer vers le neuf ↔ entretenir l'acquis) et du défi du jour.
- **`sprint-scope.ts`** — **périmètre du sprint** (#208, pure) : `all` (toutes les
  leçons éligibles du niveau) ou `seen` (uniquement les leçons **déjà rencontrées**,
  `loadLessonFirstSeen` — pas « acquises » : le sprint consolide, y compris le fragile).
  `appliquerScope` filtre, `scopeParDefaut` donne le défaut **adaptatif** (« déjà vues »
  tant qu'il reste du non-rencontré, sinon « tout »), `perimetreChoisissable` dit si le
  choix a un sens. Consommé par `ui/sprint.ts` (sélecteur dans l'écran de config, options
  vides au périmètre courant désactivées) ; un favori (`lessons`) ignore le périmètre.

## Contenu maths & génération de fiches/bilans

- **`lessons.ts`** — contenu **maths** : `LESSONS` (15 leçons CE2 constructibles
  isolément), `LESSONS_CM1` (leçons CM1, #241), `LESSONS_CALCUL_MENTAL` (lookup combiné
  CE2+CM1 pour le rendu par `id`), `bilanQ` (générateur réutilisé par le catalogue). La
  **fiche imprimable** (`build()`) et la **génération interactive** (`bilanQ`,
  sprint/bilan) doivent tirer dans les **mêmes plages** — c'est `bilanQ` qui pilote
  l'anti-répétition de l'entraînement. Quand une plage n'est pas une simple borne
  numérique (cibles de **moitiés** `CIBLES_MOITIES` / `CIBLES_MOITIE_PAIR`,
  décomposition `CIBLES_DECOMPO_MULT`, dividendes exacts `DIVIDENDES_DIV_10/100`), elle
  est **centralisée en constante exportée** en tête du module et **partagée** par les
  deux chemins (#287). ⚠ Le système fiche/`bilanQ` n'a **pas** de paramètre `level` : le
  **calibrage d'une leçon est figé** (pas de recalibrage par niveau). Étendre une notion
  au CM1 se fait par une **leçon distincte** (nouvel `id` + nouveau numéro `bilanQ`, dans
  `LESSONS_CM1`, taguée `levels: ['cm1']`), **jamais** en surchargeant la plage d'une
  leçon CE2. Les vues legacy « toutes les leçons » (`buildFiches`, `bilanBlocks`,
  `bilanHTML`, `renderLessons`) itèrent le seul `LESSONS` (CE2) ; `buildLessonFiche`
  retrouve une leçon (tous niveaux) dans `LESSONS_CALCUL_MENTAL`. Côté
  impression : `PrintScope` + **`buildPrintableDOM(scope)`** (contextuel,
  **multi-matières** via `buildLessonFiche`/`bilanBlocksForIds`), `coverHTML(scope)`
  (garde dynamique), pagination 2 fiches/A4. (`buildFiches`/`bilanHTML` historiques
  conservés.) **Corrigé (#41)** : `scope.corrige` rend le corps DEUX fois — feuille
  vierge puis réponses révélées (sous-mode `setCorrigeMode`, `core/items.ts`) — sur les
  MÊMES items (graine commune via `withSeed`), avec `corrigeCoverHTML` en intercalaire.
- **`build.ts`** — construction **générique multi-matières** : `genItems`,
  `buildLessonFiche` (calcul mental → rendu riche via `LESSONS.build()` ; maths
  modernes & autres matières → liste de questions, consigne « Complète. » pour les
  maths, « Écris la forme correcte. » pour le texte ; même discriminant
  `isLegacyMathLesson`), `bilanBlocksForIds`, `buildFichesForIds` (bilans persos).
- **`bilan-express.ts`** — express **borné** (~20 q, cible ~10 min CE2) :
  `expressQuestionsPerLesson` (≤ 3, 1 quand il y a beaucoup de leçons),
  `sampleExpressLessons` (tirage **pondéré** — leçons fragiles/jamais vues
  prioritaires — et **tournant** — évite le tirage précédent), et
  `buildExpressConfig` qui en fait un `BilanConfig`. Branché sur l'express de
  catégorie ; le bilan personnalisé reste explicite (non borné).
- **`bilans.ts`** — persistance des `BilanConfig` favoris (`ludaskia_bilans`).

## Reprise & révision espacée

- **`resume.ts`** — **reprise d'un exercice en cours** (#63), brique **pure** :
  stockage par profil (`ludaskia_resume`) d'instantanés d'exercices **grille**
  (leçon, bilans express/complet/personnalisé) — `loadResumes`/`getResume`/
  `upsertResume`/`removeResume`/`clearResumes`, **clés stables** par identité d'exercice (`leconKey`,
  `bilanCategoryKey`, `bilanCustomKey` ; relancer écrase), **validation
  versionnée** (un instantané d'une autre version ou mal formé est ignoré
  proprement), **expiration silencieuse** (`RESUME_TTL_MS`, 7 j) et **plafond**
  de stockage (`RESUME_MAX_STORED`). `now` passé en paramètre (testable sans
  horloge). Sprint et révision espacée **hors périmètre** (le sprint est un défi
  borné ; la révision est déjà persistée item par item, comme l'orthographe).
- **`revision.ts`** — **révision espacée** (#45), brique **pure** : escalier
  d'intervalles CE2 (`etatNeuf`, `avancerEtat`, `estDu`/`estAcquis` ; `now` passé
  en paramètre). État `EtatRevision` partagé par les mots d'orthographe et les
  leçons maths/conjugaison.
- **`revision-select.ts`** — sélection des éléments **dus** (mots + leçons),
  **regroupés par catégorie** et plafonnés (`selectDueGroups`, `countDue`) ;
  `prochaineEcheance`/`aDesRevisions` alimentent l'état « rien à réviser » de
  l'accueil (carte conservée mais non actionnable, message valorisant + horizon).
- **`revision-migrate.ts`** — **reprise** de l'historique vers la révision : à
  l'activation d'un profil (`applyActive`), les leçons déjà notées et les mots
  déjà en banque sans état SR entrent en rotation, **datés J-1** → dus dès le jour
  même (`migrateRevisions` ; backfills idempotents dans `progress.ts` /
  `orthographe/store.ts`). Rattrape l'activité antérieure à #45.

## Progression, gamification & déblocages

- **`progress.ts`** — records de bilans **scopés par niveau** (`recordRun`,
  `cmpRun` « score puis temps », `loadRuns` = niveau actif / `loadRunsAll` = tous
  niveaux pour l'effort — #233), série (`updateStreak`, `streakSuffix`), étoiles
  (`recordLessonResult`, `starsEarned`), stats par leçon (`recordLessonStats`,
  `lessonAvgPct` cumul + `recentAvgPct` = perf **récente**, calculée sur la fenêtre
  glissante de données `recentPct`, #234),
  **journal d'activité** (`ludaskia_activity`, `loadActivity` — une session finalisée
  horodatée par `recordLessonStats`, #234), **XP global** (`getXP`/`addXP`, `ludaskia_xp`)
  et **niveaux dérivés** (`niveauDepuisXP`, `progressionNiveau`, `xpVersSuivant`,
  `xpPourNiveau`, `NIVEAU_MAX`), périodes calendaires (`startOfWeek/Month`,
  `countSince`).
- **`rewards.ts`** — défi du jour contextuel (`CHALLENGES`, `getGoal`,
  `updateGoal`) et trophées (`TROPHIES`, `tiers()`, `evaluateTrophies`,
  `gSnapshot`), dont des groupes **par matière** et **par catégorie** générés
  depuis le catalogue.
- **`unlocks.ts`** — déblocages cosmétiques **dérivés du niveau** (issue #28),
  module **pur** sans stockage ni migration : **rangs** (`RANGS`, `titreDuNiveau`),
  **mascotte évolutive** (`MASCOTTE` à 9 formes œuf→aigle, `mascotteDuNiveau` ; chaque
  forme porte une catégorie `oeuf|oisillon|oiseau` qui pilote l'animation), **avatars
  « forêt »** débloqués par palier (`AVATARS_FORET`, `niveauRequisAvatar`,
  `avatarsForetDebloques` — gamme forêt seule ; la combinaison avec les 12 de base se
  fait dans `profiles.ts` pour éviter un cycle), **thèmes de couleur** (`THEMES`,
  `themesDebloques` — tous clairs, débloqués par palier), et récompenses de palier
  (`recompensesNiveau`, `recompensesEntre` qui agrège un saut de plusieurs niveaux).

## Espace encadrant (logique pure)

- **`encadrant-stats.ts`** (#234, pur) — lecture de la progression **par UUID sans
  bascule** (`progressionProfil`, `niveauNotion` échelle 4 niveaux, `activiteParJour`,
  `niveauProfilMatiere`) et **file « à revoir »** (`loadRevoir`/`loadRevoirFor`/
  `toggleRevoirFor`/`revoirActives`). Lit les clés brutes du profil consulté.
- **`encadrant-lock.ts`** (#234) — verrou optionnel de l'espace encadrant : PIN haché
  (SHA-256 `crypto.subtle`) + récupération par secret (GUID) ; clé GLOBALE
  `ludaskia_encadrant_lock` (`pinActif`/`definirPin`/`verifierPin`/`reinitViaRecuperation`/
  `desactiverPin`).
