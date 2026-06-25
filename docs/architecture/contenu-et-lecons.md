[← Architecture Ludaskia](../ARCHITECTURE.md)

# Contenu & leçons (`src/data/`)

Contenus statiques en TypeScript (`as const`-friendly), une arborescence par
matière. L'**ordre pédagogique** des leçons (#208) y vit aussi, à plat :
**`ordre-pedagogique.ts`** (`ORDRE_LECONS[matière][niveau]`, exploité par
`core/ordre.ts`). Dossier `francais` sans cédille pour des chemins d'import ASCII
portables ; le libellé affiché reste « Français ».

> Les leçons sont regroupées ci-dessous par **Matière → Catégorie**. Le moteur
> partagé (`core/`) et les runners (`ui/`) sont décrits dans
> [Logique pure](core.md) et [Rendu & interactions](ui.md).

## Français

### Grammaire

#### `francais/grammaire-sujet.ts` (#115)

catégorie **Grammaire**, 2 leçons QCM —
**« Le pronom sujet »** (`fr-gram-pronom-sujet` : « mes amis et moi » → nous) et
**« L'accord du verbe avec le sujet »** (`fr-gram-accord-sujet-verbe` : « les oiseaux
(voir) » → voient). Chaque sujet (`SUJETS`) est mappé à une **personne** (0–5) ; la
forme conjuguée est **lue depuis `VERBS`/`getVerb`** (base de conjugaison, présent),
jamais codée en dur. Paires sujet+verbe curées (animaux limités aux verbes
plausibles), distracteurs d'accord = autres formes réelles du présent.

#### `francais/classes-mots.ts` (#116)

