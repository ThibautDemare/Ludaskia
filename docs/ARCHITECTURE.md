# Architecture — Ludaskia

> Document **« état courant »** : il décrit l'architecture telle qu'elle est
> aujourd'hui, et se met à jour **sur place** à chaque évolution. L'historique
> des décisions vit dans les commits, les PR et les issues — pas ici.

## Vue d'ensemble
Mini-application web d'entraînement **multi-matières** (niveau CE2). Côté
**maths**, le catalogue suit le découpage du manuel CE2 en **Numération**,
**Calcul** (opérations posées), **Calcul mental**, **Grandeurs et mesures** et
**Géométrie** (#92) — toutes peuplées (numération, calcul posé, calcul mental,
grandeurs et mesures, géométrie). Côté
**français** : **conjugaison** et **orthographe**. Génération aléatoire
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
- Tests : **Vitest** (logique pure, `happy-dom`) + **Playwright** (smoke e2e
  navigation/rendu, dossier `e2e/`, #129).
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
| `npm run test:e2e` | smoke tests Playwright (`e2e/`) |

La CI (`.github/workflows/ci.yml`) a deux jobs : `test` enchaîne `format:check →
lint → typecheck → test` (bloquant), et `e2e` lance les smoke tests Playwright
(**non bloquant** tant que le harnais se stabilise, #129). Sur chaque PR et push
`main`.

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
fabrique `conjugationType(verbId, tense)` (un `ExerciseType` à deux modes,
**choisissables depuis la leçon** (#69) : `saisie` **conseillé** — l'enfant écrit
la forme, fiche imprimable — et `qcm` — choix entre plusieurs formes,
**distracteurs dérivés du paradigme** du verbe, toutes de **vraies formes
correctement orthographiées**, jamais une faute affichée) et descripteurs
`CONJ_LESSONS` (une leçon par verbe × temps). Dossier `francais` sans cédille
pour des chemins d'import ASCII portables ; le libellé affiché reste « Français ».
**`maths/mesures.ts`** (#89) : moteur de **conversions d'unités** partagé par
4 leçons de « Grandeurs et mesures » — `mes-longueurs` (m↔cm, km↔m),
`mes-masses` (kg↔g), `mes-contenances` (L↔cL), `mes-durees` (h↔min + fractions
d'heure). `conversionType(config)` fabrique un `ExerciseType` **mono-mode** dont
`generate()` produit une question texte avec `@` (emplacement du champ) et une
réponse **numérique** ; `MESURE_LESSONS` liste les descripteurs. Calibrage CE2
(avis pédagogique) : facteur grande→petite ≤ 9, sens inverse sur multiples
exacts (réponse entière), pondération ~60/40 vers le sens ×, mL (L↔mL) et
conversion min↔s écartés (CM1 / surcharge base 60).
**`maths/monnaie.ts`** (#96) : 2 leçons de monnaie de la même catégorie
(`mes-monnaie-calcul` : prix total / reste en € ou en centimes ; `mes-monnaie-rendu` :
rendu = billet − prix). Même chemin « math moderne » (item `num`). Calibrage CE2 :
réponse **toujours entière**, unité (€ ou c) collée au champ, pas de décimaux ni de
mélange €/c franchissant l'euro, billets 5/10/20 €, centimes par pas de 10 sous 1 €.
**`maths/numeration.ts`** (#98) : 3 leçons « situer un nombre » (catégorie
`math-numeration`) — `num-comparer` (placer `<`, `=`, `>`), `num-encadrer-intercaler`
(dizaine/centaine juste avant/après, intercaler entre bornes serrées),
`num-situer-10000` (idem jusqu'à 9999, encadrement au millier). **Deux modes** par
leçon (#69) : `saisie` (conseillé, compatible fiche/bilan : on tape le signe ou le
nombre) et `tuiles` (on déplace la bonne tuile parmi des distracteurs). Le mode
tuiles produit un `Exercise` de type **`tuilesNombre`** (`{question, answer, tuiles}`)
rendu par un runner d'écran dédié `ui/lecon-tuiles.ts`. Calibrage CE2 : nombres à
3 chiffres (4 réservés à la leçon « 10 000 »), `=` minoritaire, ~30 % de longueurs
différentes (cas charnière), distracteurs typés sur les erreurs classiques.
**`maths/posee.ts`** (#97) : 3 leçons d'**opérations posées** (catégorie
`math-calcul`) — `calc-addition-posee`, `calc-soustraction-posee` (a ≥ b garanti),
`calc-multiplication-posee` (×1 chiffre et ×2 chiffres avec produits partiels). Le
générateur produit un `Exercise` `posed` (op + opérandes) ; le catalogue en fait un
**Item `kind: 'posed'`** que `renderItem` déploie en **grille de colonnes**
(posedGridHTML) : chaque chiffre du résultat (et des produits partiels) est un champ
`.ans` noté individuellement, des cellules de retenue `.ans-free` servent d'aide.
verify() corrige chaque cellule (sans-faute = toutes justes). Exclu du sprint
(multi-cellules), pris en charge en bilans/impression/révision.
**`maths/position.ts`** (#94) : 4 leçons de numération positionnelle de la même
catégorie — `num-valeur-position` (« chiffre des X » vs « combien de X en tout »)
et `num-decompose-100/1000/10000` (décomposition « en rangs », sens décomposer
troué dominant + composer). Mono-mode saisie, réponse numérique unique (pas de
multi-champs : le `@` reste unique par item). Calibrage CE2 : « en tout » jamais
sur les unités, forme additive écartée (ambiguïté 6 vs 60), zéro intercalaire
inclus, accords singulier/pluriel soignés.
**`maths/heure.ts`** (#88) : leçon **« Je lis l'heure »** (`mes-lecture-heure`,
catégorie « Grandeurs et mesures »), **première cliente du moteur de figures SVG**
(`core/figures.ts`) — chaque question affiche une **horloge** générée. Deux modes
(#69) : `saisie` (conseillé, fiche imprimable ; réponse « H h MM » au **parsing
tolérant** — `10h15`, `10:15`, `8`/`8h`/`8h00` pour les heures pile, déclaré via
`answers`) et `qcm` (4 propositions, **distracteurs = erreurs classiques** :
inversion des aiguilles, ±5 min, confusion quart/demi, ±1 h). Calibrage CE2 (avis
pédagogique) : horloge **12 h** uniquement, 4 plages pondérées (heures pile, demi,
quarts, multiples de 5), positions d'aiguilles quasi superposées (dont 12 h 00)
écartées.
**`maths/perimetre.ts`** (#99) : **3 leçons** de périmètre (catégorie « Grandeurs
et mesures »), clientes du moteur SVG, mono-mode saisie, réponse **numérique**
(unité « cm » affichée par l'app) — découpage en 3 compétences distinctes (avis
pédagogique) : `mes-perimetre-cotes` (additionner les côtés d'un rectangle /
triangle isocèle / figure en L cotés — `renderPolygoneCote`), `mes-perimetre-quadrillage`
(compter les **côtés de carreaux** du contour sur grille — `renderQuadrillage` +
`boundaryEdges`), `mes-perimetre-formule` (déduire : carré `4 × côté`, rectangle
`2 × (L + l)`). La définition (« le périmètre, c'est le tour ») est rappelée dans
chaque énoncé. Calibrage CE2 : côtés 2–15, périmètre ≤ ~50 ; figures à l'échelle
(triangle isocèle, L cohérent) ; quadrillage ≤ 6×6, périmètre 8–20.
**`maths/geometrie.ts`** (#100) : **2 leçons** de « Géométrie » (figures planes),
clientes du moteur SVG. `geo-figures-reconnaitre` — identification **visuelle** :
nommer une figure affichée (`renderFigurePlane`) ou compter les figures d'une forme
dans une scène (`renderSceneFigures`) ; deux modes (#69) `qcm` (conseillé, écran) et
`saisie` (on écrit le nom / le nombre, fiche imprimable). `geo-figures-proprietes` —
propriétés et vocabulaire (nombre de côtés, angles droits, côtés égaux) en **QCM
textuel** (mono-mode, sans figure). Calibrage CE2 (avis pédagogique + designer) :
figures carré/rectangle/triangle/triangle rectangle/losange/cercle (pas le
parallélogramme comme réponse) ; carré incliné ≤ 40° (jamais 45° = indécidable vs
losange), losange à diagonales inégales ; scène ≤ 6 figures, réponse 1–4, monochrome
(la couleur n'est pas un indice) ; propriétés sans inclusion (« un carré est-il un
rectangle ? ») ni double négation. **« Clique sur les rectangles » (multi-sélection)
hors périmètre** (le runner QCM est mono-réponse).

### `src/core/`
- **`utils.ts`** — aléatoire (`rnd`, `choice`, `sample`), déduplication
  (`uniqueComm/Exact`, `commKey`), `escapeHTML`, `fmt` (mm:ss), et `normalizeText`
  (normalisation **partagée** des réponses texte : trim + espaces internes réduits + NFC).
- **`storage.ts`** — `lsGet/lsSet` (clés préfixées par profil), accès bruts
  (`lsKeysRaw/lsRemoveRaw/lsSetRaw`, `appKeys`), `setActivePrefix`, constante
  `PROFILES_KEY`, et `setOnDataWrite(fn)` (hook appelé après chaque écriture de
  donnée de profil — branché depuis `main.ts`).
- **`profiles.ts`** — profils (UUID, préfixe, `updatedAt`), `initProfiles`,
  export/import. ⚠️ Plus d'effet de bord au chargement : `initProfiles()` et le
  branchement du hook sont appelés par `main.ts`.
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
  `pointOnCircle`) et un premier renderer **`renderHorloge(h, m)`** (cadran,
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
  monochrome). `FigureSpec` couvre désormais `horloge | polygoneCote | quadrillage |
  figurePlane | sceneFigures` (à venir : cercle coté #102, solides #103). On compose
  avec les primitives, on ajoute un `renderXxx` (+ variant `FigureSpec` au besoin),
  jamais de SVG « à la main » dans une leçon. Tokens de couleur dédiés
  (`--clock-min`…) ; styles dans `src/styles/figures.scss`.
- **`exercise.ts`** — abstraction d'exercice : type `Exercise`
  (`text` | `qcm` | `tuilesNombre` (numération #98) | `posed` (calcul posé #97 :
  op + opérandes) | interactions ortho), interface **`ExerciseType`** : `modes?`
  (descripteurs **`ModeOption`** `{id, label, hint, icon, recommended}`, dans
  l'ordre d'affichage), `generate(mode?)`, `check()`. Helpers **`hasMode`** et
  **`defaultMode`** (les écrans dérivent leurs choix d'ici, **jamais en dur**, #69),
  et `checkAnswer` (normalisation partagée `normalizeText` ; **accents et
  apostrophes exigés**).
- **`lesson-run.ts`** — **`recordLessonRun()`** : enregistrement d'un essai
  (série, stats par leçon, XP, montée de niveau, étoile, objectif, trophées),
  **commun à tous les rendus** (fiche en saisie *et* runner QCM) pour garantir la
  **parité** entre modes — aucun mode n'est plus rentable qu'un autre (#69).
- **`catalog.ts`** — hiérarchie `SUBJECTS` / `CATEGORIES` / `LessonDef`
  (`id, label, subject, category, level, exerciseType`), helpers
  `getAllLessons/getLessonById/getLessonsBySubject/getLessonsByCategory`,
  `MATH_LESSON_NUM` (pont id→`bilanQ`), et **`genLessonItem(lesson)`** qui produit
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
- **`lessons.ts`** — contenu **maths** : `LESSONS` (15 leçons constructibles
  isolément), `bilanQ` (générateur réutilisé par le catalogue). Côté impression :
  `PrintScope` + **`buildPrintableDOM(scope)`** (contextuel, **multi-matières** via
  `buildLessonFiche`/`bilanBlocksForIds`), `coverHTML(scope)` (garde dynamique),
  pagination 2 fiches/A4. (`buildFiches`/`bilanHTML` historiques conservés.)
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
- **`resume.ts`** — **reprise d'un exercice en cours** (#63), brique **pure** :
  stockage par profil (`ludaskia_resume`) d'instantanés d'exercices **grille**
  (leçon, bilans express/complet/personnalisé) — `loadResumes/getResume/upsert/
  remove/clear`, **clés stables** par identité d'exercice (`leconKey`,
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
- **`unlocks.ts`** — déblocages cosmétiques **dérivés du niveau** (issue #28),
  module **pur** sans stockage ni migration : **rangs** (`RANGS`, `titreDuNiveau`),
  **mascotte évolutive** (`MASCOTTE` à 9 formes œuf→aigle, `mascotteDuNiveau` ; chaque
  forme porte une catégorie `oeuf|oisillon|oiseau` qui pilote l'animation), **avatars
  « forêt »** débloqués par palier (`AVATARS_FORET`, `niveauRequisAvatar`,
  `avatarsForetDebloques` — gamme forêt seule ; la combinaison avec les 12 de base se
  fait dans `profiles.ts` pour éviter un cycle), **thèmes de couleur** (`THEMES`,
  `themesDebloques` — tous clairs, débloqués par palier), et récompenses de palier
  (`recompensesNiveau`, `recompensesEntre` qui agrège un saut de plusieurs niveaux).

### `src/ui/`
- **`chrono.ts`** — chronomètre croissant de la barre (sessions). `startChrono`
  accepte un temps initial + un drapeau de visibilité (reprise : on continue de
  mesurer **sans afficher** un compteur déjà avancé), `getElapsed()` expose le
  temps actif courant (capture d'une reprise).
- **`resume.ts`** — **couche UI de la reprise** (#63) : `captureResume` (lit
  `#sheets` + chrono et sauvegarde l'exercice en cours quand on le quitte),
  `restoreResume` (réinjecte l'instantané **sans régénérer** les calculs, chrono
  repris masqué), `renderReprises` (section **« À continuer »** : barre de
  progression visuelle, **« Continuer »** mis en avant, **« Effacer »** discret
  + confirmation), `maybeRelaunch` (à la relance d'un exercice déjà commencé :
  modale **« Continuer / Recommencer »**), et le **contexte de reprise** posé au
  lancement (`setResumeCtx`) / nettoyé à la fin (`finishResume`).
- **`effects.ts`** — `sparkline` (SVG), `confetti`, modale `showCelebration`, et
  modale dédiée **passage de niveau** `showLevelUp`/`hideLevelUp` (médaillon doré
  animé ; un `then` optionnel enchaîne sur `showCelebration` s'il y a d'autres
  gains).
- **`render.ts`** — rendus accueil/sélecteur/profils (`renderHomeStats` et
  favoris, badge **niveau + barre** dans `renderToolbarProfile`, carte de
  progression `renderProgression` (sa bulle de mascotte porte le **défi du
  jour** : invitation, puis félicitations une fois accompli), `renderObjectives`,
  `renderLessons` + `lessonCardHTML` réutilisable,
  `renderProfileMenu`, `renderProfiles`, `boardHTML`/`sprintBoardHTML`,
  `pctColor`, config `REGULARITY`).
- **`unlocks-view.ts`** — vitrines de déblocages (issue #28) : barre de l'accueil
  (`renderRewardNav` : boutons « Récompenses » / « Trophées » avec compteurs),
  ouverture des **modales dédiées** `openRecompenses` (paliers de niveau : rangs,
  compagnon, avatars, thèmes — acquis ✓ / à venir 🔒) et `openTrophees` (collection,
  sortie de l'inline ; réutilise le rendu `.trophy`), et la **mascotte accompagnante**
  `mascotteBulleHTML(message, loop)` + `encouragementMascotte()` (bulle de BD).
- **`catalog-nav.ts`** — navigation **Matière → Catégorie → Leçons**
  (`renderSubjects`, `renderCategories`, `renderCategorie`) ; l'écran d'une
  catégorie donne accès au bilan express (borné) / complet, au sprint, et à
  « Je choisis mes leçons » (bilan sur mesure scopé à la catégorie).
- **`bilan.ts`** — **bilan personnalisé** : `renderBilanConfigScreen(el, categoryId?)`
  (global, ou scopé à une catégorie via `#bilan-cat-<id>` — liste à plat,
  pensée tablette), choix **bilan / sprint** (#64 : `BilanConfig.mode`, défaut
  `bilan`), choix du nombre de questions par intention (masqué en sprint),
  favoris (`renderFavoris(el, categoryId?)`), exécution (`runBilanConfig`). Le
  mode sprint délègue à `startCustomSprint` (la sélection alimente le tirage).
  Un favori est **rattaché à une catégorie** (#65 : `BilanConfig.categoryId`,
  déduit des leçons cochées via `commonCategoryId` — mono-catégorie, même
  composé depuis l'accueil) : il s'affiche alors aussi sur l'écran de cette
  catégorie (`renderFavoris` filtré), en complément de l'accueil. Multi-catégories
  → accueil seul. Les favoris antérieurs à #65 sont **rattachés par backfill**
  (`bilans.ts:loadBilans` déduit `categoryId` de leurs leçons à la lecture, sans
  réécrire le stockage).
- **`navigation.ts`** — routing par hash (`route`), vues (`showHomeView`,
  `showMatieresView`/`showMatiereView`/`showCategorieView`,
  `showSprintConfigView`, `showBilanCustomView`, `showProfilesView`,
  `runComplet/Express/Lecon/Revision`), `setToolbar`, `afterStart`, état de
  session. **Écran de choix de mode** (#69) : `showModeChoice` (catalogue) /
  `showOrthoModeView` (ortho) — affiché quand une leçon expose plusieurs modes.
- **`lecon-qcm.ts`** — runner **QCM d'une leçon** (#69) : « une question à la
  fois », **feedback immédiat**, barre de progression, **sans chrono** ; enregistre
  via `recordLessonRun` (parité avec la saisie). Réutilise les composants `.sprint-*`.
- **`lecon-tuiles.ts`** — runner **tuiles** d'une leçon de numération (#98) : même
  forme « une question à la fois » que le QCM, mais l'enfant **pose une tuile**
  (signe/nombre) dans l'emplacement par **tap ou glisser-déposer** ; parité
  `recordLessonRun`. Runner d'écran dédié (routé par `runLecon` quand le mode produit
  un `tuilesNombre`) — **n'altère pas** le moteur de tuiles de l'orthographe.
- **`sprint.ts`** — mode sprint 5 min (compte à rebours, questions une par une),
  **filtrable** (toutes matières / une matière / une catégorie / **une sélection
  précise de leçons** via `startCustomSprint`, #64) via un écran de
  configuration ; correction par `checkItemAnswer` (numérique ou texte).
- **`session.ts`** — `verify` (correction + enregistrement), saisie clavier,
  impression contextuelle (#40) : **chemin A** `printAll()` imprime l'écran courant
  vierge (le CSS print met `.ans` en transparent) ; **chemin B** `printScope(scope)`
  pose un périmètre que `beforeprint` rend via `buildPrintableDOM(scope)`. Le 🖨 de
  la barre n'apparaît qu'en exercice (drapeau `print` de `setToolbar`).
- **`menu.ts`** — liste déroulante de profils (`open/close/toggleProfileMenu`),
  extrait pour éviter un cycle `main ↔ navigation`.
- **`preferences.ts`** — préférences cosmétiques **par profil** (issue #28) : thème de
  couleur (`getTheme`/`setTheme`, gating par niveau) et réduction des animations
  (`animationsReduites`/`setAnimationsReduites`). `applyPreferences()` pose
  `<html data-theme>` + la classe `anim-reduced` (appelé dans `route()` → couvre bootstrap
  et bascules de profil) ; `renderPreferences()` rend le bloc de l'écran Profils.

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
`#lecon-<id>` · `#mode-<id>` (choix de mode d'une leçon, #69) · `#sprint-config` ·
`#sprint` · `#bilan-custom` · `#bilan-cat-<id>` · `#ortho-mode-<id>` (choix de mode
d'une liste d'ortho) · `#revision-espacee` · `#profils` · `#revision`
(`#lecons`, ancien sélecteur plat, reste
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

**Choix du sous-exercice / mode depuis une leçon (#69).** Quand un `ExerciseType`
expose **plusieurs modes**, taper la leçon ouvre un **écran de choix** (gros
boutons dérivés de `modes`, le mode `recommended` mis en avant) ; un type
**mono-mode** (maths) se lance directement. **Conjugaison** : *J'écris le verbe*
(saisie, conseillé, fiche imprimable) ou *Je choisis la bonne réponse* (runner QCM
`lecon-qcm.ts`, feedback immédiat, sans chrono). **Orthographe** : le **parcours
complet** (conseillé, **seul à donner l'étoile**) ou un **mode ciblé** (tuiles /
mot caché / dictée) pour s'entraîner — l'entraînement ciblé donne de l'XP mais ne
valide pas (l'étoile reste liée à la suite ordonnée). En **phase de découverte**
(au moins un mot sans atelier), le parcours ne propose **que des ateliers** : toute
la liste est découverte avant le moindre entraînement, et le choix de mode n'est
proposé qu'ensuite. Fin d'exercice : **Recommencer / Quitter** (la pause ortho et
le runner QCM offrent le même choix).

**Reprise d'un exercice en cours (#63).** Les exercices **grille** (leçon, bilans
express/complet/personnalisé) sont **sauvegardés automatiquement** quand on les
quitte (navigation, onglet masqué/fermé, saisie débouncée) et reproposés sur
l'**accueil** (sous la progression) et l'**écran de catégorie** dans une section
**« À continuer »**. Reprendre restaure l'état **exact** (calculs posés, réponses,
temps actif) sans régénérer ; le **chrono repris est masqué** et un exercice repris
**ne compte pas pour le temps**. Une reprise est **propre au profil**, **unique par
identité d'exercice** (relancer demande « Continuer / Recommencer »), et **expire**
en silence après 7 j. Le **sprint** et la **révision espacée** sont hors périmètre
(on **confirme** avant de quitter ces modes, faute de reprise).

### Pipeline multi-matières
Le cœur du moteur est agnostique de la matière. Une `LessonDef` porte un
`ExerciseType` ; `genLessonItem(lesson)` (catalog) produit un `Item` de rendu —
pour les maths via le générateur numérique existant (`bilanQ`), pour les autres
matières en convertissant l'`Exercise` texte. `build.ts` assemble fiches et
bilans à partir de là (les leçons de calcul gardent leur rendu riche : grilles,
décomposition). La **correction** est routée par `checkItemAnswer` selon le type
de l'item : comparaison numérique (virgule tolérée) ou comparaison de chaîne
**normalisée** (`normalizeText` : trim + espaces internes réduits + NFC ; accents et
apostrophes exigés). `verify()` (session) et
le sprint passent tous deux par ce point.

## Données (`localStorage`)
Tout passe par `lsGet/lsSet`. Les clés sont **préfixées par le profil actif**
(`<uuid>/ludaskia_…`) sauf la méta globale `ludaskia_profiles`. Clés par profil :
`ludaskia_runs_{complet,express,sprint}`, `ludaskia_streak`, `ludaskia_stars`,
`ludaskia_lessonStats`, `ludaskia_lessonRevision` (état SR par leçon),
`ludaskia_goal`, `ludaskia_goalsDone`, `ludaskia_trophies`, `ludaskia_xp`,
`ludaskia_bilans` (configs de bilans favoris), `ludaskia_resume` (exercices
grille **en cours**, repris ou abandonnés — #63). L'état SR des **mots**
d'orthographe vit dans `ludaskia_ortho` (`MotOrtho.revision`).
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
  enregistrés (régularité + trophées cumulatifs). **Trophées** = succès cumulatifs,
  présentés dans une **modale dédiée** (bouton de l'accueil), plus une **modale
  « Récompenses »** qui récapitule les paliers de niveau (rangs, compagnon, avatars,
  thèmes) acquis ✓ / à venir 🔒 ; ouvertes depuis l'accueil et l'écran Profils
  (`ui/unlocks-view.ts`).
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
- **Déblocages par niveau** : monter de niveau débloque du **cosmétique** (jamais du
  contenu d'apprentissage). En place : un **rang** (titre + icône Nature, épicène) et
  une **mascotte évolutive** (compagnon œuf→aigle), tous deux dérivés du niveau
  (`core/unlocks.ts`). Le rang s'affiche dans le **badge de la barre** ; rang + mascotte
  vivent dans une **carte « progression »** sur l'accueil, où la mascotte est **animée**
  (entrée + boucle de repos douce selon sa forme, coupée sous `prefers-reduced-motion` ;
  animée uniquement sur cet écran de contemplation, jamais pendant un exercice
  chronométré). La mascotte apparaît aussi comme **accompagnant** (bulle de BD
  d'encouragement) **autour** des exercices — sur les **écrans de résultats** (session,
  sprint, orthographe) et sur l'accueil (où elle annonce le défi du jour) — mais
  **jamais pendant** un calcul chronométré ni en réaction à une erreur. Les déblocages
  d'un palier sont annoncés dans la **modale de niveau** (`showLevelUp`), l'évolution de
  la mascotte y étant mise en avant. Des **avatars
  « forêt »** se débloquent aussi par palier : dans le sélecteur d'avatar (écran Profils),
  les non-débloqués sont grisés « 🔒 Niv X », jaugés au niveau du **profil édité**
  (`getXPFor`) ; `setProfileEmoji` refuse un avatar verrouillé et `resetProfile` rend un
  avatar forêt si l'XP repart à zéro. Des **thèmes de couleur** (tous clairs) se
  débloquent aussi par palier : choisis dans le bloc « Préférences » de l'écran Profils
  (verrouillés grisés), stockés par profil (`ludaskia_theme`), appliqués via
  `<html data-theme>` ; un thème non débloqué retombe sur le défaut. Le même bloc offre
  un réglage **« Réduire les animations »** (`ludaskia_anim`, classe `anim-reduced`), en
  complément de `prefers-reduced-motion`.
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

**Smoke tests e2e (`e2e/`, Playwright, #129).** Complémentaires : ils pilotent
l'app dans un navigateur (profil mobile Chromium) pour couvrir ce que la logique
pure ne voit pas — navigation par hash, rendu d'un exercice, écran d'une
catégorie vide, démarrage du sprint, **absence d'erreur de rendu**
(`watchErrors`). Restent **ciblés et stables** : on teste le contenu présent sur
`main`, pas une leçon en cours de PR. `vitest` est restreint à `tests/` pour ne
pas ramasser les specs Playwright. Détails : `e2e/README.md`.

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
- **mode QCM** : disponible en **conjugaison**, **en sprint et depuis la leçon**
  (#69) via `conjugationType` (mode `qcm`, distracteurs dérivés du paradigme) ;
  piste pour la mémorisation (capitales/dates). *Écarté pour l'orthographe* (risque
  d'ancrage de la faute) ;
- d'autres contenus : maths étendus (conversions d'unités), verbes irréguliers
  anglais ;
- **filtrage par niveau scolaire** (chaque `LessonDef` porte déjà un `level`) ;
- **affiner** la révision espacée : réglage de l'escalier d'intervalles, et
  généralisation (la brique `revision.ts` est déjà agnostique du type d'élément).
- **corrigé imprimable** (page réponses) et **accessibilité/dys** de l'impression
  (police, contraste) — hors périmètre de #40, à explorer.
