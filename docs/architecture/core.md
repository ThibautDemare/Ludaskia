[← Architecture Ludaskia](../ARCHITECTURE.md)

# Logique pure (`src/core/`)

Modules **testables sans DOM** (aucun accès DOM au chargement). Regroupés ici par
thème ; le détail du dossier `src/data/` est dans [Contenu & leçons](contenu-et-lecons.md),
et les modules `levels.ts` / `level-combinators.ts` / `niveau-actif.ts` dans
[Niveaux scolaires](niveaux-scolaires.md). Le **moteur d'orthographe**
(`core/orthographe/` : `store`, `exercise`, `lessons`, `diff`, `types`, `entourages`
— bascule et couleur des entourages de l'atelier du mot —, verbes, `banque` —
projection de la banque d'un profil pour l'espace encadrant, #496, cf. [Espace
encadrant](espace-encadrant.md)) a sa propre
doc de conception : `docs/design-orthographe.md` (§ Atelier du mot pour
`entourages`).

## Fondations

- **`utils.ts`** — aléatoire (`rnd`, `choice`, `sample`, **`melangerDifferemment`** —
  mélange garanti **différent** de la suite d'origine, partagé par les rangements de
  suites #108/#448 : un exercice « déjà rangé » n'aurait aucun intérêt), déduplication
  (`uniqueComm/Exact`, `commKey`), réordonnancement pur d'un tableau d'index
  (`insertAt`/`removeAt`/`moveAt`, #374 — utilisés par les tuiles d'orthographe
  `ui/ortho-runner.ts`, logique agnostique du DOM), **`escapeHTML`** — les **cinq**
  caractères qui changent le sens du markup (`& < > " '`), donc bon en contenu comme en
  **valeur d'attribut**, où un `"` refermerait l'attribut et laisserait en écrire de
  nouveaux sans avoir besoin d'un `<` ; c'est le **seul** échappement du projet, les copies
  locales partielles (`tts-text.ts`, `items.ts`) ont été supprimées et rien ne justifie d'en
  réécrire une —, `fmt` (mm:ss), et
  `normalizeText` (normalisation **partagée** des réponses texte : trim + espaces
  internes réduits + NFC). **`cleRecherche(s)`** (#496, partagée #556) — clé de recherche
  d'un texte libre **insensible casse/accents** (minuscules, ligatures dépliées,
  diacritiques retirés) — DISTINCTE de `normalizeText`, qui sert la **correction** et doit,
  elle, exiger les accents : partagée par la banque de mots d'orthographe
  (`core/orthographe/banque.ts`, cf. [Espace encadrant](espace-encadrant.md)) et par l'arbre
  de sélection de leçon de l'espace encadrant (`core/catalogue-arbre.ts`, #556, ci-dessous).
  **`startOfDay(ts)`** — début du jour LOCAL (via `setHours`,
  robuste au changement d'heure) — est le socle **unique** de tout raisonnement en
  jours calendaires de l'app : consommé par `progress.ts` (`startOfWeek`),
  `encadrant-stats.ts` (délai avant échéance, jalons), `ui/render.ts` (`quandRevision`)
  et le filtre de période du journal d'erreurs (`erreurs-journal.ts`, cf. [Espace
  encadrant](espace-encadrant.md)). **`debutJourLocal(ts, joursAvant)`** — début du jour LOCAL,
  `joursAvant` jours plus tôt (borne basse INCLUSIVE d'une fenêtre « N derniers jours ») —
  remontée ici depuis `erreurs-journal.ts` (#520), qui en portait jusque-là une copie privée :
  son filtre de période et la fenêtre de `travailRecent` (`encadrant-stats.ts`, cf. [Espace
  encadrant](espace-encadrant.md)) partagent désormais la MÊME définition du jour calendaire
  local.
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
  **Toute clé doit commencer par `ludaskia_`** — pas une préférence de nommage : c'est
  le filtre d'`appKeys()`, donc ce qui décide qu'une donnée entre dans l'export de
  sauvegarde du parent et disparaît avec le profil supprimé. Une clé hors convention
  fonctionne parfaitement à l'usage, ce qui rend l'oubli invisible ; d'où le gate
  `tests/cles-stockage-gate.test.ts` (#597), cf. [Tests](tests.md).
- **`profiles.ts`** — profils (UUID, préfixe, `updatedAt`), `initProfiles`,
  export/import. La **méta de profil** porte aussi `prefs` (a11y #42, dont
  `sansApparitionsSurprises` #331 — accesseur `apparitionsSurprises()`, vrai par défaut,
  et `revisionPlafond` #439 — accesseur **`getRevisionPlafond()`**, qui applique le
  fallback (`REVISION_PLAFOND`, 12) ET le bornage `[REVISION_PLAFOND_MIN,
  REVISION_PLAFOND_MAX]` **à la lecture**, jamais à l'écriture, pour rester robuste aux
  données importées), `niveauReference` et `niveauParMatiere` (classe scolaire #225) —
  champs **additifs** (format export `v2` inchangé), emportés par l'export, survivent à
  « Réinitialiser ».
  `applyActive()` déclenche les migrations idempotentes (`migrateNiveauNamespacing`
  **avant** `migrateRevisions`). ⚠️ Plus d'effet de bord au chargement :
  `initProfiles()` et le branchement du hook sont appelés par `main.ts`.
- **`items.ts`** — item de rendu `{text, answer, answers?, kind?, figure?}` (`@` = champ).
  Fabriques math (`add/sub/mul/dbl/half/comp/facteur`), `renderItem` (champ
  numérique, **texte**, ou **grille posée** selon `kind`), `checkItemAnswer`
  (correction numérique **ou** texte via `normalizeText`), `gridHTML`,
  `ficheHTML`/`ficheHTMLGeneric`, `lessonAttr(ctx)`.
  **`itemEstNumerique(it)`** — source UNIQUE de « cet item se corrige-t-il
  numériquement ? » (`!!it.intervalle` ou `kind` hors `'text'`/`'heure'`) —
  partagée par `checkItemAnswer` (quelle branche de comparaison) et par les
  runners `ui/sprint.ts`/`ui/session.ts`, qui s'en servent, combinée à
  **`saisieEstNombre`** (`nombres.ts` ci-dessous), pour **refuser** — sans la
  compter fausse — une saisie qui n'est pas un nombre là où un nombre est
  attendu (cf. [Rendu & interactions](ui.md) pour le comportement côté écran).
  **`nomChampReponse(it)` / `ariaChamp(it, role?)`** (#577) — nom accessible du champ,
  posé en `aria-label` par **toute** branche de `renderItem` qui rend un `<input>`.
  Sans lui, un lecteur d'écran annonçait « zone de saisie » six fois de suite sur une
  fiche de conjugaison, sans jamais dire la personne. Le nom est dérivé de
  **`texteParle`** (`tts-text.ts`) appliqué à `parle ?? text` — donc le MÊME énoncé que
  celui du bouton « Écouter », jamais un libellé écrit à la main par leçon (qui
  divergerait). `role` ajoute, APRÈS l'énoncé, le format attendu quand le champ n'accepte
  pas n'importe quoi (« signe de comparaison », « chiffre manquant »). Deux exceptions
  assumées : les champs d'heure gardent « heures »/« minutes » (le nom doit y distinguer
  les deux champs entre eux, et ce qui change d'une horloge à l'autre est dans le dessin),
  et les cellules d'une grille posée gardent « chiffre du résultat » / « retenue ». Gate :
  `tests/champs-libelles.test.ts` balaie tout le catalogue et échoue en nommant la leçon.
  Le `kind: 'posed'` (#97) est un
  item « conteneur » (`posed: {op, a, b}`) que **`posedGridHTML`** déploie en grille
  de colonnes — plusieurs champs `.ans` (chiffres de résultat / produits partiels,
  notés un à un) + cellules de retenue `.ans-free`. Un champ optionnel
  **`posedResult`** (#391, `{groupe, operation, attendue, pos}`) tague les seules
  cellules du RÉSULTAT (pas les retenues ni les produits partiels) : `posedGridHTML`
  y pose un `groupe` stable (id de grille dérivé du compteur de rendu) que le journal
  d'erreurs (`ui/session.ts`) regroupe en **une** entrée par opération plutôt qu'une
  par chiffre (cf. `erreur-representation.ts` ci-dessous). **Disposition extraite**
  (#490) : `dispositionPosee(spec)` calcule cette grille par RÔLE de cellule
  (`CellulePosee`/`RangeePosee`/`DispositionPosee`, sans une ligne de HTML) et
  **`poseeGrilleHTML`** l'enveloppe — factorisation qui permet au panneau d'étayage
  de rendre une grille de DÉMONSTRATION rigoureusement alignée sur la grille jouable
  (cf. « Étayage de la notion » plus bas). `poseeGrilleHTML` pose aussi, sur la
  grille jouable, les attributs `data-pose-op/a/b` : c'est par eux que l'étayage
  d'une erreur retrouve l'opération que l'enfant vient de rater, sans alourdir
  chaque cellule d'une copie de l'opération. Le champ **`figure`** (#88) porte
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
    rows, cells, mode?, opts?)`** (#99/#253 — figure rectiligne sur grille ; le
    helper **`boundaryEdges(cells)`** donne les côtés unitaires du tour, sa
    longueur = le périmètre en côtés de carreaux). **Deux modes de dessin**
    (grammaire visuelle) : `perimetre` (défaut, CE2 — **contour corail** épais,
    grille interne masquée sous le remplissage → compter des CÔTÉS) et `aire`
    (#253, CM1 — cases teintées **avec la grille interne visible par-dessus** et
    contour d'accent → compter des CARREAUX). **`renderQuadrillagePaire(a, b,
    mode?, labels?)`** (#253) dessine **deux figures à comparer** côte à côte
    (aire ↔ périmètre), étiquetées A/B, à **taille de case commune** (SVG à taille
    intrinsèque via `svgCanvas(..., intrinsic)` — une 6×6 paraît plus grande qu'une
    3×3, plafonnée en CSS `.quad-pair-item`). Côté géométrie (#100) :
    **`renderFigurePlane(shape, rotation, codage?, parallelisme?)`** (figure pleine à
    reconnaître, rotation pour varier l'orientation), **`renderSceneFigures(cells)`**
    (scène de plusieurs figures à compter, grille monochrome) et
    **`renderCercle(segment?, label?)`** (#102 — cercle + centre, rayon ou
    diamètre surligné et coté, ou marqué « ? » pour le vocabulaire). `PlaneShape`
    couvre carré, rectangle, triangle (générique), triangle rectangle, losange,
    cercle, parallélogramme et — **CM1 (#242)** — les **triangles particuliers**
    `triangleEquilateral` / `triangleIsocele` (FRANC, apex ~40°) /
    `triangleQuelconque` (scalène ~3:4:5,5, sans angle droit), plus — **CM1 (#253)** —
    le **`quadrilatereQuelconque`** (4 côtés irréguliers, aucun angle droit / côté
    égal / côté parallèle → aucune marque ; contre-exemple du parallélisme). Sommets canoniques
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
    penché allongé). **Codage du parallélisme (#253, CM1) — 2ᵉ opt-in `parallelisme`
    (défaut `false`)** : ajoute des **chevrons** `›` / `»` le long des côtés
    parallèles (`SHAPE_MARQUES_PARALLELES` → `marqueParallele(a, b, chevrons)`,
    même style `--ink` que les tirets, **décalés du milieu** pour ne pas heurter le
    tiret d'égalité), **quadrilatères réguliers seulement** (jamais un triangle ni le
    `quadrilatereQuelconque`). Orthogonal à `codage` ; utilisé par
    `data/maths/figures-proprietes.ts`.
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
  - **`droite.ts`** — **droite graduée générique (#256)** : `renderDroiteGraduee`
    (figure STATIQUE `role="img"`, repli/révélation/`FigureSpec`) et
    `renderDroiteGradueeInteractif` (coquille `role="radiogroup"` : une graduation =
    un `radio`, bandes verticales aimantées) sur une fenêtre `[min, max]` d'un `pas`,
    avec bornes numérotées et repère(s) corail (état neutre / correct / faux, double
    codage forme + couleur). Agnostique de la matière (valeurs + libellés fournis par
    le client) ; helpers PURS `valeursGraduations` / `xDeValeur` / `nbIntervalles` /
    `indexDepuisX` / `repereMarkup`. Consommé par les leçons « placer un nombre » de
    numération (entiers, décimaux) via le runner `lecon-droite-graduee.ts`.
    **Précédent d'architecture** : première figure du moteur `figures/` où le SVG
    porte lui-même la sémantique ARIA d'un widget interactif (`role="radiogroup"` +
    `radio`), à distinguer des figures STATIQUES `role="img"` du reste du moteur et
    du calque SVG `aria-hidden` (décoratif) de `ui/appariement.ts` — motif réutilisable
    pour une prochaine figure interactive. **Invariant de densité** : `n` (nombre
    d'intervalles) plafonné à ~11 pour la fenêtre `DG_W = 320`, sous peine de bandes
    tactiles `.dg-hit` sous le plancher WCAG 2.5.8 (24 px) sur petit écran ; élargir
    `DG_W` si une leçon a besoin de plus de crans. **Parité a11y des graduations
    muettes** : leur `aria-label` ne révèle jamais la valeur (ce serait souffler la
    réponse) — elles s'annoncent par position relative (« N graduations après {borne
    chiffrée} »), le même comptage de crans que fait l'enfant voyant.
    **Deux repères sur la même droite** (#467 — correction d'une erreur, ou révélation
    gardant visible le repère que l'enfant avait posé) : `renderDroiteGraduee` gère seul
    leur cohabitation, aucun runner n'a de cas particulier à écrire. Un repère à **une
    seule graduation** du repère `correct` voit sa **tige raccourcie** (`repereMarkup(…,
    abaisse)`) : sa tête retombe plus bas, jamais de côté — l'abscisse EST l'information
    de valeur. Et quand **deux têtes PLEINES** coexistent (`correct` + `neutre`), la
    figure est enveloppée dans `.figure-avec-legende` avec une **légende** « ton repère /
    le bon repère » (moule `.clock-legend` / `.cl-dot` de l'horloge) : deux disques pleins
    ne se distingueraient que par la couleur. Le couple `correct` + `faux` n'en a pas
    besoin (tête creuse vs pleine).
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
    invariant « 90° ⇒ carré » garanti par `opening === 90`) ; + **CM1 (#252)** —
    **`renderAnglePair(a, b, labels?)`** (deux angles **côte à côte** pour les
    comparer, chacun étiqueté **A/B** hors du SVG, longueur des demi-droites
    réglable **par angle** via `AngleSpec.ray` — dissocie taille du trait et
    ouverture) et **`renderAngleNomme(spec, points)`** (un angle à **trois
    points nommés**, seul cas où un `<text>` SVG est admis sur une figure
    d'angle : ce sont des noms de points, pas des cotes/degrés).
  - **`groupes.ts`** — **`renderGroupes(paniers, total)`** (#104 — division par le
    sens : `total` jetons en vrac + `paniers` contenants **vides** ; montre la
    SITUATION, jamais le résultat → l'enfant calcule, il ne compte pas une réponse
    déjà posée).
  - **`graphiques.ts`** — **organisation et gestion de données (#257)** :
    **`renderDiagrammeBarres(spec)`** (diagramme en barres SVG `role="img"` sur
    `svgCanvas`, viewBox 320×200 ; **axe vertical gradué** au pas ∈ {1, 2, 5, 10} avec
    lignes de repère `--line`, sommets de barres **pile sur une graduation** — aucune
    interpolation —, 4-6 barres `SHAPE_FILL`, étiquettes de catégories SOUS les barres
    en `--ink` ; la valeur **n'est jamais imprimée** sur/au-dessus des barres, la
    hauteur reste à lire ; `<desc>` = structure seulement, jamais une valeur ; helpers
    PURS `graduationsAxe` / `yDeValeur` / `emplacementBarre`) et
    **`renderTableauDonnees(spec)`** (**tableau à double entrée HTML SÉMANTIQUE** —
    `<table>` + `<caption>` + `<th scope="col/row">` + `<td>`, PAS de SVG : le lecteur
    d'écran navigue cellule par cellule ; classe `figure-tableau-donnees`, filets fins
    `--line`, en-têtes `--accent-soft`/`--ink`). **Précédent** : comme
    `renderDroiteGradueeInteractif`, ce renderer HTML **ne passe pas** par `svgCanvas`
    (le slot `figure` accepte un markup arbitraire).
  - **`index.ts`** — point d'entrée : réexporte les primitives publiques et
    toutes les familles, et porte le dispatch par données **`FigureSpec`**
    (union `horloge | polygoneCote | quadrillage | quadrillagePaire | figurePlane |
    sceneFigures | cercle | solide | groupes | fraction* | grilleCentiemes |
    symJuger | symMiroir | symImage | angle | anglePair | angleNomme |
    diagrammeBarres | tableauDonnees` — le variant
    `figurePlane` porte le `codage?` ci-dessus, `quadrillage`/`quadrillagePaire`
    portent le `mode?` aire/périmètre — **point d'extension**) /
    **`renderFigure(spec)`**.

  On compose avec les primitives, on ajoute un `renderXxx` dans le module de sa
  famille (+ variant `FigureSpec` au besoin), jamais de SVG « à la main » dans
  une leçon. Tokens de couleur dédiés (`--clock-min`…) ; styles dans
  `src/styles/figures.scss`.
- **`exercise.ts`** — abstraction d'exercice : type `Exercise`
  (`text` | `qcm` | `qcmMulti` (multi-sélection #253 : `{question, propositions:
  string[]` — EXACTEMENT 4, ordre stable —, `correctes: string[]` — sous-ensemble
  vrai **stocké**, ≥ 1 et < 4 —, `figure?`, `parle?}` ; correction TOUT-OU-RIEN par
  son runner `lecon-qcm-multi.ts`, `checkAnswer` renvoie `false`) | `tuilesNombre`
  (numération #98) | `tuilesOrdre` (rangement d'une suite : ordre
  alphabétique #108, ordre des nombres #448 — suite mélangée + suite triée, plus
  `nature?: 'mots' | 'nombres'` qui n'accorde que la **formulation** partagée
  du widget / de l'aide / des listes écrites — séparateur via **`separateurSuite(nature)`**,
  source unique du repli texte du catalogue ET du journal d'erreurs) | `tuilesTri` (champs
  lexicaux #114 : tuiles + thème correct de chacune) | `appariement` (relier des
  paires #392 : `{question, paires: {gauche, droite}[], intrus?, parle?}` — `paires`
  porte les correspondances correctes, `intrus?` des mots décoys côté droite sans
  correspondance) | `posed` (calcul posé #97 : op + opérandes) | `tableauConversion`
  (tableau de conversion #394 : colonnes **`TableauColonne[]`** —
  `{unite, nom, transit, chiffres, tete?}`, TOUJOURS grande→petite unité — et
  `virguleApres?` pour les paires décimales CM1 ; corrigé **colonne par colonne** par
  son runner, comme `posed`) | `probleme` (résolution de problèmes #199 :
  `enonce`, `etapes[]` — 1 ou 2 sous-questions corrigées indépendamment —,
  `parle`, `figure?` #95, `explication?` #252 — stratégie affichée APRÈS la
  réponse, ex. le « pont » d'un calcul de durée) — chaque étape porte aussi un
  `calcul?: CalculEtape` optionnel (`{op, a, b}`, dans les valeurs AFFICHÉES de
  l'énoncé, ajouté pour l'étayage de la notion #490) : RENSEIGNÉ seulement quand le
  résultat de l'étape EST `a op b`, et **absent par refus explicite** pour une
  division avec reste ou une durée décomposée en heures/minutes, qui n'entrent pas
  dans ce moule ; `deA`/`deB` y déclarent l'étape d'où PROVIENT un opérande quand il
  n'est pas un nombre de l'énoncé mais le résultat d'une sous-question précédente
  (cf. « Étayage de la notion » plus bas) | `clicMot` (« clique sur le mot »
  #259, généralisé #437 : `{tokens: string[]` — phrase mot à mot, ponctuation comprise —,
  `cibleIndices: number[]` — ensemble EXACT des indices-cibles, **stockés**, adjacents
  ou non (verbe au passé composé = 2 mots adjacents ; « ni…ni »/sujet composé = cible
  double non adjacente ; **tous** les noms / déterminants d'une phrase au CE2 #436 = 2 à
  3 mots) —, `consigne`, `explication`, `parle`, `cibleLabel?` — nomme la
  cible (« le verbe conjugué », « l'article », « les noms »…), alimente les aria-labels
  de correction du runner et le repli `genLessonItem` ; absent ⇒ repli générique —,
  `explicationNommeCible?` (#436) — l'`explication` énonce DÉJÀ les mots-cibles, la région
  live de correction n'y ajoute donc pas son « La bonne réponse : … » ; drapeau porté par la
  **donnée** (jamais deviné en comparant des textes), absent ⇒ la réponse **est** annoncée
  (aucun repli silencieux)`}` ;
  corrigé par son runner `lecon-clic-mot.ts` par égalité d'ensembles, `checkAnswer`
  renvoie `false`, runner **agnostique de la notation grammaticale ciblée** — voir 7
  leçons dans [Contenu & leçons](contenu-et-lecons.md))
  | `droiteGraduee` (droite graduée #256 : `{min, max, pas, graduations[]` — toutes les
  graduations sélectionnables `{valeur, label}` —, `bornes[]` — sous-ensemble numéroté —,
  `cible` **stockée** ∈ graduations, `cibleLabel`, `consigne`, `explication`, `parle`,
  `pasLabel` — ce que vaut UNE graduation, déjà écrit comme l'enfant l'écrirait (« 1 »,
  « 0,1 ») ; stocké plutôt que recalculé (`pas` est en unité interne, centièmes entiers
  pour les décimaux), et repris tel quel par l'étayage de la notion (#490) comme premier
  pas de son déroulé, cf. « Étayage de la notion » plus bas`}` ;

  corrigé par son runner `lecon-droite-graduee.ts` — placer un repère, `check` renvoie
  `false` — ; repli LECTURE de `genLessonItem` : lire le nombre repéré)
  | interactions ortho), interface
  **`ExerciseType`** :
  `modes?`
  (descripteurs **`ModeOption`** `{id, label, hint, icon, recommended}`, dans
  l'ordre d'affichage), `generate(opts? : {mode?, level?})` (le `level` #225 calibre
  une leçon multi-niveaux), `check()`, et **`exerciseKind?`** (#348, type
  `ExerciseKind = 'posed' | 'tuilesOrdre' | 'tuilesTri' | 'probleme' | 'appariement' | 'clicMot' | 'droiteGraduee'`)
  — étiquette **déclarative statique** portée par les fabriques à runner dédié ;
  permet aux helpers `isPosedLesson` / `isOrderingLesson` / `isTriLesson` /
  `isProblemeLesson` / `isPairingLesson` / `isClicMotLesson` / `isDroiteGradueeLesson` de classer une leçon **sans appeler
  `generate()`** (supprime tout appel à l'aléatoire global au moment du filtrage).
  Absent = format standard (texte/QCM) éligible au sprint. L'appariement, le clic-mot et
  la droite graduée sont **corrigés par leur runner** (lien par lien / égalité
  d'ensembles / graduation choisie === cible), pas par `checkAnswer` : comme
  `posed`/`tuilesOrdre`/`tuilesTri`/`probleme`, leur `check()` renvoie toujours
  `false`.
  Helpers **`hasMode`** et **`defaultMode`** (les écrans dérivent leurs choix d'ici,
  **jamais en dur**, #69), et `checkAnswer` (normalisation partagée `normalizeText` ;
  **accents et apostrophes exigés**).
  **`generateSession?(count, opts)`** (correctif des répétitions de « Familles de mots
  à relier ») — méthode **optionnelle** qui tire une **session entière** de `count`
  manches en un seul appel, au lieu de `count` appels indépendants à `generate()` :
  réservée aux formats à runner **multi-manches** qui veulent garantir une propriété
  **globale** de la session (ici, l'appariement — un tirage **sans remise**, aucune
  répétition inter-manches). Absente ⇒ le runner retombe sur des `generate()`
  indépendants (comportement historique, dédup au mieux) ; la garantie, quand la
  méthode est fournie, est portée par la fabrique (seule à connaître sa banque), pas
  par le runner (`ui/lecon-appariement.ts:genManches` l'emprunte en priorité — voir
  `data/francais/familles.ts:tirerSessionAppariement` dans [Contenu &
  leçons](contenu-et-lecons.md)).
  Le type `text` porte un champ optionnel **`intervalle`**
  (intercalation par intervalle OUVERT — #240 au CM1, #446 au CE2) : quand il est présent, la
  correction accepte **toute valeur strictement comprise** entre les deux bornes (et non plus
  la seule `answer`) ; absent, comportement de réponse unique **inchangé** — la donnée de
  l'exercice porte ainsi la règle, le `check` partagé (via `calibrated`, pris sur le plus bas
  niveau) reste unique. Ce champ est **propagé jusqu'à l'`Item`** par `genLessonItem`, et
  **`checkItemAnswer`** (`items.ts`, la vraie correction fiche/sprint/révision) applique la
  **même** règle d'intervalle — sans ça, la correction par intervalle serait ignorée hors du
  `check` de l'`ExerciseType` (non appelé par l'appli en jeu). Le type `tuilesNombre` porte le
  même champ à titre **INFORMATIF** (#446) : la correction y reste « le libellé posé ===
  `answer` » (une seule tuile est dans la bande), mais le runner de tuiles a besoin de savoir
  que la question admettait d'autres nombres, pour le dire à l'enfant après coup et
  journaliser la bande.
  **`memeListeDeMots(raw, mots)`** (`items.ts`, #436) applique le même parti pris — la règle
  de correction portée par la DONNÉE de l'item — à une réponse **liste de mots** : l'`Item`
  porte **`motsAttendus?: string[]`**, posé par `genLessonItem` sur un `clicMot` à cible
  plurielle **NON CONTIGUË** (tous les noms/déterminants d'une phrase au CE2, sujet composé,
  ni…ni), et `checkItemAnswer` accepte alors les mots **dans l'ordre** avec un connecteur
  **libre** — espaces, virgules ou « et » indifféremment (« chien et gamelle » = « chien
  gamelle » = « chien, gamelle »). Une cible **contiguë** en est exclue (même prédicat
  `cibleContigue` que la jointure) : « a mangé » est un groupe verbal, pas une liste — il n'a
  aucun connecteur à ne pas exiger, et la tolérance y accepterait « a et mangé ».
  La comparaison **replie la casse** — seule exception du moteur, assumée : les mots sont
  prélevés dans une phrase, dont le premier porte la majuscule initiale (« Le et sa »), qui
  relève de la phrase source et non de la compétence évaluée. Accents et apostrophes restent
  exigés. La compétence évaluée est de trouver les bons mots, pas de reproduire la mise en
  forme ; l'`answer` garde la forme **lisible** (`libelleCible`) et reste la seule affichée,
  imprimée et journalisée. Tolérance **bornée** aux items qui portent le champ : aucune autre
  leçon n'est relâchée, ni sur la casse ni sur les séparateurs.
  Enfin, **`intervalleAPlusieursReponses([min, max])`** (`items.ts`)
  tranche le seuil du **pluriel** — au moins trois entiers dans la bande, écart ≥ 4 : « deux
  réponses » n'est pas « plusieurs ». C'est ce prédicat (et non la simple présence du champ)
  qui déclenche le suffixe de consigne « (plusieurs réponses possibles) » et la mention
  « d'autres nombres auraient aussi convenu » du mode tuiles ; la **présence** du champ, elle,
  suffit aux tournures indéfinies des écrans de correction (« une réponse possible était X »),
  qui ne s'engagent sur aucun nombre de solutions.
  **`depuisTuilesNombre(ex)` / `TuilesSpec`** (#446) — conversion **UNIQUE** d'un exercice
  `tuilesNombre` vers l'état local d'un runner : `TuilesSpec = Omit<ExerciseTuiles, 'type'>`
  (dérivé du type, jamais re-déclaré) et un mappeur qui renvoie tout sauf `type`, **sans
  énumérer les champs**. Les deux runners qui gardent un état local — `ui/lecon-tuiles.ts`
  (série de questions) et `ui/revision.ts` (RevItem `'tuile'`) — l'**étalent** (`...`) au lieu
  de recopier champ par champ. Motif : cette recopie dispersée est ce qui avait fait tomber
  l'`intervalle` en révision (verdict « LA bonne réponse » et journal à nombre isolé, en
  contradiction avec la même leçon hors révision) ; désormais un champ ajouté à `tuilesNombre`
  atteint les deux runners sans rien toucher. Ne concerne pas la conversion vers
  `ui/tuile-interaction.ts:TuileSpec` (spec du **widget**), volontairement plus étroite : le
  widget rend et fige des tuiles, il n'a pas à connaître la règle de correction — `TuileSpec`
  ignore `intervalle` **délibérément** (frontière de responsabilité, pas un oubli à
  « rétablir »), et c'est aussi pourquoi la galerie visuelle (`ui/galerie.ts`) construit ce
  spec-là, et non celui-ci. Le portage plus radical (les états locaux **portent** l'exercice au
  lieu d'en extraire des champs, pour toutes les familles) est suivi par **#507**.
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
  sans jamais passer par un `Number("4,56")` qui vaudrait `NaN`. **`saisieEstNombre(saisie)`**
  répond à une question différente de `parseNombreFr` : pas « combien vaut cette saisie »,
  mais « est-ce un nombre EXPLOITABLE » (calé sur `parseNombreFr` : une saisie vide, ou dont
  le parse vaut `NaN`, n'est pas un nombre — tout ce qui est aujourd'hui accepté par la
  correction reste donc accepté ici). Sert les runners (`ui/sprint.ts`, `ui/session.ts`, via
  `items.ts:itemEstNumerique` ci-dessus) à **refuser** une saisie illisible (« 3- », un
  caractère parasite du pavé numérique Android) au lieu de la compter fausse : une erreur de
  FORMAT n'est pas une erreur de CALCUL. **`wrapGrandsNombres(escaped)`** enveloppe les
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
  `fraction-text.ts` pour les numérateurs impropres > 9. **`NOMS_RANGS`** (#490) —
  table UNIQUE des noms de rang de la numération décimale, de l'unité au million :
  singulier, pluriel, GENRE. **`nomRang(rang, pluriel?)`** (`undefined` au-delà de la
  table plutôt que d'inventer un mot), **`quantiteRang(n, rang)`** (« 1 dizaine », « 7
  dizaines », accordé), **`genreRang(rang)`** (« aucune dizaine » mais « aucun
  millier »). Table PARTAGÉE par les moteurs de résolution de l'étayage de la notion
  qui nomment des rangs — le calcul posé (`core/etayage-posee.ts:nomColonne`) et la
  numération (`core/etayage-position.ts`, cf. « Étayage de la notion » plus bas) —,
  jamais redéduite par index chez le consommateur : elle divergerait au premier rang
  ajouté (constat du `redacteur-contenu-francais`, sur le pluriel de « dizaine de
  mille », invariable sur « mille »).
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
  voie alternative + filet anti-erreur) pour 10 types (`tuiles`, `ordre`, `ordreNombres`
  #448 — même geste que `ordre`, formulation accordée aux nombres —, `tri`, `atelier`,
  `lettres`, `tableau` #394, `appariement` #392, `clicMot`, `droiteGraduee` #256) et la **mémoire « aide déjà
  vue »** par profil (`ludaskia_aide_vue`, via `lsGet/lsSet`). Le rendu vit dans
  `ui/aide-exercice.ts`.
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
  **parité** entre modes — aucun mode n'est plus rentable qu'un autre (#69). En mode
  `'lecon'`, appelle aussi **`recordEssaiLecon`** (#485, avancement/report de la leçon
  du jour, cf. `report-lecon.ts`) : **seul** point d'entrée qui enregistre un essai
  COMPLET en mode leçon, jamais le sprint ni les bilans. Transmet aussi à
  `recordLessonStats` la **référence** (#498) de la leçon jouée, mais seulement en
  mode `'lecon'` — un bilan couvre plusieurs leçons, aucune cible unique à désigner
  pour l'attribution du programme du jour (cf. `core/seance.ts` ci-dessous).
- **`catalog.ts`** — hiérarchie `SUBJECTS` / `CATEGORIES` / `LessonDef`
  (`id, label, subject, category, levels: SchoolLevel[], exerciseType` — #225). La
  plupart des familles de leçons passent par **`toLessonDefs(inputs, opts)`** (#373) :
  fabrique qui mappe une liste `LessonInput` (#347, cf. [Contenu & leçons](contenu-et-lecons.md))
  en `LessonDef[]` — `opts.subject`/`category` fixes, et `levels`/`labelNiveau`/`rubrique`/
  `excludeFromSprint`/`repere` optionnels, chacun soit une valeur fixe soit une fonction
  `(input) => valeur` quand il dérive de la donnée ; un champ résolu à `undefined` est
  omis. **`etayage?: EtayageEntree[]`** (#490) est remonté TEL QUEL depuis
  `LessonInput` — aucune résolution fixe/fonction comme les champs ci-dessus, juste le
  contenu d'étayage rédigé au plus près de la leçon (cf. « Étayage de la notion »
  plus bas) ; absent = pas de panneau pour cette leçon. **`labelNiveau?: Partial<Record<SchoolLevel, string>>`** (#436) est le **surcroît
  optionnel** qui permet à une leçon multi-niveaux de se **nommer** différemment selon la
  classe (« Clique sur le nom » au CE2, « Clique sur le nom noyau » au CM1, « noyau » étant
  du vocabulaire CM1) : `label` reste le libellé par défaut et **doit rester juste à tous les
  niveaux** (les rares écrans sans niveau sous la main l'affichent tel quel — perte de
  précision, jamais contresens). Résolution à la LECTURE via **`labelLecon(lesson, niveau)`**
  (`levels.ts`), au seam qui connaît le niveau : `niveauLecon` en UI (helper partagé
  `leconTitreHTML` pour les runners, cf. [Rendu & interactions](ui.md)), niveau du profil
  **consulté** dans l'espace encadrant et à l'impression. Seule la conjugaison (`FRENCH_LESSONS`) reste hors du helper : son `exerciseType`
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
  1:1 sur les leçons restant à franchir** (`sequenceLeconDuJour`), et renvoie la
  **première franchissable** (`leconDuJour`). **« Franchie » (#485)** = étoilée au
  niveau actif (`loadStars`) **OU** réussie à `SEUIL_FRANCHIE` (70 %, cf.
  `report-lecon.ts`) sur un essai **complet en mode leçon** (`loadLessonReports`) : le
  sans-faute exigé pour AVANCER bloquait indéfiniment un enfant qui n'atteignait jamais
  l'étoile sur une leçon donnée ; la MAÎTRISE durable, elle, reste portée par la révision
  espacée (`revision.ts`), pas par cet avancement. **Report** : une leçon travaillée sans
  être franchie est mise de côté (`enReport`) — au plus `MAX_REPORTEES_MATIERE` (2) à la
  fois par matière, la plus anciennement reportée revenant d'office au-delà — et compte
  quand même comme de l'« avancement » de sa matière pour l'alternance (sinon la matière
  garderait la main et proposerait aussitôt la suite, à l'opposé de l'intérêt du
  report). Si tout ce qui reste à franchir est reporté, `sequenceLeconDuJour` **replie**
  sur les leçons mises de côté (la plus anciennement reportée d'abord) plutôt que
  d'annoncer un programme terminé. Le round-robin **part de la matière la moins avancée**
  (leçons franchies + reportées dans sa séquence ; égalité → ordre du catalogue) : comme
  l'accueil n'affiche que la **tête** du fil, c'est ce tri qui fait réellement alterner
  la leçon proposée — sans lui, la tête restait celle de la 1re matière déclarée jusqu'à
  épuisement de son programme (#484). `leconSuivante` = contournement « voir une autre
  leçon » (jamais de mur). Reste **distinct** de la révision espacée (avancer vers le
  neuf ↔ entretenir l'acquis) et du défi du jour.
- **`accueil-propositions.ts`** (#516) — arbitrage **pur** qui déduplique les deux
  cartes « à faire » de l'accueil, rendues indépendamment mais capables de proposer
  la MÊME leçon (une entrée épinglée « à revoir » n'est montrée que tant que la notion
  est faible, donc encore présente dans le fil de `lecon-du-jour.ts`, dont elle peut
  très bien être la tête). Deux sélecteurs, dans l'ordre où ils s'appliquent :
  **`choisirARevoir(entrees, leconDuJourId, cibleId?)`** (consommé par
  `ui/a-revoir-card.ts`) renvoie la première entrée qui n'est **pas** la leçon du jour
  (repli sur la tête de file si aucune alternative ; `cibleId` — bouton « voir une
  autre » — force une entrée et court-circuite la règle) ; **`choisirProchaineLecon(sequence,
  eviterId)`** (consommé par `ui/lecon-du-jour.ts`) renvoie la première leçon du fil qui
  n'est pas `eviterId` (même repli). « À revoir » cède donc la première (ses entrées sont
  toutes des consignes de l'encadrant, aucune ne prime) ; « Ta prochaine leçon » n'avance
  que si « À revoir » n'a pas pu céder (une seule entrée épinglée, et c'est la leçon du
  jour). Le doublon ne subsiste que si l'épingle est aussi la DERNIÈRE leçon restante du
  fil : mieux vaut le doublon qu'une carte qui félicite l'enfant d'avoir « fait le tour »
  alors qu'il lui reste cette leçon. Seules les entrées `kind === 'lecon'` peuvent entrer
  en collision (une liste de dictée `kind === 'ortho'` n'est pas dans le catalogue, son id
  ne se compare pas à une leçon). Les deux sélecteurs vivent ici plutôt que dans chacune
  des deux cartes, pour que l'arbitrage s'énonce en un seul endroit.
- **`report-lecon.ts`** (#485) — socle **pur** (sans stockage, même rôle que
  `maitrise.ts`) de l'avancement/report ci-dessus. `EtatReport {jours, dernierJour,
  reporteLe, reprendreLe, meilleurPct}` : une entrée par leçon, créée au 1er essai en
  mode leçon et vivant indéfiniment (structure bornée par le catalogue, aucune
  rétention à gérer). **`estFranchie(etat, etoilee)`** teste étoile OU `meilleurPct ≥
  SEUIL_FRANCHIE` (= `SEUIL_REVOIR` de `maitrise.ts`, 70 % — un seul seuil de « plus
  besoin d'insister » réutilisé plutôt qu'un second qui aurait fallu maintenir en
  synchronisation). **`apresEssaiLecon(etat, pct, now, etoilee)`** (pure, appelée depuis
  `progress.ts:recordEssaiLecon`) : franchie (score ou étoile) → garde le meilleur
  score, efface un report en cours **et REMET LE COMPTEUR DE JOURS DE BLOCAGE À ZÉRO**
  (#490 : `jours`/`dernierJour` repartent à `0`/`''`) — ce compteur pilote l'escalier
  de report ET le signal à l'adulte (`BLOCAGES_SIGNAL_ADULTE` ci-dessous) ; cumulé à
  vie, il rendait ce signal définitif, une notion butée puis maîtrisée restant
  signalée « point dur » le reste de l'année (constat `pedagogue-primaire`) : il
  décrit une difficulté COURANTE, pas un passé ; même jour civil qu'un blocage déjà
  compté → pas d'escalade (retenter dans la même séance est sain, seul le score peut
  monter) ; sinon +1 **jour** de blocage et `delaiReport(jours, pct)` calcule le délai à appliquer.
  **L'escalade compte des JOURS, pas des tentatives** ; `JOURS_AVANT_REPORT` (2) laisse
  le 1er jour de blocage sans conséquence (distraction, découverte). `delaiReport`
  réutilise l'escalier de la révision espacée (`REVISION_INTERVALLES`, 1/3/7 j via
  `CRAN_REPORT_MAX = 2`) — un seul modèle d'espacement dans l'app, pas une échelle
  parallèle à maintenir ; un score `< SEUIL_NON_ACQUIS` (40 %) fait sauter un cran de
  plus (la notion n'est pas installée, la marteler tout de suite n'aiderait pas — elle
  continue par ailleurs de revenir en révision espacée). **`enReport(etat, now)`** dit
  si la mise de côté court encore à cet instant. `BLOCAGES_SIGNAL_ADULTE` (3) est le
  seuil de jours de blocage à partir duquel l'espace encadrant signale la leçon (cf.
  [Espace encadrant](espace-encadrant.md)) — c'est aussi le même seuil qui éteint
  l'exemple d'étayage automatique (#490, `core/etayage.ts:episodeEtayable` ci-dessous) :
  passé ce point, l'appli cesse de s'auto-expliquer au moment même où l'espace
  encadrant se met à signaler la leçon, l'un et l'autre lisant le même `EtatReport`.
  Consommé par `lecon-du-jour.ts` (sélection et report), `progress.ts` (persistance)
  et `core/etayage.ts` (déclencheur de l'exemple d'avant-série), jamais directement
  par l'UI.
- **`sprint-scope.ts`** — **périmètre du sprint** (#208, pure) : `all` (toutes les
  leçons éligibles du niveau) ou `seen` (uniquement les leçons **déjà rencontrées**,
  `loadRencontrees` — pas « acquises » : le sprint consolide, y compris le fragile).
  « Rencontrée » (#478) = union de `loadLessonFirstSeen` (jouée dans l'appli) **et**
  de `vu-ailleurs.ts:loadVuAilleurs` (déclarée « vue en classe » par l'adulte, cf.
  [Espace encadrant](espace-encadrant.md)) — **seul endroit** où les deux cartes sont
  réunies : les autres consommateurs de la date de 1er passage (objectif « découvre une
  nouvelle leçon », récap encadrant « notions maîtrisées récemment ») restent aveugles
  aux déclarations. `appliquerScope` filtre, `scopeParDefaut` donne le défaut
  **adaptatif** (« déjà vues » tant qu'il reste du non-rencontré, sinon « tout »),
  `perimetreChoisissable` dit si le choix a un sens. Consommé par `ui/sprint.ts`
  (sélecteur dans l'écran de config, options vides au périmètre courant désactivées) ;
  un favori (`lessons`) ignore le périmètre.

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

- **`resume.ts`** — **reprise d'un exercice en cours** (#63, étendue aux runners
  #498), brique **pure** : stockage par profil (`ludaskia_resume`) d'instantanés
  **`ResumeSnapshot`**, union discriminée par `kind` — **`grille`** (leçon en
  saisie, bilans express/complet/personnalisé : `sheetsHTML`/`items`/`answers`/
  `activeId`/`elapsedMs`, l'état tient dans le DOM qu'on rejoue tel quel) ou
  **`runner`** (#498 : `questions`/`idx`/`score`, l'état LOGIQUE des dix runners
  « une question à la fois », qui se re-rendent eux-mêmes — granularité : la
  question **entamée**, jamais celles déjà validées) — `loadResumes`/`getResume`/
  `upsertResume`/`removeResume`/`clearResumes`, **clés stables** par identité
  d'exercice (`leconKey`, `bilanCategoryKey`, `bilanCustomKey` ; relancer écrase),
  **validation versionnée** (un instantané d'une autre version ou mal formé est
  ignoré proprement ; un instantané D'AVANT #498, sans `kind`, est lu comme une
  `grille` — seule nature qui existait alors, aucune reprise en cours perdue à la
  mise à jour), **expiration silencieuse** (`RESUME_TTL_MS`, 7 j) et **plafond**
  de stockage (`RESUME_MAX_STORED`). `now` passé en paramètre (testable sans
  horloge). Sprint et révision espacée **hors périmètre** (le sprint est un défi
  borné ; la révision est déjà persistée item par item, comme l'orthographe).
- **`revision.ts`** — **révision espacée** (#45), brique **pure** : escalier
  d'intervalles CE2 (`etatNeuf`, `avancerEtat`, `estDu`/`estAcquis` ; `now` passé
  en paramètre). État `EtatRevision` partagé par les mots d'orthographe et les
  leçons maths/conjugaison. Cette file est aussi **consultable côté encadrant**
  (par profil, sans bascule) via `encadrant-stats.ts:revisionProfil` — cf.
  [Espace encadrant](espace-encadrant.md). **Plafond d'une session réglable par profil**
  (#439) : `REVISION_PLAFOND` (12) reste la valeur **par défaut** pour un profil non
  réglé (comportement historique inchangé) ; `REVISION_PLAFOND_MIN`/`_MAX` (6/24) et
  `REVISION_PLAFOND_CHOIX` (paliers du menu déroulant) bornent le réglage exposé dans
  l'espace encadrant (`ui/encadrant-reglages.ts`, cf. [Espace
  encadrant](espace-encadrant.md)) ; fallback + bornage appliqués à la lecture par
  `profiles.ts:getRevisionPlafond`, consommé par `ui/revision.ts:runRevisionEspacee` au
  lieu de la valeur par défaut figée. L'algorithme d'équilibrage entre sources
  (`selectionEquilibree`, `revision-select.ts`) a été **adapté** au passage : son budget
  de vidage suit désormais le plafond pour qu'un plafond bas (6/8) n'affame plus une
  source pourtant due (cf. ci-dessous).
  **Entretien du niveau INFÉRIEUR (#232)** : une séance peut aussi ressortir, en dose
  plafonnée, des notions encore en rotation à un niveau immédiatement inférieur (un CM1
  qui entretient son CE2 — le cycle 3 REPREND explicitement des compétences du cycle 2 :
  technique opératoire posée, faits numériques mémorisés, conjugaison d'être/avoir et du
  1er groupe). **`plafondBasNiveau(plafond)`** dérive la dose du **plafond de séance**,
  pas d'un pourcentage (avis pédagogue : l'objet est « ne pas laisser tomber à zéro », pas
  « représenter le passé à proportion ») : `< 8 → 0` (entretien SUSPENDU sur la plus petite
  séance — le coût du changement de registre y pèserait plus que le bénéfice), `8-11 → 1`,
  `12-19 → 2`, `≥ 20 → REVISION_BAS_NIVEAU_MAX` (3, plafond dur). Ces éléments prennent des
  slots **DANS** le plafond, jamais en plus (la charge d'une séance ne change pas).
  Périmètre borné à **un seul niveau d'écart** — **`niveauInferieurImmediat(reference)`**
  (`levels.ts`) : rien au-dessus du niveau actif (dormant), rien à deux niveaux d'écart ou
  plus (dette gardée en stock, jamais plus retirée). Le producteur de ces entrées
  (`progress.ts:loadLessonRevisionsBasNiveau`, seul à savoir lire la clé namespacée
  `lessonId@niveau` du profil) et leur consommation (`revision-select.ts`) sont détaillés
  ci-dessous. La réécriture de l'état après une réponse — **`avancerLessonRevision(lessonId,
  reussi, now, niveau?)`** — prend ce niveau explicitement : sans lui, une réussite
  d'entretien s'inscrirait sur la clé du niveau actif et l'entrée basse resterait due à
  jamais. Le décompte partagé par les trois écrans qui posent « y a-t-il à réviser ? »
  (carte d'accueil, tuile de séance, rappel de navigation) — **`progress.ts:countDusSeance`**
  — inclut cette dose depuis #232, pour rester d'accord avec ce que la séance sert
  vraiment.
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
  jet — **mais dans la limite d'un budget** qui réserve un slot à chaque source du
  round-robin. **Phase 2 (round-robin)** : les slots restants sont répartis à tour de
  rôle entre les sources restantes (grosses + petites non vidées), chacune cédant son
  item le plus en retard. **Deux garde-fous** contre la famine d'une source : le vidage
  est plafonné à 2 sources **et** son budget de slots est plafonné pour laisser une
  place au round-robin — ce second garde-fou est indispensable depuis que le plafond est
  réglable et peut descendre bas (#439), sinon une session courte serait entièrement
  raflée par le vidage. `countDue` reste sur le total non plafonné (base du décompte) ;
  **l'affichage de la carte d'accueil, lui, ne l'est plus depuis #478** : au-delà d'une
  séance, il annonce l'EFFORT DU JOUR (le plafond, ce que la séance proposera vraiment)
  plutôt que ce total — une déclaration massive « vu en classe » peut rendre des
  dizaines de leçons dues d'un coup, et un compteur à trois chiffres qui ne descend pas
  malgré le travail serait décourageant (`ui/render.ts:fillRevisionRecord`).
  **Entretien du niveau inférieur (#232)** : `selectDueGroups`/`countDue`/`prochaineEcheance`/
  `aDesRevisions` prennent tous un dernier paramètre optionnel **`bas: LeconBasNiveau[]`**
  (`{lessonId, niveau, etat}`, contrat porté ici, produit par
  `progress.ts:loadLessonRevisionsBasNiveau`) — absent ou vide ⇒ comportement V1 strictement
  inchangé (niveau actif seul). **`budgetEntretien(nbActifs, plafond)`** borne la dose de
  `plafondBasNiveau` par ce que le NIVEAU ACTIF apporte vraiment (jamais plus que son nombre
  d'éléments dus, sauf s'il n'y en a aucun : la dose est alors bornée à 2, pour qu'une séance
  ne RÉTRÉCISSE jamais le jour où la dette active augmente). **`collectBasNiveau`** sélectionne
  les éléments dus du lot : ni équilibrage entre sources (le budget, ≤ 3, est trop petit pour
  un round-robin), ni compétition de retard avec le niveau actif — après des mois au-dessus,
  une échéance basse est systématiquement plus en retard et raflerait tout sur un tri commun,
  le retard n'est donc JAMAIS comparé entre niveaux — mais un tri interne par « le plus
  longtemps SANS TEST RÉEL » (`dernierTest`), pour faire tourner le stock plutôt que laisser
  un élément moisir (jamais testé passe d'abord). **`insererEntretien`** glisse chaque élément
  dans la séance déjà GROUPÉE (jamais avant : une insertion à plat serait de toute façon
  recollée au bloc de sa catégorie une fois groupée, donc ne déciderait de rien) selon deux
  règles ordonnées : **jamais en clôture de séance** (un échec recule d'un palier — clore sur
  une notion presque acquise la ferait échouer par fatigue, pas par méconnaissance) prime sur
  **après les éléments actifs de sa catégorie** sinon. Cas assumé : avec une seule catégorie
  active, un entretien d'une AUTRE catégorie ouvre forcément la séance (il ne peut être ni
  premier ni dernier d'une liste de deux) — préféré à une clôture, au prix d'un lot
  identifiable en tête.
- **`revision-migrate.ts`** — **reprise** de l'historique vers la révision : à
  l'activation d'un profil (`applyActive`), les leçons déjà notées et les mots
  déjà en banque sans état SR entrent en rotation, **datés J-1** → dus dès le jour
  même (`migrateRevisions` ; backfills idempotents dans `progress.ts` /
  `orthographe/store.ts`). Rattrape l'activité antérieure à #45.

## Progression, gamification & déblocages

- **`maitrise.ts`** (#397, fenêtre recomptée en QUESTIONS par #541) — socle **pur** (sans
  stockage) de l'échelle de maîtrise d'une notion (type LSU) : forme `LessonStat`,
  `lessonAvgPct` (moyenne cumulée) / `recentAvgPct` (perf **récente** `Σok/Σtotal`, fenêtre
  glissante `LessonStat.recents: EssaiRecent[]` — un couple `{ok, total}` par essai, PONDÉRÉ
  par son nombre de questions plutôt que moyenné à poids égal — bornée à `FENETRE_QUESTIONS`
  = 40 questions, pas 5 essais : une question isolée de sprint ne pèse plus autant qu'une série
  complète de huit). L'ancienne forme `recentPct?` (un % par essai, impondérable) n'est **plus
  jamais écrite** mais reste lue en repli et CONVERTIE (`essaisRecents`, questions par essai
  estimées depuis `questions / attempts`), pour ne pas remettre à zéro l'historique des
  profils existants. `perfRecente` renvoie perf + taille d'échantillon ensemble (repli sur
  `lessonAvgPct` si la fenêtre est vide). Seuils d'acquisition (`SEUIL_NON_ACQUIS`/
  `SEUIL_REVOIR`, inchangés), plancher d'échantillon **`MIN_QUESTIONS_ETAT_BAS`** (6
  questions, calé sur la plus petite série de leçon) sous lequel `niveauNotion` ne descend
  plus à « non acquis » faute de matière, et seuils de tendance comptés en questions
  (`TENDANCE_MIN_QUESTIONS` = 24 + `TENDANCE_MIN_MOITIE` = 8, remplacent l'ancien
  `TENDANCE_MIN_ESSAIS`) / `TENDANCE_SEUIL`, `niveauNotion`/`tendanceNotion`. Extrait de
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
  catalogue, pas de rétention à gérer).
  **Câblage STRUCTUREL, plus porté par la vigilance de chaque appelant** : depuis le
  câblage PR #540, c'est `recordLessonStats` **lui-même** qui appelle
  `recordMonteesPalier`, en `queueMicrotask` — `lesson-run.ts:recordLessonRun` et le sprint
  (`ui/sprint.ts`) n'appellent plus rien. Le report en microtâche laisse l'étoile s'écrire
  d'abord (l'appelant l'écrit APRÈS le retour de `recordLessonStats`, dont dépend l'état
  « acquis ») ; les microtâches s'exécutent avant toute I/O, donc rien ne se perd entre les
  deux. Raison d'être : la frise déduit l'état d'une semaine de l'ABSENCE d'horodatage, ce
  qui n'est vrai que si TOUT chemin écrivant des stats de leçon journalise aussi les
  paliers — les deux appels étaient jusqu'ici côte à côte chez chaque appelant, sans rien
  pour les lier, et un futur runner qui aurait oublié le second aurait fait mentir la frise
  sans que rien ne le signale. Deux limites à connaître avant de bâtir dessus : un lecteur
  du journal situé dans la MÊME tâche que la session y verrait l'état d'AVANT (aucun
  consommateur aujourd'hui — l'espace encadrant s'atteint par navigation, donc dans une
  autre tâche) ; et la marche porte l'instant du DÉBUT de `recordLessonStats`, le même que
  `lastAt` et le journal d'activité, plutôt qu'un `Date.now()` relu en fin de session comme
  le faisaient les appelants — source de la frise d'évolution de l'espace encadrant (cf.
  [Espace encadrant](espace-encadrant.md)).
  **Avancement/report de la leçon du jour** (#485, `ludaskia_leconReport`) :
  **`recordEssaiLecon(lessonId, pct, now, etoilee)`** enregistre un essai complet en
  mode leçon (appelé uniquement par `lesson-run.ts`, jamais par le sprint/les bilans) et
  renvoie l'`EtatReport` obtenu ; **`loadLessonReports()`** expose la vue scopée au
  niveau actif (`Record<lessonId, EtatReport>`, comme `loadStars`), consommée par
  `lecon-du-jour.ts` et `rewards.ts:weakLessons`. Logique pure dans `report-lecon.ts`
  ci-dessus.
  **Mémoire de l'exemple d'avant-série** (#490, `ludaskia_etayageVu`) :
  **`loadEtayagesVus()`**/**`marquerEtayageVu(lessonId, episode)`** — namespacée par
  niveau comme `ludaskia_leconReport`, dont elle dépend (l'épisode mémorisé est
  l'horodatage `reporteLe` du report en cours, cf. `core/etayage.ts:episodeEtayable`
  ci-dessous) ; consommée par `ui/etayage-panneau.ts:maybeEtayageAvantSerie`, jamais
  directement par l'UI.
  **Journal d'activité** (`ludaskia_activity`, `loadActivity` — une session finalisée,
  #234 ; **entrées typées** `ActivityEntry = {t, k, ref?}` avec
  `ActivityKind = 'lecon' | 'bilan' | 'sprint' | 'revision' | 'dictee'` (+ `'inconnu'`
  pour l'ancien format), #319). **`ref`** (#498) = id de la leçon (`'lecon'`) ou de la
  liste d'orthographe (`'dictee'`) travaillée, **quand la session en vise UNE seule** —
  absente pour une session multi-cibles (bilan, sprint, tour de révision espacée) : c'est
  cette référence que le programme du jour consomme pour attribuer une session à une
  étape (`core/seance.ts:etapeSatisfaite`, cf. [Modes & navigation](modes-et-navigation.md)),
  sans quoi l'attribution ne pouvait s'appuyer que sur le TYPE de session, donc sur un
  marqueur posé au lancement (ignorant le travail fait depuis une autre porte).
  `recordLessonStats(perLesson, kind = 'lecon', ref?)` journalise les leçons/bilans/sprints
  (`ref` transmis seulement en mode `'lecon'`, cf. `lesson-run.ts` ci-dessus) ; **depuis #541,
  la révision espacée l'appelle aussi** (`ui/revision.ts`, `kind = 'revision'`) dès qu'elle a
  rejoué au moins un item du catalogue — une session composée UNIQUEMENT de mots
  d'orthographe n'a, elle, aucune stat de leçon à écrire. La dictée d'orthographe
  (`ui/ortho-runner.ts`), qui ne porte jamais de leçon du catalogue, et une révision
  purement lexicale appellent alors **`recordSessionActivity(kind, ref?)`**.
  `normalizeActivity` lit **tolérant** l'ancien
  `number[]` (chaque horodatage nu → `'inconnu'`, sans `ref`) et le réécrit au format objet
  au prochain passage (migration **lazy, sans perte**).
  **Borne de mise en service du journal des paliers, posée par TOUTE session** (PR #540) :
  `recordActivity`, le point commun à `recordLessonStats` et `recordSessionActivity`,
  appelle `marquerDebutSuivi(now)`, qui pose `PALIERS_DEBUT_KEY` (`ludaskia_paliersDepuis`)
  si elle manque encore, **jamais deux fois**. Sans ça, un enfant qui ne ferait que des
  dictées et des révisions purement lexicales (chemins qui n'écrivent aucune stat de leçon,
  cf. #541 ci-dessous) n'aurait aucune borne, et l'espace encadrant afficherait « aucun suivi »
  sur toutes ses leçons alors qu'il travaille — la déduction reste juste, l'étoile ne
  s'obtenant que par celui qui écrit des stats. Contrairement aux franchissements de palier ci-dessus, cette borne est
  posée **synchroniquement** (elle ne dépend pas de l'étoile). `recordMonteesPalier` la pose
  aussi, pour le seul cas qu'aucun point d'activité ne couvre : la session sans aucune
  question. **XP global** (`getXP`/`addXP`,
  `ludaskia_xp`) et **niveaux dérivés** (`niveauDepuisXP`, `progressionNiveau`,
  `xpVersSuivant`, `xpPourNiveau`, `NIVEAU_MAX`), périodes calendaires (`startOfWeek/Month`,
  `countSince`).
- **`rewards.ts`** — défi du jour contextuel (`CHALLENGES`, `getGoal` → `Goal`
  `{date, target, progress, done, type, label, lesson?}`, `updateGoal(ev: GoalEvent)`)
  et trophées (`TROPHIES`, `tiers()`, `evaluateTrophies`,
  `gSnapshot` — type exporté `GSnapshot`), dont des groupes **par matière** et **par
  catégorie** générés depuis le catalogue. **`weakLessons()`** (vivier du défi
  « remédiation », perf < 70 %) exclut une leçon actuellement **en report** (#485,
  `report-lecon.ts:enReport`) : la proposer irait à l'encontre du répit que la leçon du
  jour vient de lui accorder ; elle continue de revenir via la révision espacée.
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

## Étayage de la notion (#490)

L'aide au geste (#272, `aide.ts` ci-dessus) explique la MANIPULATION d'un widget
(glisser une tuile, où saisir) ; elle ne dit rien du SAVOIR en jeu. Un enfant qui n'a
pas compris la retenue refera la même erreur avec d'autres nombres — « varier la
surface » (items régénérés) ne suffit pas. Deux modules purs portent ce second
niveau, sans DOM ni stockage :

- **`etayage.ts`** — socle : la **sélection** du contenu d'une leçon
  (**`etayagePour(lesson, niveau, mode)`**), qui cherche l'entrée `LessonDef.etayage`
  la plus SPÉCIFIQUE (niveau puis mode ; une entrée qui précise un niveau/mode
  DIFFÉRENT est écartée, jamais dégradée) et renvoie `undefined` en son absence —
  **invariant central du module** : sans entrée pour CETTE leçon, il n'y a **pas** de
  panneau, jamais de repli sur un exemple générique de la même famille de moteur (un
  exemple « clique sur un nom, CE2 » servi sur « clique sur l'adjectif, CM1 » serait
  pire que rien). La granularité de la clé est donc **(leçon, niveau, mode)**, jamais
  « famille de moteur » — les moteurs sont réutilisés par plusieurs leçons et
  plusieurs niveaux. `EtayageContenu` porte un `titre`, une `regle?` (l'idée-force en
  UNE phrase, affichée en PERMANENCE pendant tout le déroulé — ce qu'un enfant à
  faible mémoire de travail retient d'un écran à l'autre, avis
  `specialiste-troubles-apprentissage`), des `etapes?` rédigées (≤ 3) et/ou un
  `exemple?` (`EtayageExemple`, une branche par famille MÉCANISABLE : `posee`,
  `conversion`, `droite`, `position`, `conjugaison`, `probleme`).

  **Cas RÉDIGÉ** (#490 PR 3, de loin le plus fréquent — une notion dont la méthode
  s'écrit, faute d'algorithme à dérouler) : le raccourci
  **`etayageRedige(titre, regle, etapes, niveau?)`** (`src/data/_shared.ts`, cf.
  [Contenu & leçons](contenu-et-lecons.md)) construit l'entrée sans `exemple`. Charte
  CONTRAIGNANTE, celle des aides au geste (#272) : `regle` en UNE phrase (le sens, pas
  le geste), `etapes` à l'impératif et au plus TROIS, exemples chiffrés CANONIQUES
  (toujours les mêmes — un enfant qui rouvre le panneau doit y retrouver ce qu'il a
  déjà lu). **Exception de rangement** : les 17 leçons de calcul mental du moteur
  historique (`bilanQ`, `core/lessons.ts`) n'ont pas de module `src/data/` où loger
  leur entrée — ce sont des `LessonDef` littéraux de `core/catalog.ts` — ; leurs
  étayages vivent regroupés dans `src/data/maths/calcul-mental-etayage.ts` et sont
  posés après coup, par id, par `avecEtayage()` (`core/catalog.ts`).

  Le module expose aussi **`leconPrerequise(lesson, niveau)`** — la leçon PRÉCÉDENTE de sa catégorie dans
  l'ordre pédagogique (`ordre.ts`/`getLessonsByCategory`, déjà trié) —, seul contenu
  entièrement MÉCANISABLE, donc affichable même sans rien de rédigé. Enfin,
  **`episodeEtayable(etat, now)`** identifie l'ÉPISODE de blocage dont l'enfant
  REVIENT (signature stable : l'horodatage `reporteLe` du report qui l'a ouvert, `0` =
  aucun) — un report ÉCHU (`reprendreLe` passé) signe le retour dans le fil, le
  moment où l'exemple d'avant-série a sa place — et **`doitEtayerAvantSerie(etat, vu,
  now)`** compare cet épisode à celui déjà couvert (`vu`, mémorisé par
  `progress.ts:loadEtayagesVus`, cf. ci-dessus) : relancer la même leçon dix fois le
  même jour ne redonne pas dix panneaux. **Ce que le calibrage actuel rend
  atteignable est plus étroit que cette mécanique** : il faut un report (`jours ≥ 2`)
  et `jours < 3`, soit exactement `jours = 2`, or `jours` ne redescend qu'au
  franchissement — lequel interdit tout report ultérieur. En pratique, **un seul
  exemple d'avant-série par leçon et par niveau, à vie**, et la mémoire d'épisode se
  comporte comme un booléen. Conservateur par construction (les autres points d'entrée
  restent, eux, toujours offerts et sans mémoire) ; élargir demanderait de bouger la
  borne, pas ce module — d'où la mécanique laissée générale.
  **Borne haute partagée avec le signal encadrant** : dès
  `BLOCAGES_SIGNAL_ADULTE` (`report-lecon.ts` ci-dessus, 3 jours) atteint,
  `episodeEtayable` renvoie `0` — l'appli cesse de s'auto-expliquer au moment même
  où l'espace encadrant se met à signaler la leçon (cf. [Espace
  encadrant](espace-encadrant.md)) : un dispositif auto-corrigé ne répare pas une
  incompréhension persistante par la répétition, c'est alors à l'adulte de prendre
  le relais.
- **`etayage-deroule.ts`** — le CONTRAT que remplit chaque moteur de résolution, et la
  seule chose que le panneau connaisse d'eux. Un **`DerouleEtayage`** = un `titre` et une
  suite de **`PasEtayage`** : une `phrase` (ce qu'on dit), des `ecritures?`
  (`{cible, texte}` — ce que le pas écrit, désigné par une CLÉ stable, jamais par une
  géométrie d'écran : la géométrie appartient au rendu, et un moteur pur reste testable
  sans DOM) et des `actifs?` (ce qu'on met en avant). **`PAS_MAX`** (12) borne la
  longueur : ce que la charte des « trois étapes » borne, c'est le texte d'une RÈGLE, pas
  une résolution dont la longueur est dictée par la donnée — le volume à l'écran, lui, est
  réglé par le déroulé pas à pas lui-même. **`derouleMontrable(d)`** refuse un déroulé
  vide ou plus long que le plafond, et l'abandonne EN ENTIER plutôt que de le tronquer
  (une méthode qui s'arrête au milieu vaut moins que la règle seule, servie à sa place).
  Un moteur qui a besoin d'un état plus riche qu'une écriture étend `PasEtayage` chez lui
  (la droite graduée porte un repère et un chemin, la numération des cases masquées) :
  ce sont des DONNÉES pures, le panneau n'a jamais à en savoir plus.
- **`etayage-posee.ts`** — l'un des deux contenus possibles d'une notion (cf.
  `etayage.ts`) : la **résolution GÉNÉRÉE** d'une opération posée, du CODE et non de
  l'éditorial (la méthode est mécanique). **`resolutionPosee(spec: PosedSpec)`**
  découpe le calcul en `LignePosee[]` (une addition/soustraction/multiplication ×1
  chiffre n'en a qu'une ; une multiplication à 2 chiffres en a trois — les deux
  produits partiels puis leur addition, `role: 'produit-partiel' |
  'produit-partiel-dizaines' | 'somme-partiels'`), chacune en `EtapePosee[]` — une
  étape = **une colonne**, l'unité de décision de l'algorithme posé (chiffres lus,
  retenue entrante/sortante, chiffre écrit, `emprunt?` en soustraction).
  **`phrasePosee(etape, op, ligne)`** met une étape en mots : ce qu'on lit (retenue
  comprise), le FAIT NUMÉRIQUE isolé (« 3 + 8 + 1 = 12 »), puis ce qu'on écrit et
  **pourquoi** — la VALEUR DE POSITION (« 12, c'est 1 dizaine et 2 unités ») plutôt
  que le seul geste (« écris 2, retiens 1 »), qui enseignerait la
  manipulation sans la notion (avis `specialiste-troubles-apprentissage`).
  **Soustraction : la retenue se NOTE en case** (méthode par emprunt, celle des
  manuels CE2 et celle que la grille sait écrire), jamais en barrant le chiffre du
  haut — **point laissé ouvert par le mainteneur**, pas une méthode validée à
  l'exclusion des autres. `chapeauLigne(ligne, spec)` annonce une ligne quand il y en
  a plusieurs (« D'abord, je multiplie… »), posée en tête de sa première colonne, pas
  comme une étape de plus (le volume d'une multiplication à deux chiffres est déjà à
  la limite haute du suivable). Testable seul, utilisable indifféremment sur
  l'opération que l'enfant vient de rater ou sur l'exemple canonique **fixe** d'une
  leçon (`data/maths/posee.ts`, cf. [Contenu & leçons](contenu-et-lecons.md)) —
  jamais un tirage, qui donnerait tantôt un cas sans retenue qui ne montre rien,
  tantôt le pire cas au pire moment. **`deroulePosee(spec)`** met tout ça au format
  commun (une colonne = un pas, l'annonce de ligne en tête de sa première colonne).
- **`etayage-conversion.ts`** — le tableau de conversion, frère du calcul posé : des
  RANGS, un chiffre par case, et un zéro qui tient une place. Un pas = **une colonne**.
  **`lireDansUnite(colonnes, i)`** porte la notion entière en une fonction (le même
  tableau donne « 3 » en kilomètres et « 3 000 » en mètres) et sert autant à retrouver le
  nombre donné qu'à énoncer la réponse ; **`conversionDepuisTableau(ex)`** tire la
  spécification de l'exercice RATÉ en déduisant l'unité de départ d'un invariant du
  générateur (le tableau couvre exactement l'empan de la paire convertie, l'unité
  cherchée est l'une de ses deux extrémités). La narration nomme l'unité de chaque
  colonne vide et ne dit JAMAIS « on ajoute des zéros » ni « on décale la virgule » —
  raccourcis qui marchent sur les entiers et cassent au premier décimal.
- **`etayage-droite.ts`** — le placement sur la droite graduée. Trois pas, jamais plus :
  la tâche est une décision perceptive, pas une accumulation, et la découper davantage
  produirait du bavardage (avis `pedagogue-primaire`). L'ordre est celui du raisonnement
  réel : ce que vaut une graduation (le fait numérique isolé de cette famille — l'échelle
  CHANGE à chaque item), d'où l'on part (**`borneAvant`**, le nombre écrit juste avant la
  cible, pas la borne de gauche), puis le comptage des sauts, avec son piège nommé. Le
  pas porte l'état de la FIGURE (`repere`, `parcours`), la droite n'ayant pas de case qui
  se remplit.
- **`etayage-position.ts`** — les quatre questions de numération, que le déroulé doit
  SÉPARER parce que les confondre est l'erreur même que ces leçons testent : `chiffre`
  (une lecture), `entout` (on masque tout ce qui est à droite du rang et on lit ce qui
  reste — dans 3 472, 34 centaines, et non 4), `rangs` et `multiplicative`. Le zéro
  intercalaire a sa phrase. Le générateur ne rendant qu'une chaîne déjà formatée (ni le
  nombre, ni le rang troué, ni le geste demandé n'en ressortent), ces leçons déroulent
  leur exemple CANONIQUE et non l'item raté — un exemple juste vaut mieux qu'un item
  deviné.
- **`etayage-conjugaison.ts`** — la forme conjuguée. Le risque propre à cette famille
  n'est pas de mal expliquer mais de **mentir** : le corpus ne stocke que des formes
  pleines, et découper au jugé fabriquerait des radicaux inventés (« pouvoir » en a trois
  au présent). Règle du module : **on ne raconte que ce qu'on a vérifié sur les six
  personnes** (`radicalCommun`, `decoupePasseCompose`) ; sinon le déroulé est vide.
  Aucune liste de verbes en dur — c'est le corpus qui décide. **Au présent**, un
  déroulé vide n'est plus synonyme de « pas de panneau » :
  `data/francais/conjugaison.ts:etayagePresentRedige` y substitue un texte RÉDIGÉ pour
  les onze verbes à radical supplétif (« je vais / nous allons » ne se fabrique pas —
  ce qui aide, c'est la mémorisation, pas une méthode) ; aux autres temps, un déroulé
  vide laisse encore la leçon sans rien (cas non rencontré dans le corpus actuel).
  Passé composé : uniforme (auxiliaire + participe ; un participe qui varie signale
  l'accord avec « être », qu'on nomme). Imparfait : terminaisons communes à tous, radical
  retrouvé par le « nous » du présent — « être » sort de la règle sans mystère (« nous
  sommes » ne finit pas par -ons) et on le dit. Futur : terminaison invariable, radical
  « à connaître » quand il ne se déduit pas de l'infinitif. Présent : rien à dérouler
  hors 1er et 2ᵉ groupes réguliers (croisés avec la terminaison de l'infinitif, un verbe
  en -ir conjugué comme le 1er groupe n'étant pas du 1er groupe).
- **`etayage-probleme.ts`** — le problème à étapes, seule famille dont la DONNÉE a dû
  s'élargir : `ProblemeEtape` ne portait qu'un intitulé et une réponse, de quoi réciter
  ce que la révélation (#467) montre déjà. Le `calcul?` ajouté (cf. `exercise.ts`
  ci-dessus) permet d'énoncer l'opération qui répond à chaque sous-question ; sans aucun
  calcul, le déroulé reste vide. Ce que le module ne prétend PAS faire : justifier le
  CHOIX de l'opération, qui demanderait la structure sémantique de l'énoncé (absente, et
  non déductible). Ce qu'il sait vraiment expliquer, il le dit — le **chaînage**
  (`etapeSource`) : quand une sous-question reprend le résultat d'une précédente, il le
  nomme, et c'est précisément ce qui se perd dans un problème à deux étapes. Ce lien est
  **déclaré** par le générateur (`deA`/`deB` sur `CalculEtape`), jamais retrouvé en
  comparant les valeurs : un opérande de l'énoncé qui vaudrait par hasard la réponse
  précédente serait annoncé comme en venant, et un résultat réutilisé transformé ne serait
  pas reconnu du tout.

Deux contenus, à ne pas confondre : les résolutions **générées** ci-dessus (du code) et
le texte **RÉDIGÉ** de la notion, écrit à la main dans le module de données de sa
leçon (`etayage?: EtayageEntree[]` sur `LessonInput`, remonté tel quel en `LessonDef`
par `toLessonDefs`, cf. `catalog.ts` ci-dessus) — pas de table centrale à cent
entrées, qui dériverait de la leçon qu'elle décrit et serait un nid de conflits.

**La dégradation est une propriété du dispositif, pas un manque.** Elle joue à trois
niveaux : pas d'entrée pour la leçon → pas de panneau ; entrée sans exemple montrable →
panneau réduit à sa règle et ses étapes rédigées (renvoi vers la leçon prérequise en
prime) ; et, dans chaque moteur, refus de raconter ce qui n'a pas été vérifié — c'est ce
refus qui prive de déroulé MÉCANISÉ les divisions avec reste, les durées (leur calcul ne
s'écrit pas en une opération : « 17 ÷ 5 » ne fait pas 3) et les onze présents à radical
supplétif (« je vais / nous allons » ne se fabrique pas). Ces trois familles gardent
malgré tout leur panneau, RÉDIGÉ plutôt que déroulé — jamais sans rien.

`core/items.ts` (Fondations ci-dessus) porte le tiers restant, PARTAGÉ par la grille
jouable et par la grille de DÉMONSTRATION du panneau : `dispositionPosee(spec)` /
`poseeGrilleHTML` et les attributs `data-pose-op/a/b` qu'elle pose sur la grille
jouable. La couche UI (`ui/etayage-panneau.ts` et les visuels par moteur de
`ui/etayage-visuels.ts`) est décrite dans [Rendu & interactions](ui.md).

## Hors-ligne, engagement & rappel de sauvegarde (#306)

- **`pwa-cache.ts`** — arithmétique **pure** du précache du service worker
  (`src/sw.ts`, cf. [Build & déploiement](build-et-deploiement.md)) :
  `cleCache` (clé de cache = URL + révision Workbox pour les fichiers à nom
  stable), `normaliserManifeste` (rebase des URL sous la base de publication +
  dédoublonnage des entrées du manifeste), `partitionner` (coquille immédiate
  vs shards de verbes différés), `manques`/`obsoletes` (ce qui manque encore au
  cache, ce qui n'appartient plus au build courant — seul mécanisme de purge)
  et `couverture` (present/total/complet). Aucune API navigateur : testable
  sans service worker, et importé **tel quel** par `src/sw.ts` — le seul module
  `core/` consommé par un contexte worker plutôt qu'une page, d'où son propre
  projet TypeScript `tsconfig.sw.json`.
- **`engagement.ts`** — `engagementReel()` répond à « quelqu'un se sert-il
  VRAIMENT de l'application ? », tous profils confondus. Piège explicitement
  évité : ne pas se fier à la simple existence d'un profil ou aux drapeaux du
  premier lancement (`ludaskia_tour_seen`, `ludaskia_parents_seen`,
  `ludaskia_eggs`), qui sont présents chez le visiteur de passage qu'on veut
  justement exclure. La détection cherche une **trace de travail** — l'enfant a
  répondu (`ludaskia_lessonStats`/`ludaskia_activity`), l'adulte a posé une
  décision (`ludaskia_revoir`/`ludaskia_seance`/`ludaskia_lessonVuAilleurs`, un
  aménagement de profil, une liste de dictée créée, ou la clé globale
  `ludaskia_encadrant_lock`). Consommé par le réchauffement du cache hors-ligne
  (`ui/pwa.ts`, cf. [Rendu & interactions](ui.md) — ne pas imposer 850 Ko à un
  visiteur qui ne reviendra pas) et par le rappel de sauvegarde ci-dessous.
- **`rappel-sauvegarde.ts`** — cadence de l'encart **« Pour les parents »** de
  l'accueil (rendu dans `ui/rappel-sauvegarde.ts`, cf. [Rendu &
  interactions](ui.md)). `doitAfficherRappel` cumule TROIS verrous : du risque
  réellement accumulé (`MIN_ACTIVITES` = 3 activités terminées, tous profils,
  depuis le dernier export), un délai depuis la première installation
  (`DELAI_PREMIER_JOUR_MS`, 48 h — laisse respirer le « mot aux parents » du
  premier lancement) et depuis le dernier export (`DELAI_MIN_EXPORT_MS`,
  7 jours — protège justement l'utilisateur ponctuel que la purge iOS menace).
  Par-dessus, un **report** croissant à chaque fermeture
  (`REPORTS_JOURS = [1, 3, 7, 14, 30]`, `reporter`/`delaiReportMs`) qui plafonne
  sans jamais désactiver le message — volontairement **aucune minuterie fixe**,
  le déclencheur reste le risque, le report n'est qu'un plancher.
  `apresExport` remet le compteur d'activités à zéro et le report au premier
  cran ; `compterActivites` lit `ludaskia_activity` par UUID sur tous les
  profils. État persisté sous la clé **globale** `ludaskia_sauvegarde`
  (`EtatRappel`, cf. [Données & profils](donnees-et-profils.md)), écrit par
  `enregistrerExport` (appelé depuis `core/profiles.ts:exportProfiles`).
  Module **feuille** (n'importe que `storage`) : les UUID de profils lui sont
  passés par l'appelant, jamais lus en important `profiles.ts`.

## Espace encadrant (logique pure)

- **`erreurs-journal.ts`** (#391, pur) — **journal des erreurs par profil**. Écriture sur
  le profil ACTIF (`journaliserErreur`, clé préfixée `ludaskia_erreurs`) ; lecture côté
  encadrant **par UUID sans bascule** (`chargerErreursFor`, même pattern brut que
  `loadRevoirFor` ci-dessous). `ErreurEntry` = `{ts, lessonId, mode, question, donnee,
  attendue}` (déjà des chaînes LISIBLES — le journal ignore les items/exercices), plus
  le marqueur **optionnel** `sansTentative?: true` (#467) : l'enfant a demandé à voir la
  réponse (« Je ne sais pas, montre-moi ») ou validé à vide, au lieu de répondre. Écrit
  **seulement** quand il est vrai (absent ⇒ tentative faite), pour que les journaux déjà
  stockés restent valides — `estErreurValide` ne l'**exige** pas, il n'en valide le type
  que s'il est présent.
  **Rétention** `MAX_ERREURS` (150) : purge des plus anciennes, la plus récente en tête
  (`ajouterErreur`, pur, testable sans stockage). **`grouperErreursParLecon`** regroupe par
  leçon (triée par **volume d'erreurs décroissant**, la récence de la dernière erreur ne
  départageant que les égalités, #519) et **dédoublonne** (même question + même
  réponse donnée + même `sansTentative`) en une entrée « vue N fois » — les banques QCM se
  répètent, pas la peine d'afficher N lignes identiques. Le marqueur entre dans la clé (et
  est propagé dans `ErreurAffichee`) : un item **passé** et le même item **raté** ne
  fusionnent pas en « vue 2 fois », ce qui mentirait au parent. Le total compté n'est que celui de la **période filtrée**
  (ci-dessous) : le classement se recalcule à chaque changement de fenêtre.
  **`filtrerErreursParPeriode(liste, periode, now)`** (#476)
  borne la liste sur `ts` AVANT ce regroupement, en jours CALENDAIRES locaux, aujourd'hui
  inclus (`PeriodeErreurs` : `'jour' | 'deux-jours' | 'semaine' | 'tout'`, ce dernier sans
  borne — seule la rétention `MAX_ERREURS` joue) ; **`periodeParDefaut`** choisit la fenêtre
  la plus serrée qui contient au moins une erreur, avec repli sur `'semaine'`
  (`PERIODES_REPLI`) si le journal est vide ou plus ancien. Consommé par
  `ui/encadrant-erreurs.ts` ; la capture au moment de la correction (mise en forme de
  l'énoncé) vit dans `ui/erreur-capture.ts`.
  **Couvre tous les runners** (fiche/QCM/QCM multi-sélection/sprint, tuiles de numération,
  rangement, tri, appariement, tableau de conversion, résolution de problèmes, « Clique sur
  le mot », dictée d'orthographe) **et la révision espacée** (`ui/revision.ts`, mode dédié
  `'revision'`, ses 10 formes d'item) — cf. [Espace encadrant](espace-encadrant.md).
- **`erreur-representation.ts`** (#391, pur) — mise en forme de la « réponse donnée /
  attendue » pour les formats **composites**, à partir des données brutes du runner
  (indépendant de `erreurs-journal.ts`) : **`analyserResultatPosee(cells)`** agrège les
  cellules-chiffres du RÉSULTAT d'UNE opération posée en une seule entrée (rien si la
  grille est vierge ou entièrement juste ; `donnee` reconstruit le nombre dans l'ordre
  des positions, ou `'(incomplet)'` si des cellules manquent) — consommé par
  `ui/session.ts:verify` ; **`ordreErreur(propose, ordre, nature?)`** joint une suite
  proposée/attendue par le séparateur de sa **nature** (#448, `separateurSuite` de
  `exercise.ts` : « , » pour des mots, « ; » pour des nombres — sinon le parent lisait
  « donné : 95, 104, 98 », avec l'ambiguïté virgule-décimale que le repli texte évite) —
  consommé par `ui/lecon-ordre.ts` ; **`motsMalClasses(mots,
  categories, placement)`** ne renvoie que les mots MAL classés d'un tri (colonne
  choisie vs bonne colonne, une entrée par mot) — consommé par `ui/lecon-tri.ts` ;
  **`nombreTableauSaisi(cells, answerUnit)`** relit les cases d'un tableau de conversion
  **dans l'unité cible** (chiffres jusqu'à la colonne demandée = partie entière, ceux
  d'après = partie décimale, virgule insérée à la bonne place) — consommé par
  `ui/lecon-tableau.ts` ; **`pairesErreur(liens, paires)`** restreint la réponse
  donnée/attendue d'un appariement aux **paires fausses** (jamais les correctes, même
  parti pris que `motsMalClasses`) — consommé par `ui/lecon-appariement.ts`. Les quatre
  formats composites (posée, ordre, tri, appariement) sont aussi rejoués par la révision
  espacée (`ui/revision.ts`), seule consommatrice à réutiliser cette mise en forme depuis
  DEUX runners distincts (leçon et révision).
  **Intercalation** (#446) : **`attendueIntervalle([min, max])`** rend la BANDE acceptée
  (« un nombre entre 450 et 465 », bornes exclues, grands nombres groupés) et
  **`attendueItem(item)`** l'applique dès qu'un `Item` porte `intervalle`, sinon renvoie
  `String(item.answer)` — un seul point de vérité pour les trois chemins qui journalisent un
  `Item` (`ui/session.ts:verify`, `ui/sprint.ts`, `ui/revision.ts:renderNum`). Sans ça le
  parent lisait « La bonne réponse : 457 » là où douze valeurs étaient acceptées, et croyait
  son enfant plus loin du but qu'il ne l'est. Les DEUX runners qui journalisent depuis une
  `RevItem`/`Exercise` de tuiles plutôt qu'un `Item` — `ui/lecon-tuiles.ts` (leçon en tuiles)
  et `ui/revision.ts:renderTuile` (révision en mode tuiles) — appellent directement
  `attendueIntervalle` (leur réponse est un libellé de tuile, pas un `Item`).
  **`items.ts:renderItem`** consomme la MÊME fonction pour poser **`data-attendue`** sur le
  champ dès que l'item porte un `intervalle` : le marqueur ✗ de la fiche
  (`ui/session.ts`) le préfère alors à `data-answer` et révèle la bande (« → un nombre entre
  450 et 465 ») au lieu d'un exemple isolé — dans le mode le plus joué. `data-answer` reste
  intact (clé de correction de repli quand l'item n'est plus en session, point d'appui des
  specs e2e). Enfin **`corrigeIntercalation(exemple, intervalle)`** rend la variante du
  **corrigé IMPRIMÉ** — « 457 ou tout nombre entre 450 et 465 », exemple groupé comme les
  bornes — posée par `renderItem` en `corrigeMode` : l'exemple seul faisait **barrer des
  réponses justes** par l'adulte qui corrige sur papier, alors que la fiche annonce
  « (plusieurs réponses possibles) ». Les trois formulations dérivent d'une seule
  mise en forme de la bande (fonction privée du module).
  **Question PASSÉE** (#467) : **`entreeTentativePassee({tentee, juste, donnee})`** décide
  s'il y a une entrée à écrire, et avec quel drapeau — rien de posé → `{donnee: '',
  sansTentative: true}` ; posé et faux → `{donnee, sansTentative: false}` ; posé et juste →
  `null` (on ne fabrique pas une erreur là où l'enfant avait bon). L'**ordre** des deux tests
  fait partie de la règle (« rien de posé » l'emporte sur « juste »). Les appelants ne
  fournissent que les **faits**, chacun avec SA comparaison : `core/probleme-etapes.ts`
  (`entreesEtapesPassees`, une case de problème), `ui/lecon-droite-graduee.ts`
  (`tentativePosee` + `journaliserPasse`, un repère placé) et `ui/lecon-qcm-multi.ts`
  (`journaliserPasseMulti`, une grille tout-ou-rien). La règle avait été **recopiée** dans
  ces deux runners — exactement la divergence que l'extraction du module problème devait
  empêcher.
- **`probleme-etapes.ts`** (#467, pur) — verdict d'**UNE sous-question** de problème, extrait
  de la correction DOM `ui/lecon-probleme.ts:corrigerEtapesProbleme` le jour où un second
  chemin en a eu besoin. **`etatEtape(saisie, attendu)`** rend trois états — `'vide'`,
  `'juste'`, `'faux'` — la virgule française étant tolérée (#255) et le test du VIDE passant
  **avant** la comparaison (`Number('')` vaut 0 : sans lui, une case vide serait « juste » sur
  une étape dont la réponse est 0) ; **`etapeJuste`** est le raccourci du chemin de correction
  ordinaire (deux issues à peindre) et **`attenduEtapeTexte(attendu)`** écrit la réponse
  attendue à la française (« 4,5 »), affichée à côté de la case dans les deux chemins.
  **`entreesEtapesPassees(etapes, saisies)`** en dérive ce qu'un problème **passé**
  (« Je ne sais pas, montre-moi ») laisse au journal encadrant, sous-question par
  sous-question : case vide → entrée `sansTentative` sans réponse donnée, case remplie et
  fausse → **vraie** entrée d'erreur avec ce que l'enfant avait écrit, case remplie et juste →
  **aucune** entrée. Journaliser « n'a pas essayé » sur toutes les cases d'un problème
  partiellement rempli était faux — et le journal est ce que le parent lit. La règle des trois
  cas elle-même n'est PAS écrite ici : elle vient de `erreur-representation.ts:
  entreeTentativePassee` (ci-dessus), partagée avec la droite graduée et le QCM multi ; ce
  module ne traduit que l'état d'une CASE en faits. Consommé par
  `ui/lecon-probleme.ts` (`corrigerEtapesProbleme`, `revelerEtapesProbleme`), donc par le
  runner de leçon ET par la révision espacée, qui appellent ces deux fonctions.
- **`catalogue-arbre.ts`** (#556, pur) — **arbre du catalogue pour la SÉLECTION d'une
  leçon côté adulte**, sans stockage ni DOM (le rendu vit dans `ui/selecteur-lecon.ts`).
  `arbreCatalogue(profile, opts)` → `MatiereArbre[]` (matière → catégorie → leçons)
  applique un **`FiltreNiveau`** (`'sa-classe' | SchoolLevel` — « sa classe » n'est pas un
  niveau pré-résolu : elle se lit PAR MATIÈRE via `niveauProfilMatiere`, un enfant pouvant
  suivre des classes différentes selon la matière) et une recherche (`cleRecherche`
  ci-dessus, sur le libellé de la leçon ET celui de sa catégorie). Contrairement aux points
  d'exposition existants (`getLessonsBySubject`, `lessonsForLevel`), qui filtrent
  STRICTEMENT sur le niveau du profil, cette vue ne filtre pas par défaut : le niveau y est
  un FILTRE qu'on choisit, jamais une frontière. `jetonsNiveau(profile, lessons?)` calcule
  la barre de jetons du sélecteur — « Sa classe » puis un jeton par niveau **pourvu en
  contenu** (dérivé de `availableLevels`, jamais d'une liste de classes en dur), dédupliqué
  seulement pour un profil MONO-niveau (sinon « Sa classe » et un jeton nommé diraient tous
  deux « CM1 » alors que retirer ce dernier rendrait le CE2 d'une autre matière
  inatteignable). La classe D'ORIGINE d'une leçon pour un profil (`origineLecon`), elle,
  reste dans `encadrant-stats.ts` ci-dessous : l'y déplacer créerait un cycle d'imports
  entre les deux modules. **`tronquerArbre(arbre, limite)`** (#571) borne un arbre déjà
  construit aux `limite` premières leçons, dans l'ordre où il les présente, et renvoie à
  part le nombre laissé de côté (`restant`) ; catégories et matières vidées par la borne ne
  sont pas rendues, et `total` est recalculé sur ce qui reste — le compte affiché doit
  décrire ce qu'on voit, pas ce que la recherche a trouvé. Réservé à l'usage **sous
  recherche** du sélecteur (`ui/selecteur-lecon.ts`, ci-dessous), où l'arbre est déplié
  d'office et chaque leçon rendue est un bouton dans l'ordre de tabulation (SC 2.4.1, même
  motif que la banque de mots) : hors recherche, les groupes restent repliés et rien n'a
  besoin d'être borné. `limite <= 0` vaut « pas de borne ».
- **`encadrant-stats.ts`** (#234, pur) — lecture de la progression **par UUID sans
  bascule** (`progressionProfil`, `niveauProfilMatiere`) ; réexporte l'échelle de maîtrise
  (`niveauNotion`/`tendanceNotion`, définie dans `maitrise.ts`) pour les imports
  historiques, **activité** et **file « à revoir »** (`loadRevoir`/`loadRevoirFor`/
  `toggleRevoirFor`/`revoirActives`/`epingleesProfil`/`purgeRevoirSolides`/
  `retraitsAutoProfil`). Lit les clés brutes du profil consulté.
  **Position d'une leçon par rapport à la classe suivie (#556)** : `origineLecon(lesson,
  profile)` → `OrigineLecon {niveau, direction}` — `niveau` est celui où la leçon sera
  RÉELLEMENT jouée et stockée pour ce profil (`effectiveLevel` sur la classe suivie de sa
  matière, le même que `niveauStockage` côté `progress.ts`), **`direction: DirectionNiveau`**
  (`'en-dessous' | 'classe-suivie' | 'au-dessus'`) compare ce niveau à la classe suivie et
  commande le RÉGIME d'affichage de la ligne — jamais écrit en toutes lettres à l'écran (cf.
  [Espace encadrant](espace-encadrant.md) pour les trois régimes).
  **`RecapProfil.etoilesParNiveau`** (#556) ajoute au récap les étoiles cumulées PAR CLASSE
  (`progress.ts:etoilesParNiveau` appliqué à la carte brute d'étoiles du profil, cf.
  [Niveaux scolaires](niveaux-scolaires.md)) — contrepartie adulte du « trésor » unique de
  l'enfant, sans lecture de plus (la carte brute est déjà en main).
  **État affiché sur une épinglée (#518, révisé #556)** : `EpingleEntry` porte
  **`origine: OrigineLecon | null`** (`null` pour une liste de dictée du parent, non taguée
  par niveau) et **`etat: EtatEpingle`** — `{kind:'acquisition', niveau}` pour une cible de
  la classe suivie ou d'une classe EN DESSOUS (lue au niveau de STOCKAGE de la cible via
  `etatLeconAuNiveau`, un état d'acquisition ordinaire), `{kind:'essai', essaye, at, reussi}`
  pour une classe AU-DESSUS (compte-rendu FACTUEL — essayée/réussie ou non — jamais un cran
  d'acquisition, qui mentirait sur une notion pas encore enseignée), ou `null` faute d'état
  disponible. Les deux sont calculés par `epingleesProfil`, là où le niveau de la cible est
  déjà connu — jamais déduits d'un état absent, qui pourrait diverger en silence. Une
  épingle hors classe n'est plus INERTE comme avant #556 (l'ancien champ `horsNiveau` et la
  fonction `niveauEpingle` ont disparu) : `revoirActives` ci-dessous la traite désormais
  normalement.
  **`revoirActives(dicteeDispo)`** ne filtre plus sur le niveau (#556, ferme #535 comme
  sous-cas) : une leçon d'une autre classe que celle suivie y est rendue comme les autres,
  lue à son niveau de STOCKAGE via `scopeStockage`/`loadStarsStockage`/
  `loadLessonStatsStockage` (`progress.ts`, cf. [Niveaux scolaires](niveaux-scolaires.md))
  plutôt que via la vue scopée `scopeActif` habituelle — sans ce changement de lecture, une
  leçon assignée hors classe paraîtrait éternellement « jamais travaillée » et ne
  quitterait jamais la boucle. `epingleesProfil(profile, dicteeDispo)` lit la MÊME vue.
  **Désépinglage automatique** (#465) : `purgeRevoirSolides(profile, dicteeDispo, now)`
  retire pour de bon de `ludaskia_revoir` les entrées redevenues solides, avec
  EXACTEMENT le critère de `revoirActives` (leçon étoilée ou perf récente ≥
  `SEUIL_REVOIR`, liste de dictée « acquise » — cette dernière exigeant en plus
  `dicteeDispo`, sans quoi l'« acquis » serait trop facile pour justifier un retrait
  définitif ; le filtre d'affichage, réversible, peut se permettre ce laxisme, pas la
  purge). Une entrée n'est candidate que si elle a été **vue fragile depuis qu'elle est
  épinglée** (mémoire `ludaskia_revoirFragile`) : une leçon épinglée alors qu'elle était
  **déjà** solide n'est jamais retirée d'office — sinon « épingler n'importe quelle
  leçon, même acquise » deviendrait intenable et un ré-épinglage manuel ne tiendrait
  pas. Clé de marques **ABSENTE** (premier passage) → toute la file existante est
  candidate, ce qui purge d'un coup les fantômes accumulés avant #465. Chaque retrait
  est journalisé (`ludaskia_revoirAuto`, borné à 10 entrées et 30 jours, libellé **figé**
  à l'instant du retrait) et relu par `retraitsAutoProfil(profile, now)` (une entrée
  ré-épinglée depuis n'y figure plus). Écritures **brutes** (`lsSetRaw`, sans bump
  `updatedAt` — cf. [Données & profils](donnees-et-profils.md)) : un nettoyage
  automatique ne doit pas fausser la fusion par récence de l'export/import. Appelée par
  `ui/a-revoir-card.ts` (accueil enfant) et `ui/encadrant.ts:tabPanelHTML` (AVANT le
  calcul du récap, pour tous les onglets) — cf. [Espace
  encadrant](espace-encadrant.md).
  **Motif du retrait (#571)** : `RetraitAuto` porte en plus **`motif?: MotifRetrait`**
  (`'maitrise' | 'essai'`), calculé par `etatEpingle` (la même fonction interne qui juge la
  solidité) et FIGÉ à l'instant du retrait, pour la même raison que `label` : la trace
  explique un événement PASSÉ, décidé sous la classe suivie de ce moment-là, pas à recalculer
  au fil des changements de classe. `'essai'` quand la cible venait d'une classe SUIVANTE
  (leçon : `origineLecon(...).direction === 'au-dessus'` ; dictée prédéfinie : absente du
  filtrage cumulatif au niveau du profil), `'maitrise'` sinon — **le prédicat de retrait
  reste identique dans les deux cas** (même `solide`), seul ce que la trace ANNONCE diffère
  (cf. [Espace encadrant](espace-encadrant.md)). `loadRetraitsAuto` tolère l'absence de
  `motif` (entrées d'avant #571) mais écarte l'entrée entière si sa valeur est inconnue,
  plutôt que de la lire comme `'maitrise'` par défaut.
  Le graphe d'activité (#319) repose sur **`activiteParJourParType(activity, now, n)`** → `JourActivite[]`
  (`{total, lecon, bilan, sprint, revision, dictee, inconnu}`, index `n-1` = aujourd'hui ; `normalizeActivity`
  y est l'**unique frontière de normalisation** de l'ancien/nouveau format) ; `activiteParJour`
  en est **dérivé** (totaux seuls) et `echelleActivite(max)` calcule une échelle Y « ronde »
  (`{top, step, ticks}`). `RecapProfil.activite7j` est désormais un `JourActivite[]`.
  **Frise d'états par leçon** (#521, remplace la frise par matière de #397) :
  `friseNotion(paliers, firstSeen, niveau, debutSuivi, now)` → `FriseNotion | null`
  (`{semaines: CelluleFrise[], enCoursDepuis, acquisDepuis}`) reconstruit, semaine par
  semaine sur **12 semaines** (`SEMAINES_FRISE`), l'état atteint par **une** leçon depuis
  son journal `PaliersNotion` (`ludaskia_paliers`) ; `CelluleFrise` = `'inconnu' |
  'a-decouvrir' | 'non-acquis' | 'en-cours' | 'acquis'`. Une cellule ne vaut que **l'état
  le plus haut atteint à cette date** (`PaliersNotion` ne date que les montées, jamais les
  redescentes) : l'état RÉEL du jour vient de `RecapNotion.niveau`, et un écart entre les
  deux EST le signal de recul. Renvoie `null` seulement pour une leçon jamais travaillée
  (`niveau === 'a-decouvrir'` ET aucun cap daté) : rien à tracer.

  **`debutSuivi`** (`debutSuiviPaliers(depuis, paliers)`) est une borne calculée **UNE
  fois par profil**, pas par leçon : le plus ancien entre `PALIERS_DEBUT_KEY`
  (`ludaskia_paliersDepuis`, posée par `marquerDebutSuivi` — appelée par TOUTE session
  finalisée via `recordActivity`, donc aussi révision espacée et dictée, et par
  `recordMonteesPalier` pour la session sans aucune question, cf. `progress.ts` ci-dessus)
  et le franchissement daté le plus ancien du profil (qui PROUVE
  que le journal tournait déjà, et fait donc foi contre une borne posée tardivement) ;
  `Infinity` si le profil n'a ni l'un ni l'autre. Appliquée à toutes les leçons de la même
  façon, elle remplace l'ancienne règle (avant cette correction) qui jugeait une leçon
  « connue de bout en bout » dès qu'une `LESSON_FIRST_SEEN_KEY` (#178) existait : #178
  précédant le journal des paliers (#397), deux leçons voisines travaillées la même
  semaine pouvaient alors suivre deux règles différentes, départagées par la version de
  l'appli au moment du premier passage. Désormais une première rencontre ne vaut
  `'a-decouvrir'` que si sa **semaine** (`debutSemaine`) tombe à `debutSuivi` ou après ;
  sinon, ou sans borne connue, les semaines correspondantes restent `'inconnu'`.

  **« à renforcer » (`'non-acquis'`) n'est jamais daté** (entrer sous 40 % n'est pas un
  progrès de maîtrise, cf. `maitrise.ts`) mais se **DÉDUIT**, ce qui repose sur un
  invariant : depuis `debutSuivi`, **tout** chemin qui écrit des stats de leçon journalise
  aussi ses franchissements — depuis PR #540 c'est `recordLessonStats` qui s'en charge
  **lui-même** (cf. ci-dessus), l'invariant est donc STRUCTUREL et non plus laissé à la
  vigilance de chaque appelant — un horodatage absent signifie donc « aucune montée
  observée »,
  et les semaines suivies sans cap daté valent `'non-acquis'`. C'est le second défaut
  corrigé : la version précédente escamotait ce palier, laissant sans frise les leçons
  n'ayant jamais dépassé 40 % — les plus fragiles, donc celles qui intéressent le plus
  l'adulte. Sans aucun cap daté du tout, l'état COURANT (`niveau`) tient lieu de plancher
  depuis `debutSuivi` (l'échelle ne redescend jamais d'elle-même), ce qui donne aussi une
  frise à une leçon acquise **avant** la mise en service du journal.

  **La révision espacée alimente désormais les stats de leçon** (#541) : dès qu'une session
  rejoue au moins un item du catalogue (distinct des mots d'orthographe, cf. ci-dessous),
  `ui/revision.ts` appelle `recordLessonStats(perLesson, 'revision')` en fin de session,
  exactement comme une leçon jouée seule — étoile, performance récente ET franchissement de
  palier en découlent donc de la même façon, la frise rattrapant la semaine sans attendre
  qu'une leçon soit relancée ailleurs. Une session composée UNIQUEMENT de mots d'orthographe
  n'a aucune stat de leçon à écrire (`recordSessionActivity('revision')` journalise alors
  seule l'activité) ; ces mots suivent leur propre trajectoire, cf. « Frise d'une LISTE de
  dictée » ci-dessous. Ce câblage n'était possible qu'une fois la fenêtre comptée en
  questions (ci-dessus) : un item de révision, isolé, aurait sinon pesé un essai entier.

  **Invariant** : les cellules `'inconnu'` forment TOUJOURS un préfixe de la rangée (une
  rangée commence par `'a-decouvrir'` ou par `'inconnu'`, jamais les deux) — une cellule
  sans rang au milieu dessinerait un creux que la hauteur ferait lire comme une régression.
  Et une frise dont **toutes** les semaines seraient `'inconnu'` n'est pas rendue du tout
  (`null`, donc la ligne retombe sur sa puce d'état et son mot) : douze blocs creux
  n'apprennent rien et se lisent comme un défaut d'affichage. Le cas n'est pas théorique,
  c'est l'état de toutes les listes de dictée d'un profil existant le jour où leur journal
  entre en service (#541).

  `lundiDecale(now, semainesAvant)` décale en **jours calendaires** (`debutJourLocal`)
  plutôt que par pas fixe de 7 × 24 h, qui dérivait d'une heure autour d'un changement
  d'heure. `aChangeRecemment(frise)` dit si la frise montre un changement : ≥ 2 états
  distincts **lus sur les cellules**, OU un seul état connu précédé de semaines `'inconnu'`
  **si son franchissement est daté** (`enCoursDepuis`/`acquisDepuis` non nuls) — sans cap
  daté, ce qui a changé est le SUIVI et non l'enfant. **Ce compteur ne se lit donc plus
  entièrement sur le dessin** (les cellules `'inconnu'` étant rendues comme « à découvrir »,
  cf. `styles/encadrant.scss`) : deux rangées au tracé identique (semaines `'inconnu'` puis
  un seul état) peuvent répondre différemment selon qu'un cap est daté ou non, un dessin ne
  pouvant pas montrer un franchissement dont les semaines antérieures restent inconnues.

  Nouveaux champs `RecapNotion.frise`, `RecapListeOrtho.frise` (#541, cf. ci-dessous) et
  `RecapMatiere.changementsRecents` (compte de notions ayant changé, roll-up par matière) ;
  `RecapProfil.frises` a disparu. Détail du rendu dans [Espace encadrant](espace-encadrant.md).

  **Frise d'une LISTE de dictée** (#541, pendant du bloc ci-dessus) :
  `friseListeOrtho(paliers, niveau, debutSuivi, now, premiereSeance)` réutilise la même boucle
  de cellules (`cellulesFrise`, factorisée avec `friseNotion`) sur un journal DÉDIÉ
  (`ORTHO_PALIERS_KEY`/`ORTHO_PALIERS_DEBUT_KEY`, `core/orthographe/paliers.ts`, cf. [Données
  & profils](donnees-et-profils.md)), écrit par `journaliserPaliersOrtho(dicteeDispo, now)` en
  fin de dictée (`ui/ortho-runner.ts`) ET de révision espacée (`ui/revision.ts`, qui rejoue
  aussi des mots — toutes les listes contenant un mot rejoué sont réévaluées, pas seulement
  celle jouée). Déduction propre aux listes : l'échelle n'a que 3 niveaux (pas de « à
  renforcer », cf. `orthographe/progression.ts`), donc une semaine suivie avant le 1er cap
  « en cours » ne peut avoir été que « à découvrir » — la frise d'une liste ne montre de creux
  (`'inconnu'`) qu'AVANT sa borne de suivi, jamais après, à la différence de celle d'une leçon
  qui reste dans le doute sur ses semaines non datées.

  **Amorçage par l'historique de dictée** (#541) : sans lui, un profil déjà actif au moment où
  ce journal entre en service n'a AUCUNE donnée datée pour ses listes déjà travaillées — le
  cas qui déclenche justement l'invariant « toutes `'inconnu'` → pas de frise » ci-dessus, pour
  chacune de ses listes. `premieresSeancesDictee(activityRaw)` (pure) relit `ludaskia_activity`
  et rend, par id de liste, l'horodatage de sa 1re séance `{k: 'dictee', ref}` (#498) — une
  PREUVE que la liste était « en cours » à cette date, déjà stockée, pas une reconstitution.
  `friseListeOrtho` s'en sert comme cap « en cours » quand le journal n'en a pas de plus
  ANCIEN (l'amorce prime, sinon la première séance jouée sur la nouvelle version écraserait
  l'histoire connue) et comme BORNE DE SUIVI propre à cette ligne (avant cette séance, rien
  n'est prouvable) — à la condition que le sommet accessible soit « en cours » ou un « acquis »
  déjà daté par le journal (`sommetAtteignable`) : l'amorçage ne date **jamais** une
  acquisition, faute de le pouvoir depuis le seul stockage, et une liste maîtrisée avant ce
  journal reste donc sans frise jusqu'à sa PROCHAINE séance. Deux limites supplémentaires : le
  journal d'activité est borné aux `ACTIVITY_MAX` (200) dernières séances et ne porte de `ref`
  que depuis #498 ; une liste travaillée seulement en révision espacée n'y a aucune entrée à
  son nom (un tour de révision ne référence aucune cible unique, cf. `progress.ts` ci-dessus).
  Consommée par `listesOrthoProfil` → `RecapListeOrtho.frise`, rendue par la même
  `friseNotionHTML` que les leçons (cf. [Espace encadrant](espace-encadrant.md)).
  **Travaillé récemment** (#520) : `travailRecent(statsRaw, activityRaw, ortho, jours, now)`
  → `GroupeTravail[]` (`{subject, label, cibles: CibleTravaillee[]}`, un groupe par matière
  dans l'ordre de `SUBJECTS`) et son lecteur de stores `travailRecentProfil(profile, jours,
  now)` (mêmes clés brutes par UUID que `progressionProfil`). Chaque `CibleTravaillee`
  combine deux sources : l'**appartenance** à la fenêtre vient de `lastAt` (tous chemins
  confondus, leçon seule/bilan/sprint), le **compte de séances** (`seances`) vient de la
  `ref` du journal d'activité posée depuis #498, et vaut `null` (jamais `0`) quand la leçon
  n'a été vue qu'en bilan ou en sprint, qui ne référencent pas une cible unique. Les dictées
  sont collectées depuis le SEUL journal d'activité (`kind: 'dictee'` sur `CibleTravaillee`,
  une DONNÉE plutôt qu'un libellé dérivé). **Aucun filtre de niveau** — à la différence des
  notions par catégorie (et de leur frise) ci-dessus, scopées au niveau actif de la matière :
  ce qui a été travaillé doit être nommé quel que soit le
  niveau où c'est rangé (`@niveau`) ; une leçon travaillée sous deux niveaux porte deux clés
  de stats mais n'est dédoublonnée qu'en une ligne, datée de la plus récente des deux. Détail
  du rendu dans [Espace encadrant](espace-encadrant.md).
  **Récap du mode Révision espacée** (#423) : `revisionProfil(profile, now)` → `RecapRevision`
  projette la file de répétition espacée (`revision.ts`, #45) du profil consulté — palier
  courant + échéance relative par entrée (`libellePalier`/`libelleEcheanceRevision`), groupée
  par catégorie (`GroupeRevision`), triée par urgence (`parUrgence`) et regroupée **par palier**
  (`parPalier: PalierRevision[]`, #555 — les étages de l'escalier de répétition espacée, du
  moins ancré au plus ancré, étages vides omis) ; même filtre de niveau actif que la frise.
  `etagePalier` **borne et TRONQUE** (`Math.floor`, pas `Math.round`) l'index de chaque entrée
  vers son étage — c'est ce qui rend l'étage sommital strictement équivalent à `estAcquis`
  (un arrondi rangerait une entrée à 5,5 sous « Acquis » tout en la laissant en rotation) ;
  `libellePalier` borne aussi son index, pour ne plus produire « Palier : NaN mois » sur un
  palier corrompu en stockage (négatif, fractionnaire, hors plage). Détail dans [Espace
  encadrant](espace-encadrant.md).
- **`encadrant-lock.ts`** (#234) — verrou optionnel de l'espace encadrant : PIN haché
  (SHA-256 `crypto.subtle`) + récupération par secret (GUID) ; clé GLOBALE
  `ludaskia_encadrant_lock` (`pinActif`/`definirPin`/`verifierPin`/`reinitViaRecuperation`/
  `desactiverPin`).
- **`seance.ts`** (#440, pur) — **programme du jour** composé par l'encadrant : modèle
  (`SeanceDef`/`SeanceEtape`/`SeanceRecurrence`, cf. [Modes &
  navigation](modes-et-navigation.md)), stockage **par profil actif** côté enfant
  (`chargerSeances`) et **par UUID sans bascule** côté encadrant
  (`chargerSeancesFor`/`enregistrerSeancesFor`, qui bumpe `updatedAt` via
  `profiles.ts:touchProfile` puisqu'il contourne le hook `onDataWrite`),
  **résolution de la définition applicable** aujourd'hui (`defApplicable`, une date
  ponctuelle l'emporte sur l'hebdo) et **reset paresseux** de l'état du jour à minuit
  (`etatSeanceJour`, calculé à la lecture, comme le défi du jour) — un état périmé est
  **archivé** avant d'être remis à zéro (`chargerJournalSeances`/
  `ludaskia_seanceJournal`, y compris une réalisation **partielle**). **Étape « dictée »
  en pool** (#463) : `SeanceEtape.refs?: string[]` porte un pool de dictées visées (l'ancien
  `ref?: string` — une cible unique — reste lu pour la rétrocompat des programmes déjà
  configurés) ; `ciblesEtape(etape)` normalise les deux formes, `ciblesValides(etape,
  disponibles)` écarte les cibles devenues introuvables (liste supprimée, hors niveau) et
  `tirerParmi(pool, rand?)` (généralisé #464, `rand` injectable pour un tirage
  déterministe en test) tire un élément au hasard dans un pool déjà filtré ;
  `tirerCible(etape, disponibles, rand?)` l'applique au pool de dictées d'une étape — 1
  cible ⇒ toujours la même, 2+ ⇒ tirage à chaque lancement.

  **Une étape « une leçon précise » NAÎT SANS CIBLE (#556)** : depuis que la cible se
  choisit dans tout le catalogue (cf. `catalogue-arbre.ts`/`ui/selecteur-lecon.ts`
  ci-dessus/[`ui/`](ui.md)), il n'y a plus de « première leçon » évidente à présélectionner
  — ce serait poser une consigne que l'adulte n'a pas donnée. **`etapeConfiguree(etape)`**
  (pure, ne dépend que de la DÉFINITION, contrairement à `etapeApplicable` ci-dessous qui
  regarde aussi le contexte du jour) répond `!!etape.ref` pour une leçon, `true` pour tout
  autre type : une étape non configurée ne compte ni dans le nombre d'activités du
  composeur ni dans `estimationDureeMin` (elle disparaîtra au lancement, la compter
  promettrait un temps que l'enfant ne passera pas), et `etapeApplicable` l'escamote du
  programme au même titre qu'un « à revoir » sans rien d'épinglé — un programme ne peut pas
  porter une étape VIDE qui bloquerait sa complétion (#464).

  **Étapes CONDITIONNELLES « à revoir » (#464)** : le mode `aRevoir` puise dans la file
  épinglée par l'encadrant (`ludaskia_revoir`, cf. [Espace encadrant](espace-encadrant.md)),
  que le cœur ne peut pas lire seul (l'« acquis » d'une dictée dépend de la disponibilité
  du TTS, connue de l'UI seule) : l'appelant fournit un `ContexteSeance` (enrichi #498 :
  `{aRevoirLecons: string[], aRevoirDictees: string[]}` — ids BRUTS des entrées épinglées
  encore à travailler, **par nature** plutôt qu'un simple compte ; `CONTEXTE_VIDE` =
  défaut PRUDENT « rien d'épinglé »). Ces deux listes servent autant à
  l'**applicabilité** de l'étape (`etapeApplicable(etape, ctx)`, seule `aRevoir` est
  conditionnelle) qu'à **reconnaître, dans le journal d'activité, quelle épinglée vient
  d'être travaillée** (`etapeSatisfaite` ci-dessous).

  **Une étape déjà travaillée reste comptée (#498)** : `etapesEnJeu(def, jour, ctx)`
  garde, en plus des étapes applicables aujourd'hui, celles **déjà faites** dans la
  journée même si elles ont cessé de s'appliquer depuis (une épinglée réussie quitte
  aussitôt la file épinglée) — sans quoi l'enfant lisait « rien de fait » juste après
  avoir fait. Une définition dont **aucune** étape n'est en jeu vaut « pas de programme »
  (`vueSeanceDuJour` renvoie `null`), jamais une étape vide affichée. `requisJour(etape,
  jour, ctx)` en tire l'exigence du jour : une étape non applicable mais déjà faite voit
  son exigence ramenée à ce qu'elle a reçu, pour que le programme puisse se terminer.

  **Attribution sur ce qui a été fait, pas sur le bouton pris (#498)** :
  `etapeSatisfaite(etape, activite, epinglees)` est la SOURCE UNIQUE de « ce que vaut »
  une entrée du journal d'activité (`ActivityEntry`, cf. `progress.ts` ci-dessus) pour
  chaque mode — un sprint/une révision vaut son étape par le seul TYPE ; une leçon/dictée
  dont l'`ActivityEntry.ref` correspond vaut l'étape `lecon`/`dictee` ; n'importe quelle
  leçon vaut « Leçon du jour » (elle change dès qu'elle est réussie, incomparable après
  coup) ; une leçon/dictée dont la référence figure dans `epinglees` vaut « à revoir ».
  `resoudreProgramme(now, ctx?)` (remplace l'ancien `resoudrePending`) relit, à chaque
  appel, les sessions du journal **postérieures à un curseur** (`SeanceJour.vuTs`, avancé
  à chaque passe — idempotent), et attribue chacune à la meilleure étape restante
  candidate via `etapeSatisfaite`, arbitrée **du plus spécifique au plus large**
  (constante `SPECIFICITE` : `lecon`/`dictee` > `aRevoir` > `leconDuJour` >
  `sprint`/`revision`) si plusieurs conviendraient — sauf si le marqueur `pending`
  désigne explicitement l'une des candidates, auquel cas il tranche. Le marqueur posé par
  `marquerEtapeLancee(etapeId, now, ref?)` au lancement d'une étape depuis le programme
  n'est donc plus ce qui ouvre le droit au crédit : il ne sert qu'à **dater** l'étape
  (durée réelle, métrique) et à **lever une ambiguïté**. Le mémo `SeanceJour.aRevoirVus`
  (union des contextes observés au fil de la journée) garde la trace des épinglées
  **vues** aujourd'hui, y compris après qu'une session les a fait sortir de la file
  courante — sans lui, une notion réussie via « à revoir » redeviendrait méconnaissable
  dès l'instant suivant.

  `VueSeance.complete` reste **dérivé** (« plus rien à faire » parmi les étapes en jeu),
  tandis que `SeanceJour.complete` reste la mémoire **monotone** de la récompense déjà
  attribuée (ne redescend jamais, même si une étape réapparaît en cours de journée) ;
  `acterCompletion` (interne, appelée à chaque passage de `resoudreProgramme`) l'acte dès
  que toutes les étapes en jeu sont satisfaites — qu'une session vienne tout juste d'être
  créditée ou que ce soit le **contexte** qui ait fait disparaître la dernière étape
  restante (#464). Un seul appel couvre donc les deux cas : `consoliderCompletion` et
  `etapesApplicables` ont disparu. `seancesCompletees` (compteur cumulé) alimente le
  trophée dédié (cf. [Gamification](gamification.md)). Consommé côté enfant par
  `ui/seance.ts` (porte d'entrée unique `vueProgramme`, cf. [`ui/`](ui.md)) et côté
  encadrant par `ui/encadrant-seance.ts`.
- **`vu-ailleurs.ts`** (#478, pur) — l'adulte déclare, pour le profil **consulté**,
  une leçon travaillée **hors de l'application** (rattrapage à l'arrivée sur l'appli,
  notions vues en classe après un changement de niveau). Carte **dédiée**
  `ludaskia_lessonVuAilleurs` (`Record<'lessonId@niveau', true>`, cf. [Données &
  profils](donnees-et-profils.md)), namespacée par niveau comme les autres cartes de
  progression : `declarerVuAilleursFor(uuid, entrées, vu, now)` écrit par UUID (jamais
  le profil actif) et bumpe `updatedAt` via `touchProfile` (l'écriture par UUID
  court-circuite `onDataWrite`). ⚠️ Cette carte NE remplace PAS
  `progress.ts:LESSON_FIRST_SEEN_KEY` (date de 1er passage) — deux sources distinctes,
  réunies **uniquement** dans `sprint-scope.ts` (cf. ci-dessus). Effet sur la révision
  espacée : `declarerVuAilleursFor` appelle la variante par UUID de l'entrée en
  rotation (`progress.ts:enterLessonsRevisionFor`, même comportement standard qu'un
  vrai passage — état neuf, 1er re-test à J+1) ; à l'annulation,
  `progress.ts:retirerRevisionsDeclareesFor` ne retire l'état SR **que** s'il n'a
  jamais été re-testé (`dernierTest === null`) **et** que la leçon n'a aucune
  statistique dans l'appli — on ne détruit jamais un progrès issu d'un vrai passage,
  on ne défait que ce que la déclaration avait créé. **Modèle de l'écran adulte**
  (`categoriesDeclarables(uuid, niveauDe)`, aucun DOM) : parcourt `CATEGORIES` comme
  le récap de progression et donne, par catégorie, chaque leçon avec son état
  (`declaree`/`jouee`) et trois compteurs (`declarables`, `declarees`, `rencontrees` =
  jouées ∪ déclarées, comptées une seule fois) ; une leçon déjà **jouée** dans l'appli
  est exclue des `declarables` (la déclarer n'ajouterait rien). Consommé par
  `ui/encadrant-reglages.ts` (cf. [Espace encadrant](espace-encadrant.md)).
