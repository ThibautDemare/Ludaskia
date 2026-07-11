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
  (`uniqueComm/Exact`, `commKey`), réordonnancement pur d'un tableau d'index
  (`insertAt`/`removeAt`/`moveAt`, #374 — utilisés par les tuiles d'orthographe
  `ui/ortho-runner.ts`, logique agnostique du DOM), `escapeHTML`, `fmt` (mm:ss), et
  `normalizeText` (normalisation **partagée** des réponses texte : trim + espaces
  internes réduits + NFC).
  **RNG seedable (#41)** : tout l'aléa passe par `randFloat()` (source déroutable) ;
  `withSeed(seed, fn)` la rend déterministe le temps de `fn`, `randomSeed()` tire une
  graine. **Invariant** : les générateurs d'exercices ne doivent JAMAIS appeler
  `Math.random` directement (sinon le corrigé imprimable diverge de la feuille).
- **`storage.ts`** — `lsGet/lsSet` (clés préfixées par profil), lecture d'une clé
  réelle par UUID sans changer de profil actif (`lsGetRaw` — JSON tolérant ;
  `lsGetItemRaw` — chaîne brute sans `JSON.parse`, pour recopier telle quelle une
  valeur lors d'un export), accès bruts (`lsKeysRaw/lsRemoveRaw/lsSetRaw`,
  `appKeys`), `setActivePrefix`, constante `PROFILES_KEY`, et `setOnDataWrite(fn)`
  (hook appelé après chaque écriture de donnée de profil — branché depuis
  `main.ts`).
- **`profiles.ts`** — profils (UUID, préfixe, `updatedAt`), `initProfiles`,
  export/import. La **méta de profil** porte aussi `prefs` (a11y #42, dont
  `sansApparitionsSurprises` #331 — accesseur `apparitionsSurprises()`, vrai par défaut),
  `niveauReference` et `niveauParMatiere` (classe scolaire #225) — champs **additifs**
  (format export `v2` inchangé), emportés par l'export, survivent à « Réinitialiser ».
  `applyActive()` déclenche les migrations idempotentes (`migrateNiveauNamespacing`
  **avant** `migrateRevisions`). ⚠️ Plus d'effet de bord au chargement :
  `initProfiles()` et le branchement du hook sont appelés par `main.ts`.
- **`items.ts`** — item de rendu `{text, answer, answers?, kind?, figure?}` (`@` = champ).
  Fabriques math (`add/sub/mul/dbl/half/comp/facteur`), `renderItem` (champ
  numérique, **texte**, ou **grille posée** selon `kind`), `checkItemAnswer`
  (correction numérique **ou** texte via `normalizeText`), `gridHTML`,
  `ficheHTML`/`ficheHTMLGeneric`, `lessonAttr(ctx)`. Le `kind: 'posed'` (#97) est un
  item « conteneur » (`posed: {op, a, b}`) que **`posedGridHTML`** déploie en grille
  de colonnes — plusieurs champs `.ans` (chiffres de résultat / produits partiels,
  notés un à un) + cellules de retenue `.ans-free`. Le champ **`figure`** (#88) porte
  un fragment SVG (moteur `figures/`) que **`figureBlock`** affiche AU-DESSUS de la
  question ; `renderItem` l'ajoute, et les runners « une question à la fois » (QCM,
  sprint, révision) appellent `figureBlock` au même endroit pour un rendu identique
  partout. **`enonceTexte`** échappe puis enrichit l'énoncé : gras `**…**`, fractions
  empilées (`stackFractions`) et **grands nombres groupés** enveloppés en `.bignum`
  (`wrapGrandsNombres`, #240) — transformations disjointes, sans effet de bord.
  **`RenderContext`** (#352) — interface `{counter, items, lessonId, printMode,
  corrigeMode}` créée par **`createRenderContext(init?)`** : regroupe l'état de rendu
  passé **explicitement** à `renderItem`, `gridHTML`, `posedGridHTML`, `nextInputId`,
  `lessonAttr`. Plus d'état de module implicite dans ce fichier ; le contexte de la
  session interactive vit dans `ui/navigation.ts` (`getRenderCtx`/`setRenderCtx`),
  celui de l'impression est créé localement dans `lessons.ts:buildPrintableDOM`.
- **`figures/`** — **moteur de figures SVG génératives (#88)**, découpé **par
  famille** sous `core/figures/` (#353 ; ex-monolithe `figures.ts`, 1741 lignes) ;
  chaque module reste **PUR** (renvoie une chaîne de balisage, aucun accès DOM).
  L'import public est inchangé (`'…/core/figures'` résout vers `figures/index.ts`).
  - **`primitives.ts`** — bas niveau **partagé par toutes les familles** :
    `svgCanvas` (viewBox carré + `role="img"` + `<title>`/`<desc>` + `aria-label` ;
    `decorative` rend un SVG **décoratif** — `aria-hidden`, sans role/label — quand
    un parent déjà nommé porte le sens, ex. une figure DANS un bouton-choix QCM),
    `line`, `circle`, `ellipse`, `rect`, `polygon`, `polyline`, `text`,
    `pointOnCircle`, `polar`/`r2` (utilitaires géométriques) et
    **`arc(cx, cy, r, deg1, deg2)`** (path d'arc, #202) ; tokens de style
    **réutilisés d'une famille à l'autre** : `SHAPE_FILL` (remplissage des figures
    pleines) et `ANGLE_MARK` (trait de codage d'un angle droit, partagé par
    `angles.ts` et le codage de `polygones.ts`, #326).
  - **`horloge.ts`** — **`renderHorloge(h, m)`** (cadran, graduations, chiffres,
    deux aiguilles distinctes — la petite/heures **proportionnelle aux minutes**).
  - **`polygones.ts`** — figures planes cotées, quadrillage, reconnaissance/codage
    et cercle ; **c'est le socle réutilisable** des figures de « Grandeurs et
    mesures » / « Géométrie ». **`renderPolygoneCote(points, labels)`** (#99 —
    polygone dessiné **à l'échelle** depuis ses sommets, chaque côté coté à
    l'extérieur ; un label vide = côté non coté) et **`renderQuadrillage(cols,
    rows, cells)`** (#99 — figure rectiligne sur grille, **contour surligné** ; le
    helper **`boundaryEdges(cells)`** donne les côtés unitaires du tour, sa
    longueur = le périmètre en côtés de carreaux). Côté géométrie (#100) :
    **`renderFigurePlane(shape, rotation, codage?)`** (figure pleine à
    reconnaître, rotation pour varier l'orientation), **`renderSceneFigures(cells)`**
    (scène de plusieurs figures à compter, grille monochrome) et
    **`renderCercle(segment?, label?)`** (#102 — cercle + centre, rayon ou
    diamètre surligné et coté, ou marqué « ? » pour le vocabulaire). `PlaneShape`
    couvre carré, rectangle, triangle (générique), triangle rectangle, losange,
    cercle, parallélogramme et — **CM1 (#242)** — les **triangles particuliers**
    `triangleEquilateral` / `triangleIsocele` (FRANC, apex ~40°) /
    `triangleQuelconque` (scalène ~3:4:5,5, sans angle droit). Sommets canoniques
    mis à l'échelle de façon **uniforme** (angles et égalités de longueur
    préservés). **Codage des figures (#326, CM1) — opt-in.** Le paramètre
    **`codage`** (défaut `false`) ajoute à la forme le **codage géométrique**
    attendu au CM1 (« coder un angle droit, des longueurs égales ») : **tirets de
    côté égal** (`SHAPE_MARQUES_COTES` → chaque côté marqué porte **1 ou 2**
    tirets `--ink` perpendiculaires à son milieu via `marqueEgal(a, b, tirets)` ;
    1 et 2 distinguent deux familles de longueurs — carré/losange 4 côtés à
    1 tiret, rectangle/parallélogramme longueurs à 1 tiret et largeurs à 2,
    triangles équilatéral/isocèle leurs côtés égaux) et **carrés d'angle droit**
    (`SHAPE_ANGLES_DROITS` → `coinAngleDroit(V, P, N)`, équerre logée dans le coin
    et **orientée le long des côtés adjacents** donc elle **suit la rotation** ;
    carré/rectangle = 4 angles, triangle rectangle = 1). Le marquage est
    **concordant** avec le tracé (côtés réellement égaux, angles réellement
    droits). **Point d'architecture : le codage est `opt-in`**, activé **par la
    donnée de la leçon** (CM1 le passe à `true`, cf.
    `data/maths/geometrie-cm1.ts`) ; le **CE2 partage le même moteur** mais ne le
    demande pas, donc ses figures **restent non codées** (rendu CE2
    gelé/inchangé). Le tracé du **parallélogramme** est calibré CM1 (#242) : côté
    oblique incliné ~28° de la verticale, ratio longueur/largeur ~1,9 (rectangle
    penché allongé).
  - **`solides.ts`** — **`renderSolide(solid, orient?)`** (#103 — schéma d'un
    solide en **perspective cavalière sans arêtes cachées** : cube, pavé droit,
    cylindre, cône, pyramide, boule ; + **CM1 (#242)** le **prisme** droit à base
    triangulaire — face triangulaire pleine + arêtes de fuite, même style ;
    primitive `ellipse` ajoutée).
  - **`fractions.ts`** — renderers de fractions (barre, bande, paire, somme,
    collection groupée, #200) consommés par les leçons de numération/fractions ;
    + **CM1 (#249)** — **`renderFractionSuperieure`** (fraction ≥ 1 en « aire
    itérée » : barres pleines empilées, une par unité entière, surmontées de la
    barre partielle du reste) et **`renderFractionDemiDroite`** (demi-droite
    graduée 0→N, statut de nombre). Les deux tracés d'axe (bande CE2 0→1 et
    demi-droite CM1 0→N) partagent désormais un traceur interne unique
    (`dessinerAxeGradue`) ; le rendu CE2 (`unites = 1`) est inchangé.
  - **`decimaux.ts`** — **`renderGrilleCentiemes(parts)`** (#247 — grille 10×10 des
    centièmes : `parts` cases coloriées **contiguës, ligne par ligne** depuis le
    haut-gauche (1 ligne pleine = 1 dixième) ; maillage des centièmes, séparateurs de
    dixièmes plus marqués, cadre = l'unité, et **frontière `--accent`** entre zone
    coloriée et vide — une FORME, pas la seule couleur, SC 1.4.1 ; le `<desc>` décrit la
    structure, jamais le compte). Sans classe CSS dédiée (viewBox ~236, tient dans
    `.figure-svg`).
  - **`symetrie.ts`** — **`renderSymJuger`**, **`renderSymMiroir(motif, axis)`** /
    **`renderSymImage(motif, axis, t)`** (#201 — symétrie axiale : figure devant
    un miroir, et scène-choix « figure + miroir + image » où l'image est un
    reflet/glissé/tourné ; reflet par réflexion exacte des points).
  - **`angles.ts`** — **`renderAngle(opening, bisector)`** (#202 — deux
    demi-droites depuis un sommet net : un **arc** matérialise l'ouverture d'un
    aigu/obtus, le **carré de codage** marque l'angle droit (jamais les deux),
    orientation variée par la bissectrice ; **aucune mesure affichée** et
    invariant « 90° ⇒ carré » garanti par `opening === 90`).
  - **`groupes.ts`** — **`renderGroupes(paniers, total)`** (#104 — division par le
    sens : `total` jetons en vrac + `paniers` contenants **vides** ; montre la
    SITUATION, jamais le résultat → l'enfant calcule, il ne compte pas une réponse
    déjà posée).
  - **`index.ts`** — point d'entrée : réexporte les primitives publiques et
    toutes les familles, et porte le dispatch par données **`FigureSpec`**
    (union `horloge | polygoneCote | quadrillage | figurePlane | sceneFigures |
    cercle | solide | groupes | fraction* | grilleCentiemes | symJuger | symMiroir |
    symImage | angle` — le variant `figurePlane` porte le `codage?` ci-dessus —
    **point d'extension**) / **`renderFigure(spec)`**.

  On compose avec les primitives, on ajoute un `renderXxx` dans le module de sa
  famille (+ variant `FigureSpec` au besoin), jamais de SVG « à la main » dans
  une leçon. Tokens de couleur dédiés (`--clock-min`…) ; styles dans
  `src/styles/figures.scss`.
- **`exercise.ts`** — abstraction d'exercice : type `Exercise`
  (`text` | `qcm` | `tuilesNombre` (numération #98) | `tuilesOrdre` (ordre
  alphabétique #108 : suite mélangée + suite triée) | `tuilesTri` (champs
  lexicaux #114 : tuiles + thème correct de chacune) | `posed` (calcul posé #97 :
  op + opérandes) | interactions ortho), interface **`ExerciseType`** : `modes?`
  (descripteurs **`ModeOption`** `{id, label, hint, icon, recommended}`, dans
  l'ordre d'affichage), `generate(opts? : {mode?, level?})` (le `level` #225 calibre
  une leçon multi-niveaux), `check()`, et **`exerciseKind?`** (#348, type
  `ExerciseKind = 'posed' | 'tuilesOrdre' | 'tuilesTri' | 'probleme'`) — étiquette
  **déclarative statique** portée par les fabriques à runner dédié ; permet aux
  helpers `isPosedLesson` / `isOrderingLesson` / `isTriLesson` / `isProblemeLesson`
  de classer une leçon **sans appeler `generate()`** (supprime tout appel à l'aléatoire
  global au moment du filtrage). Absent = format standard (texte/QCM) éligible au sprint.
  Helpers **`hasMode`** et **`defaultMode`** (les écrans dérivent leurs choix d'ici,
  **jamais en dur**, #69), et `checkAnswer` (normalisation partagée `normalizeText` ;
  **accents et apostrophes exigés**). Le type `text` porte un champ optionnel **`intervalle`**
  (#240, intercalation CM1 « grands nombres ») : quand il est présent, la correction
  accepte **toute valeur strictement comprise** entre les deux bornes (et non plus la
  seule `answer`) ; absent (cas CE2), comportement de réponse unique **inchangé** — la
  donnée de l'exercice porte ainsi la règle, le `check` partagé (via `calibrated`,
  pris sur le plus bas niveau) reste unique.
- **`check-helpers.ts`** (#346) — helpers de correction **réutilisables**, module **pur**
  (sans DOM). Centralise la logique jusqu'ici recopiée dans une dizaine de fabriques
  `src/data/maths/` (cercle, division, fractions, géométrie, géométrie-cm1, mesures,
  monnaie, périmètre, position, solides). Deux exports :
  **`checkNumerique(exercise, input)`** compare la saisie à `answer` comme des nombres
  via **`parseNombreFr`** (`nombres.ts` : tolère la virgule décimale française et les
  espaces de groupement) appliqué **symétriquement des deux côtés** — saisie ET
  `answer` — ce qui valide aussi bien une réponse stockée en virgule (conversions
  décimales CM1 `mesures.ts`, « 4,56 », #248) qu'une saisie groupée ; faux si
  l'exercice n'a pas de réponse unique ou si la saisie n'est pas un nombre.
  **`checkNumeriqueOuTexte(exercise, input)`** est numérique quand
  `answer` est un entier (côtés, angles, comptages), sinon délègue à `checkAnswer`
  (`exercise.ts`) pour la correction texte normalisée — couvre les leçons de géométrie
  dont la réponse est tantôt un nombre, tantôt un nom. `numeration.ts` conserve son check
  intervalle/signe propre (#240, hors scope).
- **`fraction-text.ts`** (#42/#200, #249) — module **pur** : libellé verbal d'une
  fraction (**`nomFraction`** : « trois quarts » ; numérateurs impropres > 9 dits en
  toutes lettres via `nombreEnMots`, #249 — « vingt-sept cinquièmes », jamais « 27
  cinquièmes ») et **rendu typographique empilé** (barre horizontale, numérateur
  au-dessus) via `mathInline`. **`nomDenominateur(den, pluriel)`** (nom seul :
  « demi », « cinquièmes »…) est exporté séparément et réutilisé par le libellé TTS
  de la décomposition (#249, `data/maths/fractions.ts`). La donnée garde la clé
  plate « num/den » ; ce module la transforme en affichage au rendu (l'oblique
  « 6/8 » se confondrait avec une division — avis pédagogue).
- **`nombres.ts`** (#240) — module **pur** : formatage UNIQUE des grands nombres
  (numération CM1 « millions »). **`formatNombre(n)`** groupe les chiffres par classes de
  3 avec une **espace fine insécable U+202F** (via `Intl.NumberFormat('fr-FR')`) — JAMAIS
  de virgule (séparateur décimal en français) — mais **seulement à partir de 5 chiffres
  (≥ 10 000)** : en deçà (≤ 9 999, plage CE2), le nombre reste sans séparateur, l'affichage
  CE2 est inchangé. **`nettoyerSaisieNombre`** retire tous les
  espaces d'une saisie (normal, U+202F, U+00A0) **sans** toucher la virgule : un enfant qui
  recopie « 1 002 050 » n'est pas pénalisé. **`parseNombreFr(valeur)`** (#248) enchaîne
  `nettoyerSaisieNombre` puis convertit la virgule décimale en point avant `Number(...)` —
  utilisée **symétriquement** sur la saisie ET sur la réponse stockée par
  `checkNumerique`/`checkItemAnswer` (cf. `check-helpers.ts` ci-dessus), pour valider une
  réponse stockée en écriture à virgule (conversions décimales CM1 `mesures.ts`, « 4,56 »)
  sans jamais passer par un `Number("4,56")` qui vaudrait `NaN`. **`wrapGrandsNombres(escaped)`** enveloppe les
  nombres groupés (≥ 10 000) d'un texte **déjà échappé** dans `<span class="bignum">` (rendu
  identique partout : `tabular-nums`, `nowrap`, `clamp` — cf. `styles/lessons.scss`) ;
  appelé par `items.ts → enonceTexte`, donc partagé par tous les rendus (fiche, sprint,
  révision, impression). **`grouperChiffresSaisis(chiffres)`** (#327) groupe une **chaîne de
  chiffres bruts** par classes de 3 depuis la droite (U+202F, même seuil ≥ 5 chiffres que
  `formatNombre`) sans passer par `Number` — pour l'**écho de saisie à la frappe** des grands
  nombres (`ui/grand-nombre-echo.ts`) : restitue exactement les chiffres tapés (zéros de tête
  compris) en n'insérant que des séparateurs. On n'écrit jamais le caractère U+202F en clair dans
  le source (échappements `U+202F`/`U+00A0`). Réutilisé par `data/maths/numeration.ts` et
  `position.ts`. **`nombreEnMots(n)`** (#249) écrit un entier de 0 à 99 en toutes
  lettres (conventions FR scolaires : « et » à 21/31…/51/61/71, traits d'union
  ailleurs, « quatre-vingts » invariable) — repli sur les chiffres au-delà de 99
  (jamais atteint en pratique, les numérateurs de fractions plafonnent à ~69) ; sert
  `fraction-text.ts` pour les numérateurs impropres > 9.
- **`signes.ts`** (#380) — module **pur** : signes de comparaison `< = >`
  (`SIGNES_COMPARAISON`, type `SigneComparaison`), **`estSigneComparaison(answer)`** (une
  réponse texte est-elle un signe ? — aiguille `items.ts` et `ui/sprint.ts`),
  **`signeView(signe)`** (vue riche glyphe + mot-légende, mêmes classes `lqcm-sym-*` que
  les boutons-symboles de ponctuation #204 — un seul langage visuel « symbole ambigu »)
  et **`paveSignesHTML(forId)`** (pavé de 3 boutons `.pave-signe`, ordre FIGÉ « < = > »,
  `screen-only`, jamais imprimé). `items.ts` (`renderItem`) pose un champ dédié
  **`.ans-signe`** (`inputmode="none"` : pas de clavier virtuel, la frappe au clavier
  physique reste possible) suivi du pavé quand la réponse d'un item texte est un signe ;
  ni l'un ni l'autre à l'impression/corrigé. `ui/sprint.ts` consomme
  `SIGNES_COMPARAISON`/`signeView` directement pour poser ces questions en **QCM à 3
  choix** (tap direct) plutôt qu'en champ texte — le clavier virtuel n'expose pas ces
  signes, et sous chrono un QCM valide plus vite qu'une saisie. Le comportement du pavé
  (clic → remplissage, synchro `aria-pressed`) vit dans `ui/pave-signes.ts`.
- **`aide.ts`** (#272) — **aide contextuelle** des runners à interaction non intuitive,
  module **pur** : porte le **contenu** des aides (`AIDES` : titre + étapes courtes ≤ 3 +
  voie alternative + filet anti-erreur) pour 5 types (`tuiles`, `ordre`, `tri`, `atelier`,
  `lettres`) et la **mémoire « aide déjà vue »** par profil (`ludaskia_aide_vue`, via
  `lsGet/lsSet`). Le rendu vit dans `ui/aide-exercice.ts`.
- **`tour.ts`** (#330) — **guide de première visite**, module **pur** (aucun accès DOM) :
  porte le **contenu** du tour enfant (`TOUR_ETAPES` : 3 grands repères de l'accueil —
  `.cards` / `#progression` / `#rewardNav` — chacun `{cible, titre, texte}`, ton
  « invitation » du registre des aides) et le **texte TTS par étape** (`texteTtsEtape`),
  plus la **mémoire « déjà vu » par profil** via `lsGet/lsSet` — **deux drapeaux booléens
  indépendants** sous clés préfixées profil : `ludaskia_tour_seen` (tour enfant,
  `tourVu`/`marquerTourVu`) et `ludaskia_parents_seen` (mot aux parents,
  `motParentsVu`/`marquerMotParentsVu`). Le rendu (encart mascotte, surlignage, mot aux
  parents, orchestration) vit dans `ui/tour.ts`.
- **`icon-names.ts`** — type **pur** `IconName` : noms **sémantiques** (rôle, pas dessin)
  des icônes Phosphor, pour que les modules `core/`/données typent leur champ `icon` sans
  dépendre du rendu. L'association nom → SVG est dans `ui/icon.ts`.
- **`scoring.ts`** (#349) — correction **pure** d'une feuille de réponses, **sans DOM**.
  `scoreItems(inputs: ScoredInput[]): ScoreResult` corrige une liste de champs déjà réduits
  à leurs données (id, `Item | null`, saisie normalisée, leçon), et renvoie :
  `ok`/`total`/`vides` (champs non remplis, non comptés dans `total` mais envoyés en
  révision), `errors` (items faux ou vides, pour la révision), `perLesson` (agrégat par
  leçon `id → {ok, total}`, pour les stats), et `statuses` (`Record<id, ItemStatus>` —
  `'correct'|'wrong'|'empty'` — pour le marquage DOM par l'appelant). `ui/session.ts`
  (`verify()`) lit le DOM, construit la liste `ScoredInput`, délègue à `scoreItems`, puis
  pose les marques ✓/✗ selon les `statuses` renvoyés.

## Enregistrement, catalogue & ordre pédagogique

- **`lesson-run.ts`** — **`recordLessonRun()`** : enregistrement d'un essai
  (série, stats par leçon, XP, montée de niveau, étoile, objectif, trophées),
  **commun à tous les rendus** (fiche en saisie *et* runner QCM) pour garantir la
  **parité** entre modes — aucun mode n'est plus rentable qu'un autre (#69).
- **`catalog.ts`** — hiérarchie `SUBJECTS` / `CATEGORIES` / `LessonDef`
  (`id, label, subject, category, levels: SchoolLevel[], exerciseType` — #225). La
  plupart des familles de leçons passent par **`toLessonDefs(inputs, opts)`** (#373) :
  fabrique qui mappe une liste `LessonInput` (#347, cf. [Contenu & leçons](contenu-et-lecons.md))
  en `LessonDef[]` — `opts.subject`/`category` fixes, et `levels`/`rubrique`/
  `excludeFromSprint`/`repere` optionnels, chacun soit une valeur fixe soit une fonction
  `(input) => valeur` quand il dérive de la donnée ; un champ résolu à `undefined` est
  omis. Seule la conjugaison (`FRENCH_LESSONS`) reste hors du helper : son `exerciseType`
  est **calculé** (`conjugationType(verbId, tense)`), pas porté par l'entrée, donc son
  descripteur n'est pas un `LessonInput`. Helpers
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
  vierge puis réponses révélées — sur les MÊMES items (graine commune via `withSeed`),
  avec `corrigeCoverHTML` en intercalaire. Chaque passe crée un `RenderContext` frais
  (`createRenderContext({ printMode: true, corrigeMode: <bool> })`) ; `printMode` et
  `corrigeMode` sont des champs du contexte, pas un état de module (#352).
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
  La composition de la session est **équilibrée par SOURCE** (`categoryId`) via
  `selectionEquilibree` (#45) : une « source » = une catégorie de leçon (maths,
  conjugaison…) ou l'orthographe entière (tous les mots confondus). **Phase 1
  (vidage)** : jusqu'à `REVISION_MAX_VIDAGES_SOURCES` (= 2) petites sources
  (≤ `REVISION_SEUIL_SOURCE_VIDABLE` = 4 éléments dus) sont prises intégralement,
  les plus en retard d'abord — pour permettre de « finir » une petite leçon en un
  jet. **Phase 2 (round-robin)** : les slots restants sont répartis à tour de rôle
  entre les sources restantes (grosses + petites non vidées), chacune cédant son
  item le plus en retard. Le plafond de vidage (2 sources) garantit qu'il reste
  toujours des slots pour le round-robin → aucune source ne peut affamer les
  autres. `countDue` et l'affichage de l'accueil restent sur le total non plafonné.
- **`revision-migrate.ts`** — **reprise** de l'historique vers la révision : à
  l'activation d'un profil (`applyActive`), les leçons déjà notées et les mots
  déjà en banque sans état SR entrent en rotation, **datés J-1** → dus dès le jour
  même (`migrateRevisions` ; backfills idempotents dans `progress.ts` /
  `orthographe/store.ts`). Rattrape l'activité antérieure à #45.

## Progression, gamification & déblocages

- **`maitrise.ts`** (#397) — socle **pur** (sans stockage) de l'échelle de maîtrise d'une
  notion (type LSU) : forme `LessonStat`, `lessonAvgPct` (moyenne cumulée) /
  `recentAvgPct` (perf **récente**, fenêtre glissante `recentPct` bornée par
  `RECENT_MAX`), seuils d'acquisition (`SEUIL_NON_ACQUIS`/`SEUIL_REVOIR`) et de tendance
  (`TENDANCE_MIN_ESSAIS`/`TENDANCE_SEUIL`), `niveauNotion`/`tendanceNotion`. Extrait de
  `progress.ts`/`encadrant-stats.ts` pour **casser le cycle d'import** entre les deux : ce
  module ne dépend d'aucun autre module de l'app. `progress.ts` (écriture) et
  `encadrant-stats.ts` (lecture) le réexportent pour les imports historiques.
- **`progress.ts`** — records de bilans **scopés par niveau** (`recordRun` → `RunResult`
  `{rank, total, medal, isRecord}`,
  `cmpRun` « score puis temps », `loadRuns` = niveau actif / `loadRunsAll` = tous
  niveaux pour l'effort — #233), série (`updateStreak`, `streakSuffix`), étoiles
  (`recordLessonResult`, `starsEarned`), stats par leçon (`recordLessonStats` ; l'échelle
  de maîtrise `lessonAvgPct`/`recentAvgPct`/`niveauNotion` vit désormais dans
  `maitrise.ts`, réexportée ici), **journal daté des paliers franchis** (`ludaskia_paliers`,
  `PaliersNotion {enCours?, acquis?}`, namespacée `lessonId@niveau` — `recordMonteesPalier
  (lessonIds, now)`, #397) : marque le **premier** franchissement vers « en cours » puis
  « acquis » par notion — modèle **monotone** (2 horodatages max, structure bornée par le
  catalogue, pas de rétention à gérer) ; appelé **après** l'écriture de l'étoile, en fin de
  session, par `lesson-run.ts:recordLessonRun` et le sprint (`ui/sprint.ts`) — source de la
  frise d'évolution de l'espace encadrant (cf. [Espace encadrant](espace-encadrant.md)).
  **Journal d'activité** (`ludaskia_activity`, `loadActivity` — une session finalisée,
  #234 ; **entrées typées** `ActivityEntry = {t, k}` avec
  `ActivityKind = 'lecon' | 'bilan' | 'sprint' | 'revision' | 'dictee'` (+ `'inconnu'`
  pour l'ancien format), #319). `recordLessonStats(perLesson, kind = 'lecon')` journalise
  les leçons/bilans/sprints ; les sessions qui **ne passent pas** par `recordLessonStats`
  (révision espacée `ui/revision.ts`, dictée d'orthographe `ui/ortho-runner.ts`) appellent
  **`recordSessionActivity(kind)`**. `normalizeActivity` lit **tolérant** l'ancien `number[]`
  (chaque horodatage nu → `'inconnu'`) et le réécrit au format objet au prochain passage
  (migration **lazy, sans perte**). **XP global** (`getXP`/`addXP`, `ludaskia_xp`)
  et **niveaux dérivés** (`niveauDepuisXP`, `progressionNiveau`, `xpVersSuivant`,
  `xpPourNiveau`, `NIVEAU_MAX`), périodes calendaires (`startOfWeek/Month`,
  `countSince`).
- **`rewards.ts`** — défi du jour contextuel (`CHALLENGES`, `getGoal` → `Goal`
  `{date, target, progress, done, type, label, lesson?}`, `updateGoal(ev: GoalEvent)`)
  et trophées (`TROPHIES`, `tiers()`, `evaluateTrophies`,
  `gSnapshot` — type exporté `GSnapshot`), dont des groupes **par matière** et **par
  catégorie** générés depuis le catalogue.
- **`eggs.ts`** (#331) — **easter eggs**, module **PUR** (aucun accès DOM, testable
  comme `unlocks.ts`) : catalogue déclaratif `EGGS` (4 eggs v1, familles `EggFamily` =
  `exploration` / `ambient` / **`visible`** — ce dernier (#336) = déclencheur OUVERT et
  assumé, p. ex. l'icône cookie du pied de page ; `getEgg`), **album** des trouvailles
  persisté par profil (clé **dédiée**
  `ludaskia_eggs`, **disjointe** de l'XP/étoiles/trophées) — `markEggFound` **idempotent**
  (renvoie `true` à la 1re découverte), `foundEggIds`/`foundEggs` (ordre de découverte,
  **filtrent les ids orphelins** d'un egg retiré du catalogue), `hasFoundEgg` —, et la
  **décision d'apparition ambiante** `decideAmbient(ambientSince, roll)` (fonction **pure**,
  `roll` injecté → aucun `Math.random` dans `core`, conforme #41) : **plancher** anti-malchance
  (`AMBIENT_PITY`, apparition forcée au plus tard) + **cooldown** (`AMBIENT_MIN_GAP`, anti-spam) +
  tirage `AMBIENT_CHANCE` entre les deux. **Strictement hors économie de jeu** (aucune XP /
  étoile / graine) — cf. [Gamification](gamification.md). Rendu et déclencheurs : `ui/eggs.ts`.
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
  bascule** (`progressionProfil`, `niveauProfilMatiere`) ; réexporte l'échelle de maîtrise
  (`niveauNotion`/`tendanceNotion`, définie dans `maitrise.ts`) pour les imports
  historiques, **activité** et **file « à revoir »** (`loadRevoir`/`loadRevoirFor`/
  `toggleRevoirFor`/`revoirActives`). Lit les clés brutes du profil consulté. Le graphe
  d'activité (#319) repose sur **`activiteParJourParType(activity, now, n)`** → `JourActivite[]`
  (`{total, lecon, bilan, sprint, revision, dictee, inconnu}`, index `n-1` = aujourd'hui ; `normalizeActivity`
  y est l'**unique frontière de normalisation** de l'ancien/nouveau format) ; `activiteParJour`
  en est **dérivé** (totaux seuls) et `echelleActivite(max)` calcule une échelle Y « ronde »
  (`{top, step, ticks}`). `RecapProfil.activite7j` est désormais un `JourActivite[]`.
  **Frise d'évolution par matière** (#397) : `frisesParMatiere(paliersRaw, profile, now)`
  → `FriseMatiere[]` (`{subject, label, semaines: number[], total}`) compte, par semaine et
  par matière, les notions **distinctes** ayant franchi un cap sur le journal
  `ludaskia_paliers` ; fenêtre de **12 semaines** (`SEMAINES_FRISE`), matière masquée tant
  que son premier franchissement a moins de **3 semaines** de recul
  (`PALIERS_MIN_SEMAINES`). Exposée dans `RecapProfil.frises`.
- **`encadrant-lock.ts`** (#234) — verrou optionnel de l'espace encadrant : PIN haché
  (SHA-256 `crypto.subtle`) + récupération par secret (GUID) ; clé GLOBALE
  `ludaskia_encadrant_lock` (`pinActif`/`definirPin`/`verifierPin`/`reinitViaRecuperation`/
  `desactiverPin`).