catégorie **Grammaire**, leçon **« Classes de
mots, articles, adverbes »** (`fr-gram-classes`). QCM d'étiquetage, 3 sous-types
(classe nom/verbe/adjectif ; article le/la/les ; repérer l'adverbe dans une phrase),
sur une **banque interne étiquetée** (jamais les listes du parent). Un builder unifie
les 3 types en items QCM. Relue par l'agent pédagogue.

#### `francais/phrases.ts` (#204)

rubrique **« Les phrases »**, 2 leçons QCM (exclues du sprint) : **« Quel point à la
fin ? »** (`fr-gram-ponctuation` — choisir `.`, `?` ou `!` ; variante de présentation
`ponctuation` du runner QCM = boutons-symboles glyphe + mot, trou final en cadre
pointillé, cf. `ui/ponctuation-view.ts`) et **« Quel type de phrase ? »**
(`fr-gram-type-phrase` — déclaratif / interrogatif / impératif ; l'exclamative est une
**forme**, pas un type). Banques relues par l'agent pédagogue : chaque phrase porte un
**marqueur de sens explicite**, mélange volontaire point ≠ type (raisonner sur le sens,
pas le symbole), `explication` citant le marqueur jamais l'intonation. Le TTS lit la
phrase **sans** la ponctuation finale (la lire avec l'intonation donnerait la réponse).

### Conjugaison

#### `francais/conjugaison.ts`

tables de 13 verbes (être, avoir,
1er groupe *aimer*, 2e groupe *finir*, aller, faire, venir, voir, dire, pouvoir,
vouloir, prendre, naître) aux 4 temps **présent**, **futur**, **imparfait** et
**passé composé** (les formes du passé composé incluent l'auxiliaire conjugué),
fabrique `conjugationType(verbId, tense)` (un `ExerciseType` à deux modes,
**choisissables depuis la leçon** (#69) : `saisie` **conseillé** — l'enfant écrit
la forme, fiche imprimable — et `qcm` — choix entre plusieurs formes,
**distracteurs dérivés du paradigme** du verbe, toutes de **vraies formes
correctement orthographiées**, jamais une faute affichée) et descripteurs
`CONJ_LESSONS` (une leçon par verbe × temps). **Multi-niveaux** : le **passé composé**
est ouvert **CE2 + CM1** (`conjLevels` → `['ce2','cm1']`, surfacé au catalogue) ; les
trois autres temps restent CE2.

#### `francais/verbs-lookup.ts` + `francais/verbs/` (#261)

bibliothèque de formes
conjuguées tirée du lexique **LEFFF** (~7800 verbes), **pré-générée au build** par
`tools/verbs/generate-verbs.mjs` (`npm run verbs:gen`) en **shards JSON** + un
**manifeste** de clés-frontières. Au runtime, `lookupConjugatedForms(infinitif, temps)`
localise le shard par **dichotomie** puis le charge **paresseusement** via
`import.meta.glob('./verbs/verbs-*.json')` (un seul chunk par requête). Sert à la
**détection** d'un verbe et aux **dictées de verbes custom** des listes d'orthographe
(cf. `docs/design-orthographe.md` § Verbes dans les listes). Build-only :
`french-verbs`/`french-verbs-lefff` (Apache-2.0 ; **données LGPLLR**) restent en
`devDependencies` ; le dataset brut (~6,3 Mo) n'est jamais livré, seules les formes du
présent dérivées et shardées partent au client.

### Orthographe

#### `francais/accords.ts` (#109)

catégorie **Orthographe**, rubrique « Les
accords » — 2 leçons de **transformation** (pluriel/féminin) `fr-accords-reguliers`
et `fr-accords-irreguliers` (séparation règle/exception, avis pédagogique).
`accordType(reguliers)` fabrique un `ExerciseType` **deux modes** (saisie/QCM,
moteur de la conjugaison) : `generate()` tire une transformation (« Mets au
pluriel : grand → @ ») dont la réponse est la **forme stockée** (jamais déduite) ;
QCM aux distracteurs = **vraies formes** (jamais une faute affichée) ; **repli
mots longs** = les formes cibles longues ne sont proposées **qu'en QCM** (chaque
mode reste stable en type, contrainte du routage des runners). La leçon des
réguliers complète son pool avec les **mots fléchis de la banque** du profil
(`MotOrtho.formes`, saisis par le parent), qui « remontent » dans les exercices.

#### `francais/participe-passe-etre.ts` (#205)

catégorie **Orthographe**, rubrique
« Les accords » — leçon **« Le participe passé avec être »** (`fr-accords-participe-etre`),
**transformation guidée + QCM 3 options** (« Il est parti. → **Elle** est @ ? »). Module
distinct de `conjugaison.ts` ; **14 verbes exclusivement « être »** (8 d'origine + 6 ajoutés
en #285 : revenir, repartir, retomber, monter, descendre, rentrer ; radical + 4 terminaisons
stockées), 4 patrons d'accord (il→elle, il→ils, elle→elles, il→elles — atteint le féminin
pluriel). Réutilise les **choix riches** `choicesView` (#200) pour **surligner la
terminaison** (`<span class="term">`), sujet en gras via `enonceTexte`, **options empilées**
(nouveau `Exercise.choicesEmpilees` → `.sprint-choices--pile`) et **pas de TTS** (`parle: ''`,
formes homophones). Leçon signalée **« plus dur »** (nouveau `LessonDef.repere`, badge ambre)
et **exclue du sprint** (charge cognitive, notion vue en avance).

#### `francais/homophones.ts` (#110)

catégorie **Orthographe**, rubrique « Les
homophones » — 5 leçons (a/à, et/est, on/ont, son/sont, ou/où), une par paire.
`homophoneType(paire)` fabrique un `ExerciseType` **QCM mono-mode** : phrase à trou
(`@`), **2 options** = les deux graphies (jamais une forme fautive), et un champ
**`explication`** (critère de substitution) affiché après la réponse par le runner
QCM. Données : 2 listes de phrases par paire (`phrasesA`/`phrasesB` → réponse
implicite, pas de clé erronée possible), ~100 phrases/paire, relues par l'agent
pédagogue (ambiguïté, niveau CE2, « où » de lieu uniquement).

#### `francais/mbp.ts` (#111)

catégorie **Orthographe**, rubrique « Les règles » —
leçon unique **« m devant m, b, p »** (`fr-mbp`). Exercice « m ou n ? » : mot à
trou (`@`), QCM **2 options** (m/n), feedback `explication` selon le type. Banque
combinée : mots réguliers curatés + **mots de `ORTHO_PREDEF` (#106)** contenant
mm/mb/mp (le m de la règle blanchi, **majuscules/noms propres et adverbes en
-mment exclus**) + contre-exemples en « n » + **exceptions** (bonbon, bonbonne,
néanmoins). **`tiragePondere`** (pur, `r` injectable) sur-pondère les exceptions
(poids 3 → ~10-12 % des tirages, calibré avec le pédagogue).

#### `francais/orthographe.ts` — listes & dictées prédéfinies

La catégorie **Orthographe** ne se limite pas aux leçons « moteur » ci-dessus :
`ORTHO_PREDEF` définit des **leçons de dictée prédéfinies** (`LeconOrthoPredef` :
`id` `fr-ortho-*`, `label`, `niveau`, `mots`) — mots invariables, nombres en lettres,
mots irréguliers, thèmes — proposées **en complément des listes du parent**. Les mots
homophones portent une **phrase d'exemple** (`commeDans`) pour lever l'ambiguïté en
dictée. Ces listes ne passent **pas** par le pipeline `LessonDef`/`genLessonItem` : elles
sont jouées par le **moteur d'orthographe dédié** (`core/orthographe/`, runners
`ui/ortho-*`), via la catégorie dynamique `ORTHO_CATEGORY_ID` et l'écran sur-mesure
`renderOrthoCategorie`. Détail du moteur : `docs/design-orthographe.md`.

### Vocabulaire

#### `francais/familles.ts` (#113)

catégorie **Vocabulaire**, leçon **« Familles,
préfixes et suffixes »** (`fr-vocab-familles`). QCM de reconnaissance 3 options, trois
types équilibrés : familles de mots (bonne réponse + **faux-ami** plausible d'une autre
famille + intrus), préfixes (re-, dé-, in-/im-, pré-, sur-, sous-) et suffixes
(-eur/-euse, -tion/-sion, -ment, -able/-ible, -ette) où l'on décode le sens. Un builder
unifie les 3 banques en items `{ question, reponse, distracteurs, explication }`.
Relue par l'agent pédagogue (faux-amis vérifiés au CNRTL : retrait de laitue←lait,
pommade←pomme… qui étaient en réalité de la même famille).

#### `francais/sens-figure.ts` (#112)

catégorie **Vocabulaire**, leçon **« Sens
propre / sens figuré »** (`fr-vocab-sens`). QCM 3 options : courte phrase +
« Ici, « X » veut dire : ? ». Données **par mot** (chaque verbe porte ses 3 options
fixes propre/figuré/distracteur ; seules les phrases et le `sens` varient → les
deux sens sont toujours proposés, pas de clé erronée), équilibre propre/figuré.
Feedback `explication` rappelant le sens employé. Relue par l'agent pédagogue.

#### `francais/synonymes-contraires.ts` (#203)

catégorie **Vocabulaire**, rubrique
**« Synonymes et contraires »**, deux leçons dans l'ordre pédagogique **« Les
contraires »** (`fr-vocab-contraires`, antonymes) puis **« Les mots de sens
proche »** (`fr-vocab-sens-proche`, synonymes). QCM 3 options ; le **mot-cible est
en gras** (`**…**` rendu par `enonceTexte`) dans une phrase courte ; distracteurs
**francs** (aucun quasi-synonyme, aucun mot déjà dans la phrase). Le runner QCM
affiche une **consigne renforcée** + **picto** (`↔` / `=`) et greffe un bouton TTS
sur le mot-cible et chaque option (champs **`consigne`/`picto`/`ttsItems`** de la
variante `qcm`, `ui/consigne-tts.ts → bindItemTts`). La lecture vocale **nomme** le
mot-cible (le gras est muet à l'oral). **Exclues du sprint** (`excludeFromSprint`).
Banques relues par les agents pédagogue (justesse, distracteurs francs, lexique CE2)
et langue (accords, registre).

#### `francais/vocabulaire.ts` (#108)

catégorie **Vocabulaire**, leçons
**« Ordre alphabétique »** (`fr-vocab-alpha-initiale` tri par 1re lettre,
`fr-vocab-alpha-deuxieme` tri par 2e lettre à initiale commune). `ordreType`
fabrique un `ExerciseType` **mono-mode** dont `generate()` produit un `Exercise`
**`tuilesOrdre`** `{question, tuiles (suite mélangée), ordre (suite triée)}` — la
bonne suite est **calculée** par `trierAlpha` (`localeCompare` fr), jamais figée.
Joué par un runner d'écran dédié `ui/lecon-ordre.ts` ; **exclu du sprint**
(`isOrderingLesson`, comme la posée), avec un **repli texte** en bilan/fiche/
révision (genLessonItem : « écris les mots dans l'ordre »).

#### `francais/champs-lexicaux.ts` (#114)

catégorie **Vocabulaire**, rubrique
**« Champs lexicaux »**, deux leçons. Banque `CHAMPS` de mots **précis/rares**
(météo, corps, cuisine, forêt, mer, école, ville, émotions, montagne, jardin),
mots sans article + définition « enfant », relue par l'agent pédagogue. **« Le
mot juste »** (`fr-vocab-champs-mots`) : QCM 4 options alternant **définition →
mot** (distracteurs du même champ) et **intrus** (3 mots d'un champ + 1 d'un
autre). **« Ranger par thème »** (`fr-vocab-champs-tri`) : `Exercise`
**`tuilesTri`** `{question, categories: [t1, t2], mots: [{mot, cat}]}` — l'enfant
trie des tuiles fournies dans 2 thèmes (runner `ui/lecon-tri.ts`), **exclu du
sprint** (`isTriLesson`), repli texte en bilan/fiche (une tuile → son thème). Un
mot pouvant relever de plusieurs champs (relief, plante sauvage…) est marqué
`ambigu` : **conservé dans la banque** et dans « définition → mot », mais **exclu
de l'intrus et du tri** (qui croisent deux champs) via `motsNets` — on ne retire
jamais un mot de la banque, on le flague pour le format concerné.

## Maths

> Les leçons de **calcul mental** historiques (`LESSONS`/`bilanQ`) ne vivent pas dans
> `src/data/` mais dans `core/lessons.ts` (cf. [Logique pure](core.md)) ; elles sont
> décrites dans la section « Calcul mental » ci-dessous.

### Numération

#### `maths/numeration.ts` (#98, grands nombres CM1 #240)

3 leçons « situer un nombre » (catégorie
`math-numeration`) — `num-comparer` (placer `<`, `=`, `>`), `num-encadrer-intercaler`
(dizaine/centaine juste avant/après, intercaler entre bornes serrées),
`num-situer-10000` (idem jusqu'à 9999, encadrement au millier). **Deux modes** par
leçon (#69) : `saisie` (conseillé, compatible fiche/bilan : on tape le signe ou le
nombre) et `tuiles` (on déplace la bonne tuile parmi des distracteurs). Le mode
tuiles produit un `Exercise` de type **`tuilesNombre`** (`{question, answer, tuiles}`)
rendu par un runner d'écran dédié `ui/lecon-tuiles.ts`. Calibrage CE2 : nombres à
3 chiffres (4 réservés à la leçon « 10 000 »), `=` minoritaire, ~30 % de longueurs
différentes (cas charnière), distracteurs typés sur les erreurs classiques.
**Multi-niveaux** : les **3 leçons** sont `calibrated` et **surfacées en CM1** (plafond
= **le million**, 7 chiffres, max 9 999 999 ; le milliard est réservé au CM2). Les
plages **CE2 sont gelées** (invariant) ; la génération CM1 mêle 5/6/7 chiffres, pondérée
vers les cas formateurs (zéros intercalaires, charnières de classe). `RANG_MOT` est
étendu (dizaine/centaine **de mille**, **million**) et l'encadrement choisit le rang
selon la taille du nombre. **Intercalation CM1** : check **par intervalle** (toute valeur
strictement entre deux multiples ronds consécutifs, via le champ `Exercise.intervalle`) ;
le CE2 garde sa **réponse unique**. **Saisie** : on ne fait jamais taper > 6 chiffres
(comparaison = signe, encadrement/intercalation = nombres ronds), et le `check` tolère
les espaces de groupement (`nettoyerSaisieNombre`). Tous les grands nombres affichés sont
groupés via `core/nombres.ts` (`formatNombre`, classe `.bignum`) ; le champ de réponse
« grand nombre » (`.ans-grand`, ≥ 10 000) **regroupe aussi sa saisie à la frappe** (écho U+202F,
`ui/grand-nombre-echo.ts`, #327).

#### `maths/position.ts` (#94, grands nombres CM1 #240)

5 leçons de numération positionnelle de la même
catégorie — `num-valeur-position` (« chiffre des X » vs « combien de X en tout »),
`num-decompose-100/1000/10000` (décomposition « en rangs », sens décomposer troué
dominant + composer) et **`num-decompose-multiplicative`** (nouvelle leçon **CM1-only**,
#240). Mono-mode saisie, réponse numérique unique (pas de multi-champs : le `@` reste
unique par item). Calibrage CE2 : « en tout » jamais sur les unités, forme additive
écartée (ambiguïté 6 vs 60), zéro intercalaire inclus, accords singulier/pluriel soignés.
**Multi-niveaux** : `num-valeur-position` et `num-decompose-10000` sont `calibrated`
(rangs jusqu'au **million** en CM1). La **décomposition multiplicative** (forme
« chiffre × valeur de rang » : `4 × 1000000 + 5 × 100000 + …`, sens décomposer troué
dominant → réponse = 1 chiffre) est une leçon distincte de la décompo « en rangs » CE2 ;
son `levels: ['cm1']` est porté par le descripteur (le catalogue prend
`exerciseType.levels ?? d.levels ?? ['ce2']`).

#### `maths/fractions.ts` (#200) — rubrique « Fractions »

6 leçons, fractions **toujours < 1** (numérateur < dénominateur), dénominateur ≤ 12,
dans l'ordre pédagogique (avis pédagogue) : **« Lire une fraction »** (`num-frac-sens`,
QCM, barre divisée), **« Fraction d'une collection »** (`num-frac-collection`, saisie
numérique, jetons groupés), **« Fraction sur une bande »** (`num-frac-bande`, QCM, bande
0→1), **« Fractions égales »** (`num-frac-egalites`, QCM oui/non), **« Comparer des
fractions »** (`num-frac-comparaison`, QCM), **« Additionner des fractions »**
(`num-frac-addition`, QCM, même dénominateur — attendu de fin de CE2 2025). La fraction
s'affiche **empilée** (barre horizontale, numérateur au-dessus) via
`core/fraction-text.ts`, jamais « 6/8 ». **Multi-niveaux** (#287) : 3 leçons (collection,
bande, addition) sont `calibrated` { ce2, cm1 } (le CM1 élargit les dénominateurs,
**prêt derrière `level`**, catalogue `['ce2']`) ; la leçon « sens » n'est pas calibrée
(figure plafonnée à 8 parts).

### Calcul (opérations posées)

#### `maths/posee.ts` (#97)

3 leçons d'**opérations posées** (catégorie
`math-calcul`) — `calc-addition-posee`, `calc-soustraction-posee` (a ≥ b garanti),
`calc-multiplication-posee` (×1 chiffre et ×2 chiffres avec produits partiels). Le
générateur produit un `Exercise` `posed` (op + opérandes) ; le catalogue en fait un
**Item `kind: 'posed'`** que `renderItem` déploie en **grille de colonnes**
(posedGridHTML) : chaque chiffre du résultat (et des produits partiels) est un champ
`.ans` noté individuellement, des cellules de retenue `.ans-free` servent d'aide.
verify() corrige chaque cellule (sans-faute = toutes justes). Exclu du sprint
(multi-cellules), pris en charge en bilans/impression/révision.

### Calcul mental

Catégorie `math-calcul-mental`. Trois origines :

- **15 leçons CE2 historiques** (`core/lessons.ts`, `LESSONS`/`bilanQ` — tables d'addition,
  compléments à 10/100/1000, doubles, moitiés, ajouter/soustraire 9·19, tables de ×,
  multiples de 25, décompo. de 60, ×10·×100, ×4·×8, ×20·30·40, décomposer…). Système
  fiche/`bilanQ` **sans paramètre `level`** : le **calibrage** d'une leçon donnée est
  figé (pas de recalibrage par niveau) — étendre au CM1 se fait par une **leçon
  distincte** (cf. ci-dessous), pas en surchargeant une plage CE2.
- **2 leçons CM1** (#241, `core/lessons.ts`, tableau **`LESSONS_CM1`** + cas `bilanQ`
  16/17) : **« Multiples de 50 »** (`math-multiples-50`, clone CM1 des multiples de 25,
  50×2 → 50×12) et **« Diviser par 10, par 100 »** (`math-diviser-10-100`, symétrique de
  « ×10, ×100 » : 6 items ÷10 puis 6 ÷100). **Quotients ENTIERS uniquement** — le
  dividende est toujours un multiple exact (finit par `0` / `00`), jamais de reste ni de
  virgule (les décimaux sont différés au chantier dédié) ; quotient ≤ 2 chiffres.
  `levels: ['cm1']` + ordre pédagogique `math.cm1`. **Convention multi-niveaux du
  moteur historique** : `LESSONS` reste l'ensemble **CE2** consommé par les vues legacy
  « toutes les leçons » (`buildFiches`, `bilanBlocks`, `bilanHTML`, `renderLessons`) ;
  les leçons CM1 vivent dans `LESSONS_CM1` ; **`LESSONS_CALCUL_MENTAL`** (= `LESSONS` +
  `LESSONS_CM1`) est le **lookup combiné** utilisé par `buildLessonFiche` et la carte de
  catégorie pour retrouver le rendu riche d'une leçon par `id` (tous niveaux).
- **`maths/division.ts` (#104, #95) — division par le sens** (jamais posée au CE2),
  3 leçons : **« Moitié et quart d'une collection »** (`math-div-moitie-quart`,
  fraction-opérateur, résultat entier ; `calibrated` CE2 X ≤ 50 / CM1 X ≤ 100),
  **« Je partage »** (`math-div-partage`, division **exacte** dans les tables, deux sens
  partage/groupement, figure « situation de départ » `renderGroupes` sur les items de
  découverte, **exclue du sprint**) et **« Je découvre le reste »** (`math-div-reste`,
  quotient **+ reste**, deux modes : saisie via le runner « problème » et QCM,
  **exclue du sprint**).

### Grandeurs et mesures

#### `maths/mesures.ts` (#89)

moteur de **conversions d'unités** partagé par
4 leçons de « Grandeurs et mesures » — `mes-longueurs` (m↔cm, km↔m, cm↔mm, m↔mm),
`mes-masses` (kg↔g), `mes-contenances` (L↔cL, L↔dL), `mes-durees` (h↔min + fractions
d'heure). `conversionType(config)` fabrique un `ExerciseType` **mono-mode** dont
`generate()` produit une question texte avec `@` (emplacement du champ) et une
réponse **numérique** ; `MESURE_LESSONS` liste les descripteurs. Calibrage CE2
(avis pédagogique) : facteur grande→petite ≤ 9, sens inverse sur multiples
exacts (réponse entière), pondération ~60/40 vers le sens ×, mL (L↔mL) et
conversion min↔s écartés (CM1 / surcharge base 60).

#### `maths/monnaie.ts` (#96)

2 leçons de monnaie de la même catégorie
(`mes-monnaie-calcul` : prix total / reste en € ou en centimes ; `mes-monnaie-rendu` :
rendu = billet − prix). Même chemin « math moderne » (item `num`). Calibrage CE2 :
réponse **toujours entière**, unité (€ ou c) collée au champ, pas de décimaux ni de
mélange €/c franchissant l'euro, billets 5/10/20/50 € (#287), centimes par pas de 10 sous 1 €.

#### `maths/heure.ts` (#88)

leçon **« Je lis l'heure »** (`mes-lecture-heure`,
catégorie « Grandeurs et mesures »), **première cliente du moteur de figures SVG**
(`core/figures.ts`) — chaque question affiche une **horloge** générée. Deux modes
(#69) : `saisie` (conseillé, fiche imprimable ; réponse « H h MM » au **parsing
tolérant** — `10h15`, `10:15`, `8`/`8h`/`8h00` pour les heures pile, déclaré via
`answers`) et `qcm` (4 propositions, **distracteurs = erreurs classiques** :
inversion des aiguilles, ±5 min, confusion quart/demi, ±1 h). Calibrage CE2 (avis
pédagogique) : horloge **12 h** uniquement, 4 plages pondérées (heures pile, demi,
quarts, multiples de 5), positions d'aiguilles quasi superposées (dont 12 h 00)
écartées.

#### `maths/perimetre.ts` (#99)

**3 leçons** de périmètre (catégorie « Grandeurs
et mesures »), clientes du moteur SVG, mono-mode saisie, réponse **numérique**
(unité « cm » affichée par l'app) — découpage en 3 compétences distinctes (avis
pédagogique) : `mes-perimetre-cotes` (additionner les côtés d'un rectangle /
triangle isocèle / figure en L cotés — `renderPolygoneCote`), `mes-perimetre-quadrillage`
(compter les **côtés de carreaux** du contour sur grille — `renderQuadrillage` +
`boundaryEdges`), `mes-perimetre-formule` (déduire : carré `4 × côté`, rectangle
`2 × (L + l)`). La définition (« le périmètre, c'est le tour ») est rappelée dans
chaque énoncé. Calibrage CE2 : côtés 2–15, périmètre ≤ ~50 ; figures à l'échelle
(triangle isocèle, L cohérent) ; quadrillage ≤ 6×6, périmètre 8–20.

### Géométrie

#### `maths/geometrie.ts` (#100)

**2 leçons** de « Géométrie » (figures planes),
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

#### `maths/cercle.ts` (#102)

leçon **« Le cercle »** (`geom-cercle`, Géométrie),
deux modes `qcm` (conseillé) / `saisie`. Trois familles : rayon → diamètre (d = 2 r),
diamètre → rayon (r = d / 2) et vocabulaire (centre / rayon / diamètre). Le cercle
SVG (`renderCercle`) met en évidence le segment concerné (coté pour le calcul, « ? »
pour le vocabulaire). Calibrage : rayon **2–20** (CE2 ; `calibrated` CM1 2–50 prêt
derrière `level`, non surfacé), distracteurs = confusion rayon/diamètre (×2 oublié/ajouté).

#### `maths/solides.ts` (#103)

**2 leçons** de Géométrie (schémas SVG générés, pas
d'images statiques). `geo-solides-reconnaitre` — nommer un solide affiché en
perspective (`renderSolide`), modes `qcm` (conseillé) / `saisie` (« pavé » accepté
pour « pavé droit »). `geo-solides-proprietes` — propriétés **mémorisées** en QCM
textuel (sans figure). Calibrage CE2 (avis pédagogique) : 6 solides (cube, pavé
droit, cylindre, cône, pyramide, boule) ; comptage **exact réservé aux polyèdres**
(cube/pavé 6 faces, 8 sommets, cube 12 arêtes ; pyramide 5 faces / 5 sommets) ;
cylindre/cône/boule **jamais comptés** (ambigu) → propriétés qualitatives (« roule »,
« une pointe », « 2 disques »). **Hors périmètre** : compter faces/arêtes/sommets sur
le dessin 3D (faces cachées).

#### `maths/geometrie-cm1.ts` (#242)

**6 leçons** de Géométrie **CM1** (contenu **additif**, ids `geo-cm1-*`, `levels: ['cm1']`
— le **CE2 est gelé**, ces leçons ne touchent pas les banques/plages de `geometrie.ts` et
`solides.ts`). **Figures planes** : **« Je reconnais les triangles »** (`geo-cm1-triangles`,
qcm/saisie — équilatéral / isocèle / rectangle / quelconque, figure tirée **de** la réponse →
quand la réponse est « isocèle » on dessine un isocèle **franc**, jamais d'ambiguïté
équilatéral/isocèle), **« Les propriétés des triangles »** (`geo-cm1-triangles-prop`, QCM
textuel ; les choix d'une question de **côtés égaux** ne mêlent jamais « équilatéral » et
« isocèle » → pas d'inclusion), **« Je reconnais les quadrilatères »** (`geo-cm1-quadrilateres`,
qcm/saisie — carré / rectangle / losange / **parallélogramme** comme réponse à part entière ;
**aucune inclusion**, rotation 0° pour le parallélogramme). **Solides** : **« Je reconnais les
solides »** (`geo-cm1-solides`, qcm/saisie — les 6 solides CE2 + le **prisme**), **« Polyèdre
ou non ? »** (`geo-cm1-polyedre`, QCM — le contenu le plus **structurant** : faces planes ⇒
polyèdre cube/pavé/pyramide/prisme, surface courbe ⇒ non cône/cylindre/boule) et **« Compter
faces, arêtes et sommets »** (`geo-cm1-solides-comptage`, QCM **DE MÉMOIRE**, **sans figure** et
**uniquement sur les polyèdres** — jamais « compte sur le dessin », qui n'a pas les arêtes
cachées). Distracteurs = **vraies formes** / valeurs voisines réelles. Ordre pédagogique
`math.cm1` (#208) : figures planes avant solides, triangles (quelconque en contre-exemple)
avant quadrilatères, parallélogramme en dernier des planes, solides reconnaissance →
polyèdre/non-polyèdre → comptage. Cliente du moteur SVG : triangles particuliers et prisme
ajoutés à `core/figures.ts` (cf. [Logique pure](core.md)).

#### `maths/symetrie-axiale.ts` (#201)

leçon **« Le miroir magique »** (`geo-symetrie-axiale`,
Géométrie), **reconnaissance seule** (jamais tracer, attendu CE2). QCM mono-mode mêlant
trois formats : amorce « a-t-elle un axe ? » (oui/non), « ce trait est-il un axe ? »
(oui/non, avec le **piège diagonale-du-rectangle**, source de vérité `AXES`/`axeEstDeSymetrie`),
et le cœur (~60 %) « quel est le reflet ? » — **choix QCM riches** (`choicesView`, #200) :
chaque proposition est une **scène cliquable** (figure de départ + miroir + image), où l'image
est le vrai reflet, un **glissé** (translation) ou un **tourné** (demi-tour). Distracteurs et
scène complète par choix validés par le pédagogue (l'enfant **vérifie le pliage**, il n'imagine
pas le reflet). Reflet calculé par réflexion **exacte** des points (`renderSymMiroir` /
`renderSymImage`). **Exclue du sprint chronométré** (tâche visuo-spatiale). _Accessibilité_ :
comme l'horloge ou les solides, c'est une **tâche purement visuelle** — le format « quel reflet ? »
n'est **pas résoluble au lecteur d'écran** par conception (verbaliser l'orientation donnerait la
réponse) ; publics servis = clavier et basse vision (figures agrandies, libellés positionnels).

#### `maths/angles.ts` (#202)

leçon **« Les angles »** (`geo-angles`, Géométrie),
cliente du moteur SVG (`renderAngle`). **QCM mono-mode** ; trois « temps » tirés à
chaque question selon une pondération CE2 (40/35/25) : reconnaître l'angle droit
(Oui/Non), **comparer** à l'angle droit (plus petit / égal / plus grand), puis
**nommer** (aigu / droit / obtus — le vocabulaire n'arrive qu'au temps 3, avec une
**bulle d'aide** `.angle-aide` qui l'ancre sur la comparaison). Calibrage CE2
(programme 2025, avis pédagogue + designer) : jugement **à l'œil, SANS degrés**
(aigu ~30–60°, obtus ~115–150°, marge nette autour de 90° ; zone indécidable
~80–100° et quasi-plats >170° bannis) ; le **carré de codage** est posé d'office par
le renderer sur tout angle droit (« égal/droit » n'est donc proposé que sur un angle
marqué) ; orientations variées (bissectrice). Champ `explication` après réponse. La
mesure au rapporteur relève du CM1 (future leçon).

### Résolution de problèmes

Catégorie `math-problemes`, **6 leçons** (`maths/problemes.ts`), une par structure de
Vergnaud, dans l'ordre du concret à l'abstrait : **« Parties et tout »**
(`math-prob-composition`), **« Gagner ou perdre »** (`math-prob-transformation`),
**« Des groupes égaux »** (`math-prob-multiplication`), **« Partager et grouper »**
(`math-prob-partage`), **« Comparer (plus ou moins) »** (`math-prob-comparaison`) et
**« Problèmes en deux étapes »** (`math-prob-deux-etapes`). Énoncés **générés par
gabarits** (positions d'inconnue variées, pièges « mots-clés » loyaux et minoritaires,
calibrage CE2 : additifs ≤ 1000, multiplicatifs dans les tables, division exacte).
Mono-mode, réponse(s) numérique(s), **exclues du sprint** (`isProblemeLesson`). Jouées
par le runner dédié `ui/lecon-probleme.ts` (cf. [Rendu & interactions](ui.md)).
