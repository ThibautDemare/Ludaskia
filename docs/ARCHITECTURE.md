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
**français**, le catalogue suit les 4 catégories du manuel CE2 dans l'ordre
canonique — **grammaire**, **conjugaison**, **orthographe**, **vocabulaire**
(#107) ; **grammaire** porte le **pronom sujet et l'accord sujet-verbe** (#115)
et les **classes de mots / articles / adverbes** (#116), **vocabulaire** accueille
l'ordre alphabétique (#108), le **sens propre / figuré** (#112), les
**familles de mots / préfixes / suffixes** (#113) et les **champs lexicaux**
(#114), **orthographe** réunit les dictées de mots, les
**accords** (pluriel/féminin, #109), les **homophones grammaticaux**
(a/à, et/est…, #110) et les **règles** (m devant m/b/p, #111). Génération aléatoire
d'exercices, correction instantanée, chronomètre, et une couche de gamification
(records, médailles, trophées, objectifs, XP) avec gestion de profils. 100 %
**côté client** (aucun serveur) ; la progression est stockée en `localStorage`.

Le contenu est organisé en hiérarchie **Matière → Catégorie → Leçon**
(`src/core/catalog.ts`). Une leçon peut porter une **`rubrique`** facultative
(sous-section affichée groupée dans l'écran de catégorie — #109 : conjugaison par
temps, orthographe « Les accords » / « Les dictées »). Chaque leçon porte un
**`ExerciseType`** (`src/core/exercise.ts`) qui encapsule la **génération** et la
**vérification** d'un exercice — c'est ce qui rend le moteur agnostique de la matière. Le document
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
matière. L'**ordre pédagogique** des leçons (#208) y vit aussi, à plat :
**`ordre-pedagogique.ts`** (`ORDRE_LECONS[matière][niveau]`, exploité par
`core/ordre.ts`). Ex. **`francais/conjugaison.ts`** : tables de 13 verbes (être, avoir,
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
**`francais/verbs-lookup.ts` + `francais/verbs/` (#261)** : bibliothèque de formes
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
**`francais/accords.ts`** (#109) : catégorie **Orthographe**, rubrique « Les
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
**`francais/participe-passe-etre.ts`** (#205) : catégorie **Orthographe**, rubrique
« Les accords » — leçon **« Le participe passé avec être »** (`fr-accords-participe-etre`),
**transformation guidée + QCM 3 options** (« Il est parti. → **Elle** est @ ? »). Module
distinct de `conjugaison.ts` ; 8 verbes **exclusivement « être »** (radical + 4 terminaisons
stockées), 4 patrons d'accord (il→elle, il→ils, elle→elles, il→elles — atteint le féminin
pluriel). Réutilise les **choix riches** `choicesView` (#200) pour **surligner la
terminaison** (`<span class="term">`), sujet en gras via `enonceTexte`, **options empilées**
(nouveau `Exercise.choicesEmpilees` → `.sprint-choices--pile`) et **pas de TTS** (`parle: ''`,
formes homophones). Leçon signalée **« plus dur »** (nouveau `LessonDef.repere`, badge ambre)
et **exclue du sprint** (charge cognitive, notion vue en avance).
**`francais/homophones.ts`** (#110) : catégorie **Orthographe**, rubrique « Les
homophones » — 5 leçons (a/à, et/est, on/ont, son/sont, ou/où), une par paire.
`homophoneType(paire)` fabrique un `ExerciseType` **QCM mono-mode** : phrase à trou
(`@`), **2 options** = les deux graphies (jamais une forme fautive), et un champ
**`explication`** (critère de substitution) affiché après la réponse par le runner
QCM. Données : 2 listes de phrases par paire (`phrasesA`/`phrasesB` → réponse
implicite, pas de clé erronée possible), ~100 phrases/paire, relues par l'agent
pédagogue (ambiguïté, niveau CE2, « où » de lieu uniquement).
**`francais/mbp.ts`** (#111) : catégorie **Orthographe**, rubrique « Les règles » —
leçon unique **« m devant m, b, p »** (`fr-mbp`). Exercice « m ou n ? » : mot à
trou (`@`), QCM **2 options** (m/n), feedback `explication` selon le type. Banque
combinée : mots réguliers curatés + **mots de `ORTHO_PREDEF` (#106)** contenant
mm/mb/mp (le m de la règle blanchi, **majuscules/noms propres et adverbes en
-mment exclus**) + contre-exemples en « n » + **exceptions** (bonbon, bonbonne,
néanmoins). **`tiragePondere`** (pur, `r` injectable) sur-pondère les exceptions
(poids 3 → ~10-12 % des tirages, calibré avec le pédagogue).
**`francais/classes-mots.ts`** (#116) : catégorie **Grammaire**, leçon **« Classes de
mots, articles, adverbes »** (`fr-gram-classes`). QCM d'étiquetage, 3 sous-types
(classe nom/verbe/adjectif ; article le/la/les ; repérer l'adverbe dans une phrase),
sur une **banque interne étiquetée** (jamais les listes du parent). Un builder unifie
les 3 types en items QCM. Relue par l'agent pédagogue.
**`francais/grammaire-sujet.ts`** (#115) : catégorie **Grammaire**, 2 leçons QCM —
**« Le pronom sujet »** (`fr-gram-pronom-sujet` : « mes amis et moi » → nous) et
**« L'accord du verbe avec le sujet »** (`fr-gram-accord-sujet-verbe` : « les oiseaux
(voir) » → voient). Chaque sujet (`SUJETS`) est mappé à une **personne** (0–5) ; la
forme conjuguée est **lue depuis `VERBS`/`getVerb`** (base de conjugaison, présent),
jamais codée en dur. Paires sujet+verbe curées (animaux limités aux verbes
plausibles), distracteurs d'accord = autres formes réelles du présent.
**`francais/familles.ts`** (#113) : catégorie **Vocabulaire**, leçon **« Familles,
préfixes et suffixes »** (`fr-vocab-familles`). QCM de reconnaissance 3 options, trois
types équilibrés : familles de mots (bonne réponse + **faux-ami** plausible d'une autre
famille + intrus), préfixes (re-, dé-, in-/im-, pré-, sur-, sous-) et suffixes
(-eur/-euse, -tion/-sion, -ment, -able/-ible, -ette) où l'on décode le sens. Un builder
unifie les 3 banques en items `{ question, reponse, distracteurs, explication }`.
Relue par l'agent pédagogue (faux-amis vérifiés au CNRTL : retrait de laitue←lait,
pommade←pomme… qui étaient en réalité de la même famille).
**`francais/sens-figure.ts`** (#112) : catégorie **Vocabulaire**, leçon **« Sens
propre / sens figuré »** (`fr-vocab-sens`). QCM 3 options : courte phrase +
« Ici, « X » veut dire : ? ». Données **par mot** (chaque verbe porte ses 3 options
fixes propre/figuré/distracteur ; seules les phrases et le `sens` varient → les
deux sens sont toujours proposés, pas de clé erronée), équilibre propre/figuré.
Feedback `explication` rappelant le sens employé. Relue par l'agent pédagogue.
**`francais/synonymes-contraires.ts`** (#203) : catégorie **Vocabulaire**, rubrique
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
**`francais/vocabulaire.ts`** (#108) : catégorie **Vocabulaire**, leçons
**« Ordre alphabétique »** (`fr-vocab-alpha-initiale` tri par 1re lettre,
`fr-vocab-alpha-deuxieme` tri par 2e lettre à initiale commune). `ordreType`
fabrique un `ExerciseType` **mono-mode** dont `generate()` produit un `Exercise`
**`tuilesOrdre`** `{question, tuiles (suite mélangée), ordre (suite triée)}` — la
bonne suite est **calculée** par `trierAlpha` (`localeCompare` fr), jamais figée.
Joué par un runner d'écran dédié `ui/lecon-ordre.ts` ; **exclu du sprint**
(`isOrderingLesson`, comme la posée), avec un **repli texte** en bilan/fiche/
révision (genLessonItem : « écris les mots dans l'ordre »).
**`francais/champs-lexicaux.ts`** (#114) : catégorie **Vocabulaire**, rubrique
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
**`maths/cercle.ts`** (#102) : leçon **« Le cercle »** (`geom-cercle`, Géométrie),
deux modes `qcm` (conseillé) / `saisie`. Trois familles : rayon → diamètre (d = 2 r),
diamètre → rayon (r = d / 2) et vocabulaire (centre / rayon / diamètre). Le cercle
SVG (`renderCercle`) met en évidence le segment concerné (coté pour le calcul, « ? »
pour le vocabulaire). Calibrage : rayon 2–15, distracteurs = confusion
rayon/diamètre (×2 oublié/ajouté).
**`maths/solides.ts`** (#103) : **2 leçons** de Géométrie (schémas SVG générés, pas
d'images statiques). `geo-solides-reconnaitre` — nommer un solide affiché en
perspective (`renderSolide`), modes `qcm` (conseillé) / `saisie` (« pavé » accepté
pour « pavé droit »). `geo-solides-proprietes` — propriétés **mémorisées** en QCM
textuel (sans figure). Calibrage CE2 (avis pédagogique) : 6 solides (cube, pavé
droit, cylindre, cône, pyramide, boule) ; comptage **exact réservé aux polyèdres**
(cube/pavé 6 faces, 8 sommets, cube 12 arêtes ; pyramide 5 faces / 5 sommets) ;
cylindre/cône/boule **jamais comptés** (ambigu) → propriétés qualitatives (« roule »,
« une pointe », « 2 disques »). **Hors périmètre** : compter faces/arêtes/sommets sur
le dessin 3D (faces cachées).
**`maths/symetrie-axiale.ts`** (#201) : leçon **« Le miroir magique »** (`geo-symetrie-axiale`,
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
**`maths/angles.ts`** (#202) : leçon **« Les angles »** (`geo-angles`, Géométrie),
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

### `src/core/`
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
- **`lessons.ts`** — contenu **maths** : `LESSONS` (15 leçons constructibles
  isolément), `bilanQ` (générateur réutilisé par le catalogue). Côté impression :
  `PrintScope` + **`buildPrintableDOM(scope)`** (contextuel, **multi-matières** via
  `buildLessonFiche`/`bilanBlocksForIds`), `coverHTML(scope)` (garde dynamique),
  pagination 2 fiches/A4. (`buildFiches`/`bilanHTML` historiques conservés.)
  **Corrigé (#41)** : `scope.corrige` rend le corps DEUX fois — feuille vierge puis
  réponses révélées (`corrigeMode`) — sur les MÊMES items (graine commune via
  `withSeed`), avec `corrigeCoverHTML` en intercalaire.
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
- **`progress.ts`** — records de bilans **scopés par niveau** (`recordRun`,
  `cmpRun` « score puis temps », `loadRuns` = niveau actif / `loadRunsAll` = tous
  niveaux pour l'effort — #233), série (`updateStreak`, `streakSuffix`), étoiles
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
- **`modal-a11y.ts`** — **mécanique a11y partagée des modales** (#235, extraite de
  `ui-modal.ts`) : `activateModal(overlay, opts) → release()` pose le **focus-trap**
  (Tab/Maj+Tab bouclent à l'intérieur), l'**arrière-plan `inert`** + scroll-lock, la
  **fermeture Échap** optionnelle (`onEscape` omis = **choix forcé**) et la
  **restauration du focus** au déclencheur. Source unique consommée par `ui-modal.ts`
  (uiAlert/Confirm/Prompt) **et** par toutes les modales statiques à contenu sur-mesure
  (`effects.ts`, `unlocks-view.ts`, `onboarding.ts`, voile de `version-check.ts`).
- **`effects.ts`** — `sparkline` (SVG), `confetti`, modale `showCelebration`, et
  modale dédiée **passage de niveau** `showLevelUp`/`hideLevelUp` (médaillon doré
  animé ; un `then` optionnel enchaîne sur `showCelebration` s'il y a d'autres
  gains).
- **`render.ts`** — rendus accueil/sélecteur/profils (`renderHomeStats` — qui
  appelle aussi `renderLeconDuJour` (#208) — et favoris, badge **niveau + barre**
  dans `renderToolbarProfile`, carte de progression `renderProgression` (sa bulle de
  mascotte porte le **défi du jour** : invitation, puis félicitations une fois
  accompli), `renderObjectives`, `renderLessons` + `lessonCardHTML` réutilisable,
  `renderProfileMenu`, `renderProfiles`, `boardHTML`/`sprintBoardHTML`,
  `pctColor`, config `REGULARITY`).
- **`lecon-du-jour.ts`** — carte **« leçon du jour »** de l'accueil (#208) : `#leconDuJour`
  est la **1re carte** de la rangée `.cards`, sur le **même modèle visuel** que les cartes
  de mode (pastille `.ico`, titre, descriptif, CTA), au contenu **dynamique**.
  `renderLeconDuJour` peint la carte du prochain pas (`core/lecon-du-jour.ts`) — pastille à
  la couleur de la matière, libellé de leçon, « matière · catégorie », « C'est parti → » —
  avec un bouton **« Voir une autre leçon »** (contournement `leconSuivante`, jamais de mur)
  et, tout acquis, une **félicitation + passerelle vers la révision**. La carte est cliquable
  (→ `startLecon`/`startRevisionEspacee`) via un listener posé **une seule fois** sur l'élément
  persistant ; l'état (leçon courante, mode) vit dans ses `data-*`, le contournement est
  **éphémère** (revenir sur l'accueil ré-affiche la vraie leçon du jour).
- **`unlocks-view.ts`** — vitrines de déblocages (issue #28) : barre de l'accueil
  (`renderRewardNav` : boutons « Récompenses » / « Trophées » avec compteurs),
  ouverture des **modales dédiées** `openRecompenses` (paliers de niveau : rangs,
  compagnon, avatars, thèmes — acquis ✓ / à venir 🔒) et `openTrophees` (collection,
  sortie de l'inline ; réutilise le rendu `.trophy`), et la **mascotte accompagnante**
  `mascotteBulleHTML(message, loop)` + `encouragementMascotte()` (bulle de BD).
- **`cat-visuals.ts`** — visuels (icône + teinte de pastille) des matières et
  catégories, **source partagée** par `catalog-nav.ts` et `bilan.ts` (mêmes
  couleurs d'une catégorie d'un écran à l'autre).
- **`catalog-nav.ts`** — navigation **Matière → Catégorie → Leçons**
  (`renderSubjects`, `renderCategories`, `renderCategorie`) ; l'écran d'une
  catégorie donne accès au bilan express (borné) / complet, au sprint, et à
  « Je choisis mes leçons » (bilan sur mesure scopé à la catégorie). `renderCategorie`
  **regroupe les leçons par `rubrique`** (#109 : titres de section, ordre
  d'apparition ; sans rubrique = rendu à plat). L'écran **sur-mesure** de
  l'orthographe (`renderOrthoCategorie`) **regroupe ses leçons `LessonDef` par
  rubrique** — **« Les accords »** (transformation #109), **« Les homophones »**
  (QCM #110) et **« Les règles »** (m/b/p, QCM #111), lancées par le parcours
  standard saisie/QCM — au-dessus de **« Les dictées de mots »** (mots de base
  prédéfinis + listes du parent, jouées par le runner ortho dédié).
- **`bilan.ts`** — **bilan personnalisé** : `renderBilanConfigScreen(el, categoryId?)`.
  En **global**, les leçons sont organisées **Matière → Catégorie → Rubrique** (#195) :
  matières en **volets repliables** (`<details>`), catégories à pastille/gouttière
  colorée, rubriques reprenant le registre de l'écran de catégorie ; chaque niveau
  porte une **case parent à 3 états** (`.bc-group-check`, cochée/partielle/décochée)
  qui (dé)coche tout son périmètre, et un **compteur « x/y »** (`.bc-group-count`).
  En **scopé** à une catégorie (via `#bilan-cat-<id>`), même regroupement par
  rubrique sans les volets matière. Choix **bilan / sprint** (#64 : `BilanConfig.mode`,
  défaut `bilan`), choix du nombre de questions par intention (cartes verticales
  `.bc-nbq-item`, icône agrandie ; masqué en sprint),
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
  Affiche le champ optionnel **`explication`** de l'exercice QCM après la réponse
  (#110 : critère de substitution des homophones).
- **`lecon-tuiles.ts`** — runner **tuiles** d'une leçon de numération (#98) : même
  forme « une question à la fois » que le QCM, mais l'enfant **pose une tuile**
  (signe/nombre) dans l'emplacement par **tap ou glisser-déposer** ; parité
  `recordLessonRun`. Runner d'écran dédié (routé par `runLecon` quand le mode produit
  un `tuilesNombre`) — **n'altère pas** le moteur de tuiles de l'orthographe.
- **`lecon-ordre.ts`** — runner **« ranger une suite »** d'une leçon de vocabulaire
  (#108, ordre alphabétique). Même forme « une question à la fois » : l'enfant
  **tape** une tuile-mot du bac → elle se place dans la prochaine case **numérotée**
  de la rangée-réponse ; **taper** une tuile posée la renvoie au bac (les suivantes
  se re-tassent) ; glisser-déposer du bac vers la rangée en appoint. Feedback
  immédiat case par case (✓/✗) + bon ordre montré ; parité `recordLessonRun`. Routé
  par `runLecon` quand le mode produit un `tuilesOrdre`. Interaction validée côté
  UX enfant (tap fiable au doigt, drag en appoint).
- **`lecon-tri.ts`** — runner **« ranger par thème »** d'une leçon de vocabulaire
  (#114, champs lexicaux). « Une question à la fois » : l'enfant trie des
  tuiles-mots **fournies** dans **deux colonnes-thèmes** par **tap en deux temps**
  (taper une tuile la sélectionne, taper une colonne l'y dépose) ou glisser-déposer ;
  **taper** une tuile posée la renvoie au bac. Feedback immédiat tuile par tuile
  (✓/✗) + bon classement montré ; parité `recordLessonRun`. Routé par `runLecon`
  quand le mode produit un `tuilesTri`. Calqué sur `lecon-ordre.ts`.
- **`lecon-probleme.ts`** — runner **« Résolution de problèmes »** (#199), un
  problème à la fois. L'énoncé (`Exercise` `type: 'probleme'` : `enonce`, `etapes[]`,
  `parle`, `figure?` #95) reste visible avec **son bouton « Écouter »** (#42, `data-tts` = `parle`) ;
  **une** sous-question (problème simple) ou **deux** (problème à deux étapes —
  l'item multi-`@` arbitré par l'issue : sous-questions affichées d'emblée, étape 1 =
  intermédiaire, étape 2 = réponse finale). Chaque étape a sa réponse numérique
  (`data-answer`), corrigée indépendamment ; problème réussi si **toutes** ses étapes
  le sont. Parité `recordLessonRun`. Routé par `runLecon` via `generate(mode).type ===
  'probleme'` — **aiguillage sensible au mode** (#95) : un type mono-mode passe `mode`
  `undefined` et garde son comportement d'origine. **Réutilisé en multi-mode** par la
  leçon de **division avec reste** `math-div-reste` (#95) : mode `saisie` = `probleme` à
  deux sous-questions (quotient + reste), mode `qcm` via `lecon-qcm.ts` ;
  `runLeconProbleme(id, mode?)` transmet le mode à la génération, et le runner adapte ses
  libellés via **`ExerciseType.probLexique`** (« Calcul » au lieu de « Problème », badge
  « Étape » masqué) — le lexique par défaut préserve les libellés #199.
  Les énoncés sont **générés par gabarits** (structures de Vergnaud) dans
  `data/maths/problemes.ts` : positions d'inconnue variées, pièges « mots-clés »
  loyaux et minoritaires, calibrage CE2 (additifs ≤ 1000, multiplicatifs dans les
  tables, division exacte). **Catégorie `math-problemes`**, **exclue du sprint**
  (`isProblemeLesson`, comme la posée). Repli texte (énoncé + question finale) via
  `genLessonItem` pour le bilan / la révision. La **question finale en gras** passe
  par la convention `**…**` rendue par `enonceTexte` (`core/items.ts`).
- **`sprint.ts`** — mode sprint 5 min (compte à rebours, questions une par une),
  **filtrable** (toutes matières / une matière / une catégorie / **une sélection
  précise de leçons** via `startCustomSprint`, #64) via un écran de
  configuration ; correction par `checkItemAnswer` (numérique ou texte).
  **Exclusions du sprint** (`lessonsForFilter`) : par TYPE d'item (posée, tuiles
  ordre/tri, problème — détecté via `generate().type`) **et** par le flag
  déclaratif **`LessonDef.excludeFromSprint`** (#104) pour une leçon qui produit un
  item `text` ordinaire mais ne convient pas au chrono (figure de découverte,
  lecture d'énoncé — ex. « Je partage »). L'écran de config ne compte que les
  leçons **éligibles** (une catégorie entièrement exclue n'est pas proposée). Le
  réglage de profil **« sans pression temporelle »** (#223) masque le minuteur et le
  score ici et bascule la fin en mode doux — détaillé dans la section Accessibilité.
- **`session.ts`** — `verify` (correction + enregistrement), saisie clavier,
  impression contextuelle (#40) : **chemin A** `printAll()` imprime l'écran courant
  vierge (le CSS print met `.ans` en transparent) ; **chemin B** `printScope(scope)`
  pose un périmètre que `beforeprint` rend via `buildPrintableDOM(scope)`. Le 🖨 de
  la barre n'apparaît qu'en exercice (drapeau `print` de `setToolbar`).
- **`menu.ts`** — liste déroulante de profils (`open/close/toggleProfileMenu`),
  extrait pour éviter un cycle `main ↔ navigation`.
- **`preferences.ts`** — préférences cosmétiques **par profil** (issue #28) : thème
  d'affichage/couleur (`getTheme`/`setTheme`, gating par niveau) et réduction des animations
  (`animationsReduites`/`setAnimationsReduites`). `applyPreferences()` pose
  `<html data-theme>` + les classes `anim-reduced` / `confort-lecture` (appelé dans
  `route()` → couvre bootstrap et bascules de profil) ; `renderPreferences()` rend le
  bloc de l'écran Profils (thème, animations, **accessibilité**).
- **Thèmes d'affichage (#224)** — un seul attribut `data-theme` porte deux familles
  (cf. `core/unlocks.ts` `THEMES`) : les thèmes de **confort** (`confort: true`, `niveau: 1`,
  jamais gatés ni récompensés) — **Forêt** (`defaut`, clair), **Nuit** (`nuit`, sombre fixe),
  **Clair-obscur** (`auto`, suit le système) — et les thèmes de **couleur** débloqués par palier.
  Étant à `niveau: 1`, les confort passent le garde-fou de `getTheme`/`setTheme` sans cas
  particulier et `recompensesNiveau` (filtre `niveau > 1`) les ignore. `renderPreferences`
  scinde le sélecteur en deux sections (« Apparence » sans cadenas | « Thèmes à débloquer »).
  Le **mode sombre** (`styles/themes.scss`, mixins `nuit-palette`/`nuit-overrides`) **réécrit
  les tokens de base** (`--paper`, `--ink`, `--ok`/`--ko`…) — assumé, contrairement aux thèmes
  de couleur clairs — palette validée **WCAG AA**. Nouveaux tokens sémantiques dans `base.scss`
  (`--on-accent`, `--line`, `--track`, `--ok-soft`, `--ko-soft`) pour que les composants suivent
  le thème (fonds de cartes en `var(--paper)`, etc.). **Clair-obscur** n'est pas résolu en JS :
  `@media (prefers-color-scheme: dark)` applique la palette sombre à `[data-theme='auto']`,
  d'où une bascule **en direct** sans rechargement.
- **Accessibilité (#42)** — deux aides transverses, réglées **dans la méta de profil**
  (`Profile.prefs`, cf. `core/profiles.ts`) pour **survivre à « Réinitialiser »** (qui
  n'efface que les clés de données) ; câblées dans `exportProfiles`/`importProfiles` et
  bumpent `updatedAt` (`setPref`). (1) **Confort de lecture** (`confortLecture`) — classe
  `<html class="confort-lecture">` ; le SCSS (`styles/accessibility.scss`) garde Nunito
  mais augmente espacement + taille (figures SVG exclues). (2) **Bouton « Écouter la
  consigne »** (TTS) — `ui/consigne-tts.ts` greffe un bouton après chaque consigne portant
  un attribut `data-tts` ; le texte parlé est normalisé par `core/tts-text.ts`
  (`texteParle`/`ttsAttr` : retire le `@`, traduit `+ − × ÷ =` en mots, strip HTML).
  Lecture via `dicterConsigne` (`ui/tts.ts`, débit 0,92). **À la demande** ; **aucun bouton
  si pas de voix FR** (`dicteeDisponible`) ; lecture **auto** opt-in (`lectureConsigneAuto`,
  1re consigne seulement). Branché dans tous les runners d'exercice **sauf le sprint**
  (QCM, tuiles, ordre, tri, révision, et la fiche/bilan via `afterStart`).
  - **Dissociation affiché / lu** : un énoncé télégraphique (« pouvoir · présent — je @ »)
    est illisible tel quel à l'oral. Les générateurs peuvent donc poser un champ
    optionnel **`parle`** (sur `Exercise`, propagé à `Item` et lu en priorité par le bouton ;
    fallback `texteParle`). **Règle d'or** : `parle` ne contient **jamais** la réponse ni un
    indice — homophones et m/b/p y lisent **la consigne seule** (l'intonation/la nasale
    trahiraient la solution) ; comparaison, conjugaison, pronom sujet, accord sujet-verbe,
    classe, article reçoivent une **phrase reconstruite** qui nomme la tâche. Les options de
    QCM ne sont jamais lues (le `data-tts` ne porte que l'énoncé).
  - **Consigne de la fiche** : `ExerciseType.consigne` (optionnel) nomme la tâche
    (« Conjugue chaque verbe au présent. ») et remplace le générique « Écris la forme
    correcte. » (`core/build.ts`).
- **Sprint sans pression temporelle (#223)** — 3ᵉ préférence de profil
  (`ProfilePrefs.sansPressionTemporelle`, accesseur `sansPressionTemporelle()`, toggle
  `#prefSansChrono` « Masquer le minuteur » dans le bloc Accessibilité), pour les profils
  dys/TDAH chez qui le décompte visible est anxiogène. Vit dans la méta (survit à
  « Réinitialiser », exporté/fusionné avec le reste de `prefs`). Quand actif, `runSprint`
  **n'affiche ni `#sprintTime` ni `#sprintScore`** (révélés seulement au bilan), recentre
  le HUD (`.sprint-hud--calme`, ou pas de HUD du tout sans badge de filtre) et **ne pose
  jamais `.low`** (pas de signal d'urgence). Le **temps continue d'être mesuré** : `sprintTick`,
  les records/médailles/XP/objectif et `recordRun(…, SPRINT_MS)` sont **inchangés et communs**
  (pas de classement séparé ; le temps ne départage jamais, `ms` constant). **Fin douce** :
  à l'épuisement des 5 min, `sprintTick` pose `sprintTimeUp` et stoppe le ticker au lieu de
  couper net ; la finalisation attend la **fin de la question en cours** (`sprintAnswer` /
  `sprintContinue`). Réglage **non transverse** (propre au sprint), d'où un point distinct du
  trio #42 ci-dessus.

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
  `get/setRenderLesson`, `get/setPrintMode` (#289 : rendu papier des QCM en cases à
  cocher, posé/retiré autour de `buildPrintableDOM`), `get/setCorrigeMode` (#41 :
  sous-mode qui révèle les réponses pour le corrigé imprimable) ;
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

## Voix des libellés (« tu » / « je », #278)

Parti pris de rédaction de l'interface, fondé sur **qui parle** (acté #278 ;
avis `redacteur-contenu-francais` + `pedagogue-primaire`). Trois cas, à appliquer
dès la création d'un libellé :

- **(a) L'app parle À l'enfant → « tu »** (voix par défaut) : titres d'écran et de
  section, questions de réglage, consignes, encouragements, messages d'état.
  Ex. « Ta prochaine leçon », « Dans quelle matière ? », « Sur quoi veux-tu
  t'entraîner ? », « Bravo ! Tu as fait le tour… ».
- **(b) Le libellé EST la voix de l'enfant → « je / mon / mes »** (conservé
  volontairement, **ne pas tutoyer**) : (1) **boutons d'action/de choix** que
  l'enfant « prononce » en cliquant (« J'ai compris », « Je choisis mes leçons »,
  « Non, je garde », « J'ai besoin d'un brouillon ») ; (2) **possessifs de
  collections** qui portent la fierté/appropriation (« Mes trophées »,
  « Mes objectifs », « Mes récompenses », « Mes listes »).
- **(c) La mascotte / l'app se décrit → « je »** (conservé) : la mascotte est le
  sujet du verbe. Ex. « Je me mets à jour… je reviens tout de suite ! »,
  « Un instant, je prépare tes mots… ». Les tutoyer serait un contresens.

Le défaut à corriger = un cas (a) **déguisé en (b)** : un titre/une question posés
par l'interface mais rédigés en « je ». Règle mnémotechnique : si on peut préfixer
par « [La mascotte te demande :] » → cas (a), « tu » ; par « [L'enfant clique et
pense :] » → cas (b), « je ». Ne **pas** réécrire les cas (b)/(c) en « tu » : on
perdrait la chaleur (possessifs froids, boutons agrammaticaux, mascotte absurde).

## Titres sémantiques & hiérarchie (#277)

Chaque **écran** (`.screen-only`) porte **son propre `<h1>`** identifiant la page :
soit la promotion du titre visuel `.big` en `<h1 class="big">` (le style reste sur
la classe, rendu inchangé), soit — quand l'écran n'a pas de titre texte (accueil) —
un `<h1 class="sr-only">` réservé au lecteur d'écran. Les écrans cachés étant en
`display:none` (retirés de l'arbre a11y), un seul `<h1>` est exposé à la fois.
Le **branding « Ludaskia »** de la barre n'est **plus un `<h1>`** mais un **lien
vers l'accueil** (`<a class="toolbar-brand">`) dans l'en-tête `<header class="toolbar">`
(landmark `banner`) ; son `aria-label` garde un nom accessible même quand le texte
est masqué (< 600 px). Les sous-titres de réglage (config sprint) sont des `<h2>`
portant l'`id` cible de l'`aria-labelledby` du `radiogroup` (un seul nœud). **Tout
nouvel écran doit suivre ce schéma** (un `<h1>` propre, jamais réintroduire un titre
global dans la barre).

## Données (`localStorage`)
Tout passe par `lsGet/lsSet`. Les clés sont **préfixées par le profil actif**
(`<uuid>/ludaskia_…`) sauf la méta globale `ludaskia_profiles`. Clés par profil :
`ludaskia_runs_{complet,express,sprint,revision-espacee}` (le dernier non classé,
décompte d'objectif seul), `ludaskia_streak`, `ludaskia_stars`,
`ludaskia_lessonStats`, `ludaskia_lessonFirstSeen` (date du 1er passage par
leçon, objectif « nouvelle leçon »), `ludaskia_lessonRevision` (état SR par leçon),
`ludaskia_goal`, `ludaskia_goalsDone`, `ludaskia_trophies`, `ludaskia_xp`,
`ludaskia_bilans` (configs de bilans favoris), `ludaskia_resume` (exercices
grille **en cours**, repris ou abandonnés — #63). L'état SR des **mots**
d'orthographe vit dans `ludaskia_ortho` (`MotOrtho.revision`). Un `MotOrtho`
porte aussi des **formes fléchies** optionnelles (`formes?: FormesAccord` — masc/fém
× sing/plur, #109), saisissables par le parent dans l'éditeur de listes et
exploitées par la leçon d'accords.
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
- **Objectifs de régularité** (panneau d'accueil, hebdomadaires, `REGULARITY`) :
  **2 sprints**, **3 révisions** (sessions de répétition espacée *terminées*) et
  **1 nouvelle leçon** par semaine (#178). Ces trois pratiques constituent un
  usage sain (un peu de chrono, de l'entretien espacé, de la découverte) ; les
  bilans express/complet n'y figurent plus. Comptage : `countSince(mode, since)`
  pour sprint et `revision-espacee` — **tous niveaux confondus** (effort global :
  changer de classe en cours de semaine ne remet pas l'objectif à zéro, #233) ;
  une session terminée enregistre un `run` non classé, juste pour le décompte ;
  `countNewLessonsSince(since)` pour la
  nouvelle leçon, à partir du **premier passage daté par leçon**
  (`ludaskia_lessonFirstSeen`, posé dans `recordLessonStats` à la 1re rencontre).
  L'objectif « nouvelle leçon » est **masqué** quand le catalogue est entièrement
  découvert et qu'aucune découverte n'a eu lieu cette semaine (pas d'objectif
  fantôme jamais cochable).
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

## Niveaux scolaires (#225)
Le **niveau scolaire** (`SchoolLevel = cp|ce1|ce2|cm1|cm2|6e`) est un **réglage de
contenu**, par matière — distinct du niveau d'**XP** (récompense). Vocabulaire enfant :
« **classe** » pour le scolaire, « niveau »/rang pour l'XP.

- **`levels.ts`** (pur) — `LEVEL_ORDER`, `LEVEL_LABEL`, `effectiveLevel(lesson, niveau)`
  et `closestSupported(supported, niveau)` (niveau demandé, sinon plus haut supporté
  **en-dessous**, sinon plus bas — repli/clamp), `availableLevels(lessons)` (union des
  niveaux présents), `lessonsForLevel(lessons, niveau)`.
- **`level-combinators.ts`** (pur) — `calibrated(table, build)` : **un seul `id`**
  recalibré par une table de paramètres par niveau (génératif : numération…), expose
  ses `levels`; `bankByLevel(items)` : banque QCM tagguée par item, dérive l'union des
  niveaux. Le catalogue dérive `LessonDef.levels` de ces combinateurs (numération) ou
  de la donnée (conjugaison taggée).
- **`niveau-actif.ts`** — résout le niveau au **seam** profil/catalogue (lit la méta
  profil **directement** via `storage`, pour éviter un cycle `progress → niveau-actif →
  profiles`). `niveauActif()` (classe de référence), `niveauActifMatiere(subject)`
  (= `niveauParMatiere[subject] ?? niveauReference ?? plus bas dispo`), `niveauLecon(lesson)`
  (= `effectiveLevel` sur la matière, **passé à `generate`/`genLessonItem`** par
  `build`/runners/`revision`/`sprint`), `besoinChoixNiveau()`, `lessonsNiveauActif()`.
- **Progression namespacée `lessonId@niveau`** (`progress.ts`) — étoiles, stats,
  premier passage, **état SR**. Les `load*` renvoient une **vue scopée** au niveau actif
  **par matière** (clés `lessonId` simples → consommateurs inchangés) ; les `load*All`
  / `starsEarnedAll` agrègent **tous niveaux** (effort, cumul « trésor » qui ne baisse
  jamais). Écriture clampée via `niveauLecon`. Migration unique `migrateNiveauNamespacing`
  (legacy → `@ce2`, via `lsSetQuiet` pour ne pas bumper `updatedAt`).
- **Scoping gamification** (`rewards.ts`) — **complétude** (`starsAll`, `allgreen`, par
  matière/catégorie) et **objectif du jour** scopés au niveau actif ; **XP, déblocages
  (forêt), trophées d'effort/régularité (`vol`/`sprint`/`streak`/`goal`/`ortho`)
  restent GLOBAUX** (`loadRunsAll` agrège tous niveaux — un trophée acquis ne se
  reverrouille jamais au changement de classe).
- **Records de bilans/sprint SCOPÉS par niveau** (`progress.ts`, #233) — clé
  `ludaskia_runs_<mode>@<niveau>` (le niveau d'un record = **niveau actif**, un
  sprint/bilan balayant le catalogue du niveau et non une matière). `loadRuns(mode)`
  renvoie le **classement du niveau actif** (podiums/records affichés) ; `loadRunsAll(mode)`
  agrège **tous niveaux** pour les compteurs d'EFFORT globaux (trophées, `countSince`).
  Migration `migrateRunsNamespacing` (legacy `ludaskia_runs_<mode>` globale → `@ce2`,
  silencieuse) intégrée à `migrateNiveauNamespacing`. Le défi quotidien « bats ton
  record de sprint » reste, lui, scopé au niveau actif (pas un trophée).
- **UI** — popup de **choix de classe** (`ui/onboarding.ts`, choix forcé, déclenchée si
  `besoinChoixNiveau()`), filtrage catalogue/sprint par `niveauActifMatiere`, **réglage
  parent** par matière (`ui/preferences.ts`), compteur d'accueil (cumul + objectif
  scopé), badge « déjà maîtrisée en \<classe\> » (`etoileAuxNiveaux`). **V1 = niveau
  actif seul** dans les pools ; mélange bas-niveau + entretien révision = **V2** (piste).

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
  `dist/` sur GitHub Pages **quand une release GitHub est publiée**
  (`on: release: published`) ; `workflow_dispatch` en filet manuel. Merger une PR
  sur `main` **ne déploie plus** : `main` est la ligne d'intégration (on y
  consolide plusieurs PR), la mise en prod est une **release délibérée**. Tag
  calendaire `vAAAA.MM.JJ` (suffixe `.2`, `.3`… si plusieurs le même jour),
  publiée via l'agent `gestionnaire-github`. Le `GITHUB_SHA` de l'événement
  release pointe sur le commit du tag → l'estampille SHA reste correcte.
- **Estampille de version** : `vite.config.ts` calcule une `buildVersion` (SHA
  court du commit via `GITHUB_SHA` en CI, sinon horodatage local), l'injecte dans
  l'app (`define: __APP_VERSION__`) **et** émet un `dist/version.json`
  (`{ "version": … }`) via un petit plugin. C'est le socle de l'auto-actualisation.

### Auto-actualisation (onglet toujours à jour)
Pensé pour un enfant qui garde l'onglet ouvert et ne pense pas à rafraîchir après
un déploiement. Logique **pure** dans `core/version.ts` (`APP_VERSION`,
`isNewerVersion`, `canReloadNow` + seuils), orchestration DOM/réseau dans
`ui/version-check.ts` (`initVersionCheck`, branché depuis `main.ts`).
- **Détection** : on interroge `version.json` (sans cache, anti-cache `?t=`) au
  **retour sur l'onglet** (`visibilitychange` → visible) et par **sondage
  périodique** (5 min), débridé anti-rafale. Version distante ≠ `APP_VERSION` →
  mise à jour en attente.
- **Rechargement à un moment SÛR uniquement** (`canReloadNow`) : sur un **écran
  calme** (un conteneur « menu » visible — accueil, navigation, profils…), **hors
  exercice**, **jamais** pendant sprint/révision (perte de progression), après un
  court **délai d'inactivité** (`minIdleMs`) et un instant après le retour sur
  l'onglet (`minVisibleMs`). Sinon on **reporte** au prochain moment calme.
- **Anti-boucle** : la version cible est notée en `sessionStorage`
  (`ludaskia_update_reloaded`) **avant** le reload → on ne recharge qu'**une fois
  par version** dans l'onglet (garde-fou si un cache CDN ressert un `index.html`
  périmé).
- **Rendu** : juste avant le reload, un **voile** (`.update-overlay`,
  `styles/version-update.scss`) porté par la **mascotte** masque le flash blanc
  et donne un repère de continuité ; le message est **lu en TTS** (best-effort, en
  appui du texte). Respecte `prefers-reduced-motion` / `anim-reduced`. Avis UX
  enfant + troubles/attention intégrés (message concret « je me mets à jour », pas
  de « version », pas de bouton, ton « bonne nouvelle »).

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
- **niveaux scolaires — V2** (#225) : mélange biaisé vers le bas dans les pools de
  tirage (sprint / révision : ≈ 80 % niveau actif / 15 % −1 / 2 % −2), **entretien des
  acquis du niveau inférieur** en révision espacée, et davantage de contenu CM1 (le
  filtrage, le namespacing `@niveau` et le calibrage par niveau sont déjà en place) ;
- **affiner** la révision espacée : réglage de l'escalier d'intervalles, et
  généralisation (la brique `revision.ts` est déjà agnostique du type d'élément).
- **corrigé imprimable** (page réponses) et **accessibilité/dys** de l'impression
  (police, contraste) — hors périmètre de #40, à explorer.
