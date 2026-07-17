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

## Déclarations mutualisées (`src/data/`)

### `src/data/_shared.ts` (#347)

Centralise deux éléments redéclarés jusqu'ici dans chaque fichier de données :

**Mode QCM** — deux constantes `ModeOption` prêtes à l'emploi, ne différant **que**
par l'icône :

- **`MODE_QCM_POINT`** (`hand-pointing`, « je désigne ») — QCM de **maths** et les
  rares leçons français où l'enfant pointe une proposition (accord-groupe-nominal,
  participe-passe-etre).
- **`MODE_QCM_CHECK`** (`check-circle`, « je valide ») — QCM de **français** (règle
  générale ; 2 exceptions ci-dessus utilisent `hand-pointing`).

Les deux ont `id: 'qcm'`, `label: 'Je choisis la bonne réponse'` et
`recommended: true`. Un fichier qui a besoin d'un libellé différent ou d'un autre
réglage part de la constante et surcharge par diffusion :

```ts
{ ...MODE_QCM_POINT, label: 'Je choisis la bonne fraction' }
{ ...MODE_QCM_CHECK, recommended: false, hint: 'plus facile pour commencer' }
```

La règle maths / français est historique ; l'unifier serait une décision UX distincte.
Le contrat des deux constantes est verrouillé par `tests/data-shared.test.ts`.

**Type source d'une leçon** — **`LessonInput { id; label; exerciseType }`** : forme
minimale d'un descripteur de leçon dans `src/data/`, **avant** que `core/catalog.ts`
ne la mappe en `LessonDef` complet — mapping fait, pour la plupart des familles, par
la fabrique **`toLessonDefs(inputs, opts)`** (#373, cf. [Logique pure](core.md)). Les
listes `XXX_LESSONS` sont typées `LessonInput[]`. Un fichier qui porte des champs
propres (rubrique, niveaux, exclusion du sprint) **étend** ce type plutôt que de le
redéclarer : `extends LessonInput`. `ConjLessonDesc` (`conjugaison.ts`, sans
`exerciseType`) reste hors de ce type — et hors de `toLessonDefs`, en conséquence.

### `src/data/maths/_shared.ts` (#347, #372)

Centralise **`PropQ { q; a; choices }`** : question fermée à choix multiples d'une
propriété géométrique (nombre de faces, de côtés, etc.), ainsi que deux fabriques qui
l'exploitent :

- **`propQExercise(banque)`** — tire une `PropQ` de la banque et la met en forme en
  `Exercise` QCM (propositions mélangées). Sert aussi quand `propQType` ne s'applique pas
  tel quel : `geometrie-cm1.ts` l'appelle pour injecter ~30 % de questions de propriété
  dans le tirage mixte de `geo-cm1-quadrilateres` (leçon par ailleurs orientée
  reconnaissance visuelle) et pour `geo-cm1-polyedre` (QCM à réponses textuelles, dont le
  `check` est `checkAnswer` et non `checkNumeriqueOuTexte`).
- **`propQType(banque, modes = [MODE_QCM_POINT])`** — fabrique d'`ExerciseType` complète
  pour une leçon **entièrement** QCM de propriétés : `generate` délègue à `propQExercise`,
  `check` est `checkNumeriqueOuTexte` (`core/check-helpers.ts`).

Utilisées par `geo-figures-proprietes` (`geometrie.ts`), `geo-solides-proprietes`
(`solides.ts`) et `geo-cm1-triangles-prop` (`geometrie-cm1.ts`) via `propQType` ; par le
tirage mixte de `geo-cm1-quadrilateres` et le QCM `geo-cm1-polyedre` (`geometrie-cm1.ts`)
via `propQExercise`. Ces cinq fabriques recopiaient auparavant la même logique de tirage à
l'identique.

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

#### `francais/phrases.ts` (#204, CM1 #245)

rubrique **« Les phrases »**, 4 leçons QCM (exclues du sprint), niveaux portés **par
leçon** (`PhraseLessonDef.levels`, branché au catalogue via `d.levels`) :

- **« Quel point à la fin ? »** (`fr-gram-ponctuation`, **CE2** — choisir `.`, `?` ou
  `!` ; variante de présentation `ponctuation` du runner QCM = boutons-symboles glyphe +
  mot, trou final en cadre pointillé, cf. `ui/ponctuation-view.ts`).
- **« Quel type de phrase ? »** (`fr-gram-type-phrase`, **CE2 + CM1** — déclaratif /
  interrogatif / impératif ; l'exclamative est une **forme**, pas un type, B.O. 2025 :
  les **3 types sont inchangés**, la leçon s'ouvre simplement au CM1).
- **« Affirmative ou négative ? »** (`fr-gram-forme`, **CM1**, #245 — QCM 2 options sur
  l'axe **FORME** : `FormePhrase = affirmative | negative`, banque `PHRASES_FORME`,
  libellés `FORME_LABELS`). Identification : les négatives portent un **marqueur
  explicite** (« ne… pas » majoritaire, quelques « ne… plus/jamais/rien »), les
  affirmatives aucun.
- **« Mets à la forme négative »** (`fr-gram-transfo-negative`, **CM1**, #245 — QCM
  3 options de **transformation** affirmative → négative ; banque `PHRASES_TRANSFO`). La
  négative correcte (« ne… pas » seul → **réponse unique**) et les **distracteurs francs
  sont STOCKÉS** (négation mal placée, « pas » orphelin, élision « n' » oubliée), jamais
  une saisie libre ni une négation calculée à la volée. Options empilées
  (`choicesEmpilees`).

**Type et forme sont des axes ORTHOGONAUX, jamais mêlés dans une même question** (avis
pédagogue) : l'exclamative reste traitée par le « ! » de F1, jamais sur l'axe forme.
Banques relues par l'agent pédagogue : chaque phrase porte un **marqueur explicite**
(de sens pour le type, de négation pour la forme), mélange volontaire point ≠ type
(raisonner sur le sens, pas le symbole), `explication` citant le marqueur **jamais
l'intonation**. Le TTS lit la phrase **sans** la ponctuation finale (la lire avec
l'intonation donnerait la réponse). Ordre pédagogique `francais.cm1` : les 3 leçons de
grammaire en tête (type → forme → transformation négative), avant la conjugaison.

### Conjugaison

#### `francais/conjugaison.ts` (conjugaison CM1 #239)

tables de 13 verbes (être, avoir,
1er groupe *aimer*, 2e groupe *finir*, aller, faire, venir, voir, dire, pouvoir,
vouloir, prendre, naître) aux 4 temps **présent**, **futur**, **imparfait** et
**passé composé** (les formes du passé composé incluent l'auxiliaire conjugué),
fabrique `conjugationType(verbId, tense)` (un `ExerciseType` à deux modes,
**choisissables depuis la leçon** (#69) : `saisie` **conseillé** — l'enfant écrit
la forme, fiche imprimable — et `qcm` — choix entre plusieurs formes,
**distracteurs dérivés du paradigme** du verbe, toutes de **vraies formes
correctement orthographiées**, jamais une faute affichée) et descripteurs
`CONJ_LESSONS` (une leçon par verbe × temps). **Multi-niveaux** : **tout le corpus**
(13 verbes × 4 temps = 52 leçons) est ouvert **CE2 + CM1** — tag **additif**
`['ce2','cm1']` porté par chaque descripteur (le CE2 n'est jamais retiré). Le passé
simple et le plus-que-parfait (attendus CM2) ne sont **pas** dans le corpus, donc
hors périmètre. `VERB_GROUPE` (groupe de chaque verbe, auxiliaires à part) est exporté
pour les QCM méta ci-dessous.

#### `francais/conjugaison-meta.ts` (#239)

**3 leçons CE2 + CM1** de **reconnaissance** (QCM mono-mode, `levels: ['ce2','cm1']` —
ces notions sont aussi vues au CE2, comme le corpus verbe × temps), regroupées
sous la rubrique **« Reconnaître les verbes »** de la catégorie Conjugaison et
**exclues du sprint** (`excludeFromSprint`, comme les autres QCM à libellés longs).
**« 1er, 2e ou 3e groupe ? »** porte `repere: 'plus-difficile'` (pastille « plus
dur ») et est posée en **fin de programme CE2** (`ordre-pedagogique.ts`) : la notion
de groupe est en retrait au cycle 2 et le 2e groupe (« finir ») y est piégeux ; une
variante CE2 dédiée pourra venir plus tard. Au CM1, « groupe » arrive tôt (après le
présent).
Elles prennent du recul sur le paradigme travaillé verbe par verbe (`CONJ_LESSONS`) :
**« Temps simple ou composé ? »** (`fr-conj-simple-compose`, 2 options empilées, via
l'**indice observable** de l'**auxiliaire** — « avoir »/« être » devant le verbe = composé,
verbe tout seul = simple — plutôt que l'étiquette abstraite ou le nombre de mots),
**« 1er, 2e ou 3e groupe ? »** (`fr-conj-groupe`, 3 vraies étiquettes ; auxiliaires
**exclus** — hors groupes ; `aller` gardé comme **piège enseigné**, -er mais 3e groupe,
explication dédiée) et **« Quel est l'infinitif ? »** (`fr-conj-infinitif`, distracteurs =
**vrais infinitifs** d'autres verbes du corpus). Les banques sont **dérivées de `VERBS`**
(aucune forme écrite en dur ici) ; distracteurs = vraies étiquettes / vraies formes
(invariant du moteur : jamais une faute affichée). Branchées au catalogue via
`CONJ_META_LESSONS` (`core/catalog.ts`).

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

#### `francais/accords.ts` (#109, #243)

catégorie **Orthographe**, rubrique « Les
accords » — 2 leçons CE2 de **transformation** (pluriel/féminin) `fr-accords-reguliers`
et `fr-accords-irreguliers` (séparation règle/exception, avis pédagogique) **plus**
une leçon CM1 `fr-accords-cm1` (« Pluriel et féminin — au CM1 », #243, banque plus
exigeante : adjectifs -er/-ère, -f/-ve, -et/-ète sans doublement, -eur/-euse &
-teur/-trice, -al/-aux + noms à pluriel -aux, avec le piège festival/festivals).
`accordType({ banque, inclureFlechies? })` fabrique un `ExerciseType` **deux modes**
(saisie/QCM, moteur de la conjugaison) à partir d'une **banque** `FormesAccord[]` :
`generate()` tire une transformation (« Mets au pluriel : grand → @ ») dont la
réponse est la **forme stockée** (jamais déduite) ; QCM aux distracteurs = **vraies
formes** (jamais une faute affichée) ; **repli mots longs** = les formes cibles
longues ne sont proposées **qu'en QCM** (chaque mode reste stable en type, contrainte
du routage des runners). Seule la leçon des réguliers active `inclureFlechies` :
elle complète son pool avec les **mots fléchis de la banque** du profil
(`MotOrtho.formes`, saisis par le parent), qui « remontent » dans les exercices ;
les leçons irréguliers et CM1 gardent une **banque prédéfinie pure** (pas de mixage).

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

#### `francais/accord-groupe-nominal.ts` (#243, CM1)

catégorie **Orthographe**, rubrique « Les accords » — leçon **« Accorder tout le
groupe »** (`fr-accords-groupe-nominal`), **QCM rigoureux** calqué sur le participe
passé : on montre un **groupe nominal** court au singulier (« le petit chat → @ »),
l'enfant choisit le groupe **entièrement accordé** parmi **3 options**. Chaque
distracteur **casse exactement une marque** (déterminant **OU** adjectif **OU** nom)
en laissant un constituant à sa forme de départ — tous les tokens restent de **vraies
formes** (la bonne réponse et les distracteurs sont **dérivés par assemblage** des
formes stockées de chaque constituant, jamais une chaîne mal accordée tapée à la
main). Modèle de données : chaque `GroupeNominal` liste ses `constituants`
(`{ depart, cible, marque }`) dans l'ordre d'affichage (déterminant + nom,
éventuellement + adjectif antéposé **ou** postposé ; 3 max). Accords **réguliers**
seulement (-s / -e ; le/les, la/les, un/des, une/des, **de/des** pour le pluriel
indéfini antéposé) — les irréguliers relèvent de `accords.ts`. UX : **surlignage
`.term`** de la marque sur **chaque** constituant et **uniformément** sur tous les
choix (déterminant entier, suffixe d'adjectif/nom via préfixe commun ; un suffixe
vide reste un span vide, donc ne trahit pas la réponse), **options empilées**, **pas
de TTS** (petit/petits homophones), **explication unique** de la chaîne d'accord.
Leçon **« plus dur »** et **exclue du sprint**.

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
`renderOrthoCategorie`. Détail du moteur : `docs/design-orthographe.md`. N'étant pas des
`LessonDef`, ni les listes prédéfinies ni celles du parent ne bénéficient nativement du
suivi de maîtrise/épinglage du catalogue : depuis #424, ils sont recréés à part pour
l'orthographe — cf. [Espace encadrant § Listes de dictée](espace-encadrant.md).

### Vocabulaire

#### `francais/familles.ts` (#113, #244)

catégorie **Vocabulaire**, leçon CE2 **« Familles,
préfixes et suffixes »** (`fr-vocab-familles`). QCM de reconnaissance 3 options, trois
types équilibrés : familles de mots (bonne réponse + **faux-ami** plausible d'une autre
famille + intrus), préfixes (re-, dé-, in-/im-, pré-, sur-, sous-) et suffixes
(-eur/-euse, -tion/-sion, -ment, -able/-ible, -ette) où l'on décode le sens. Un builder
unifie les 3 banques en items `{ question, reponse, distracteurs, explication }`.
Relue par l'agent pédagogue (faux-amis vérifiés au CNRTL : retrait de laitue←lait,
pommade←pomme… qui étaient en réalité de la même famille).
Le moteur **`famillesType(items)`** reçoit un **pool d'items** (#244) ; la leçon CE2 lui
passe le pool combiné `ITEMS_FAMILLES` (familles + préfixes + suffixes). Deux leçons **CM1**
(`levels: ['cm1']`) séparent les axes : **« Familles de mots (CM1) »** (`fr-vocab-familles-cm1`,
pool `ITEMS_FAMILLES_CM1` = familles à dérivation moins transparente) et **« Préfixes et
suffixes (CM1) »** (`fr-vocab-affixes-cm1`, pool `ITEMS_AFFIXES_CM1` = préfixes savants
anti-/trans-/bi-/tri-/inter-/télé- + suffixes nominaux -age, -eur *qualité*, -iste, -ier/-er,
-itude). Les sous-pools CE2 `ITEMS_FAMILLES_SEULES` / `ITEMS_AFFIXES` sont aussi exposés.
Banques CM1 **additives** (CE2 gelé) ; aucune réponse/cible CM1 ne duplique exactement un
item CE2 du même type (vérifié en test).

**Appariement (#392)** — s'ajoute une seconde leçon CE2 sur la **même banque**
`FAMILLES` (base ↔ dérivé), format d'interaction différent : **« Familles de mots à
relier »** (`fr-vocab-familles-relier`), placée dans l'ordre pédagogique juste après
`fr-vocab-familles` (interleaving : varier le format de rappel renforce la
rétention). Le moteur **`appariementType(source)`** produit un `Exercise`
`appariement` {question, paires: {gauche, droite}[], intrus?} : chaque manche tire
4 paires (mot de base ↔ dérivé) **distinctes** entre elles, plus jusqu'à 2 décoys
(les **faux-amis** des familles tirées, ex. « dentelle » pour « dent/dentiste ») en
mots « intrus » côté droite, sans correspondance — neutralise la réussite par
élimination sur la dernière paire. Joué par le runner dédié `ui/lecon-appariement.ts`
(colonnes mélangées indépendamment, lignes de liaison) ; `exerciseKind: 'appariement'`
l'exclut du sprint. N'affecte pas `fr-vocab-familles`, qui reste la leçon QCM
existante.

#### `francais/sens-figure.ts` (#112)

catégorie **Vocabulaire**, leçon **« Sens
propre / sens figuré »** (`fr-vocab-sens`). QCM 3 options : courte phrase +
« Ici, « X » veut dire : ? ». Données **par mot** (chaque verbe porte ses 3 options
fixes propre/figuré/distracteur ; seules les phrases et le `sens` varient → les
deux sens sont toujours proposés, pas de clé erronée), équilibre propre/figuré.
Feedback `explication` rappelant le sens employé. Relue par l'agent pédagogue.

#### `francais/synonymes-contraires.ts` (#203, #244)

catégorie **Vocabulaire**, rubrique
**« Synonymes et contraires »**. Au CE2, deux leçons dans l'ordre pédagogique **« Les
contraires »** (`fr-vocab-contraires`, antonymes) puis **« Les mots de sens
proche »** (`fr-vocab-sens-proche`, synonymes). QCM 3 options ; le **mot-cible est
en gras** (`**…**` rendu par `enonceTexte`) dans une phrase courte ; distracteurs
**francs** (aucun quasi-synonyme, aucun mot déjà dans la phrase). Le moteur
**`sensType(items)`** reçoit un **pool d'items** ; deux pools CM1 (`ITEMS_CONTRAIRES_CM1`,
`ITEMS_SENS_PROCHE_CM1`) alimentent deux leçons **CM1** (`levels: ['cm1']`) :
**« Les contraires (CM1) »** (`fr-vocab-contraires-cm1`) et **« Les mots de sens proche
(CM1) »** (`fr-vocab-sens-proche-cm1`), lexique un cran au-dessus (généreux/avare,
périlleux, persuasif…), banques **additives** (CE2 gelé) sans doublon de réponse CE2↔CM1
du même type. Le runner QCM affiche une **consigne renforcée** + **picto** (`↔` / `=`) et
greffe un bouton TTS sur le mot-cible et chaque option (champs **`consigne`/`picto`/`ttsItems`**
de la variante `qcm`, `ui/consigne-tts.ts → bindItemTts`). La lecture vocale **nomme** le
mot-cible (le gras est muet à l'oral). **Exclues du sprint** (`excludeFromSprint`).
Banques relues par les agents pédagogue (justesse, distracteurs francs) et langue
(accords, registre).

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
les espaces de groupement (`nettoyerSaisieNombre`). Le signe de comparaison se pose via
un **pavé de 3 boutons** dédié (`.ans-signe`, sans clavier virtuel) plutôt qu'à la frappe
libre — #380, `core/signes.ts` ; même mécanisme, transverse, pour `num-dec-comparer`
(ci-dessous). Tous les grands nombres affichés sont
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

#### `maths/decimaux.ts` (#246, CM1) — rubrique « Nombres décimaux »

5 leçons **CM1 only** (`levels: ['cm1']` — le CE2 n'est pas retouché, il ne connaît
le décimal que via la monnaie, `maths/monnaie.ts`) : premier contact avec le nombre
décimal général, dans l'ordre position → rôle du zéro → comparer → encadrer →
ranger (capstone de la numération CM1 dans `ordre-pedagogique.ts`, placé après la
géométrie CM1). **Borne dure** (programme 2025, « au plus deux chiffres après la
virgule ») : un décimal est représenté en interne par sa valeur en **centièmes**
(entier) + le nombre de décimales affichées (1 ou 2) — la génération ne peut donc
jamais produire de millième (réservé au CM2).

- **« Le chiffre des dixièmes et des centièmes »** (`num-dec-position`) — saisie
  mono-mode, réponse = un chiffre (0-9), cible le **rôle du zéro** (« Dans 3,04, le
  chiffre des dixièmes ? » → 0).
- **« Le même nombre ? »** (`num-dec-egales`) — QCM oui/non : deux écritures
  désignent-elles la même valeur (zéro **final**, « 3,4 »/« 3,40 ») ou des valeurs
  différentes (zéro **médian** trompeur, « 3,4 »/« 3,04 ») ?
- **« Je compare les nombres décimaux »** (`num-dec-comparer`) et **« J'encadre
  entre deux entiers »** (`num-dec-encadrer`) — deux modes **saisie/tuiles**, calqués
  sur `numeration.ts` (#98) : le mode tuiles produit un `Exercise` `tuilesNombre`,
  rendu par le même runner `ui/lecon-tuiles.ts`. Distracteurs pédagogiques stockés
  (parties entières inversées portant les plus grandes décimales, décimales de
  longueurs différentes, borne avant/après confondue).
- **« Je range les nombres décimaux »** (`num-dec-ranger`) — QCM à 3 nombres,
  **pas de glisser-déposer** : réutilise le runner QCM plutôt qu'une interaction
  motrice nouvelle ; distracteurs = l'ordre « naïf » (décimales lues comme un
  entier) et l'ordre inverse du bon.

Aucune leçon de #246 ne fait **taper** un décimal (réponse = signe / chiffre /
entier) : la correction réutilise `checkNumerique`/`checkNumeriqueOuTexte` (#346,
cf. [Logique pure](core.md)) sans toucher `core/exercise.ts`. (Ce n'est plus vrai de
tout le multi-niveaux CM1 : les conversions `maths/mesures.ts` font taper une
réponse décimale, « 4,56 » — #248, cf. plus bas.) La lecture TTS d'un décimal épelle
sa partie décimale **chiffre à chiffre** (`epelerDecimales`, `core/tts-text.ts`)
pour ne pas « avaler » le zéro médian (« 3,04 » → « trois virgule zéro quatre ») ;
les montants en euros (`monnaie.ts`) restent lus nativement, exclus par ce même
moteur. Branché au catalogue via `DECIMAUX_LESSONS_DEFS` (`core/catalog.ts`).

#### `maths/decimaux-ecritures.ts` (#247, CM1) — rubrique « Nombres décimaux »

4 leçons **CM1 only**, dans la **même rubrique** « Nombres décimaux » que #246 (juste
après, dans `ordre-pedagogique.ts`) : elles relient les trois écritures d'un décimal —
**fraction décimale** (n/10, n/100), **écriture à virgule** et **décomposition**. Même
**borne dure** (centièmes au plus ; dénominateur ∈ {10, 100}).

- **« Une fraction, une écriture à virgule »** (`num-dec-grille`) — QCM avec une
  **figure grille 10×10** (`FigureSpec` `grilleCentiemes`, `core/figures/decimaux.ts`) :
  `parts` cases coloriées ligne par ligne (1 ligne = 1 dixième). On demande la fraction
  **ou** l'écriture à virgule. Porte le **piège du zéro** (4/100 → 0,04 et non 0,4) et la
  **confusion de rang** (n/100 lu n/10).
- **« Une fraction décimale plus grande que 1 »** (`num-dec-frac-superieure`) — QCM
  symbolique dans les **deux sens** (42/10 ↔ 4,2 ; 342/100 ↔ 3,42) ; distracteur ciblé =
  la confusion de rang (même numérateur sur l'autre dénominateur).
- **« Je décompose un nombre décimal »** (`num-dec-decomposer`) — **saisie** « un terme
  troué » sur le modèle de `decomposeFact` (`position.ts`) : `E,dc = E + d/10 + c/100`,
  un rang troué (dixième/centième dominant, entier en appoint), réponse = un **entier**
  (rôle du zéro inclus). Un trou de rang décimal (`@/10`, `@/100`) se rend **empilé** — le
  champ noté (`.ans` + `.frac-num-input`) dans le numérateur, homogène avec les fractions
  montrées ; cf. `renderItem` (`core/items.ts`) qui détecte ce motif et `.frac-num-input`
  (`sprint.scss`). Le trou de la partie entière (`@ + …`) reste un `.ans` normal.
- **« Je recompose un nombre décimal »** (`num-dec-recomposer`) — **QCM** réciproque
  (programme §1.3, « … et réciproquement ») : on montre une somme de fractions décimales
  (`42 + 4/10 + 8/100 = ?`, zéro de cadrage explicite `3 + 0/10 + 5/100`, ou 2 termes
  faciles `3 + 5/100`) et on choisit l'écriture à virgule. Distracteurs ciblés : rang
  inversé (42,84), numérateurs additionnés (4 + 8 → 42,12), un rang oublié (42,4 / 42,08).

Comme #246, **aucun décimal n'est tapé** : les décimaux vivent en énoncé ou en choix de
QCM (virgule maîtrisée), jamais comme réponse d'un item numérique — qui, révélé,
s'afficherait avec un **point** (`String(answer)` d'un item `num`). Le sens « composer →
écriture à virgule » est donc un **QCM** (leçon 4), symétrique de la leçon 3 « décomposer »
(saisie). Correction : `checkAnswer` (QCM) et `checkNumerique` (décomposition), sans
réécrire de correction ; les choix de QCM sont dédupliqués **par valeur** (jamais « 0,7 »
et « 0,70 », ni une écriture égale à la réponse). Le mot « centième » est ajouté à
`NOM_DEN` (`core/fraction-text.ts`) pour le rendu empilé et le TTS des fractions n/100.
Branché via `DECIMAUX_ECRITURES_LESSONS_DEFS` (`core/catalog.ts`).

#### `maths/fractions.ts` (#200, #249 CM1) — rubrique « Fractions »

9 leçons. Les **6 leçons de base** restent fractions **toujours < 1** (numérateur
< dénominateur), dénominateur ≤ 12, dans l'ordre pédagogique (avis pédagogue) :
**« Lire une fraction »** (`num-frac-sens`, QCM, barre divisée), **« Fraction
d'une collection »** (`num-frac-collection`, saisie numérique, jetons groupés),
**« Fraction sur une bande »** (`num-frac-bande`, QCM, bande 0→1), **« Fractions
égales »** (`num-frac-egalites`, QCM oui/non), **« Comparer des fractions »**
(`num-frac-comparaison`, QCM), **« Additionner des fractions »**
(`num-frac-addition`, QCM, même dénominateur — attendu de fin de CE2 2025). La
fraction s'affiche **empilée** (barre horizontale, numérateur au-dessus) via
`core/fraction-text.ts`, jamais « 6/8 ». **Multi-niveaux** (#287) : 3 leçons
(collection, bande, addition) sont `calibrated` { ce2, cm1 } (le CM1 élargit les
dénominateurs) ; la leçon « sens » n'est pas calibrée (figure plafonnée à 8 parts,
contenu identique aux deux niveaux).

**Surfaçage CM1** (#249) : le catalogue (`FRACTIONS_LESSONS_DEFS`, `core/catalog.ts`)
dérive `levels` du moteur — `d.exerciseType.levels ?? ['ce2', 'cm1']` — au lieu d'un
`['ce2']` fixe. Les 3 leçons calibrées exposent `['ce2', 'cm1']` via `calibrated`, et
les 3 non calibrées (sens, égalités, comparaison) reçoivent le même défaut faute de
`levels` propre : **les 6 leçons de base sont donc désormais toutes visibles au CM1**,
y compris « sens ». ⚠ Le commentaire d'en-tête de `fractions.ts` (hérité de #287) dit
encore que « sens » reste CE2-only « derrière `levels: ['ce2']` » : c'est **le code qui
fait foi** (`getLessonById('num-frac-sens').levels === ['ce2', 'cm1']`, couvert par
`tests/fractions.test.ts`), ce commentaire est à corriger côté leçon.

**3 nouvelles leçons « fractions comme nombres »** (#249, CM1-only) — programme 2025
§1.2, fractions ≥ 1 (impropres). Marquées CM1-only par le helper local
`cm1Only(exerciseType)` (`{...exerciseType, levels: ['cm1']}`), donc absentes du CE2 :

- **« Une fraction plus grande que 1 »** (`num-frac-superieure`) — QCM, figure
  **« aire itérée »** (`renderFractionSuperieure`, `core/figures/fractions.ts`) : des
  barres pleines empilées (une par unité entière) surmontées de la barre partielle du
  reste. Fraction impropre 1 < f < 3, dénominateurs {2,3,4,5,6,8} ; distracteurs =
  erreurs classiques du passage à l'impropre (partie fractionnaire seule sans les
  unités, une unité/part en trop ou en moins…).
- **« Je décompose une fraction »** (`num-frac-decomposer`) — saisie à trou sur le
  modèle de la décomposition décimale (#247) : `27/5 = @ + 2/5` (partie entière) OU
  `27/5 = 5 + @/5` (numérateur du reste), réponse toujours un **entier**
  (`checkNumerique`) ; réutilise le rendu « fraction à trou » de `core/items.ts`
  (champ `.frac-num-input` empilé au numérateur). Dénominateurs {2,3,4,5,6,8,10},
  partie entière ≤ 6 (calcul dans les tables) ; figure d'appui (même
  `fractionSuperieure`) seulement si la partie entière ≤ 2, sinon symbolique.
- **« Encadrer une fraction »** (`num-frac-encadrer`) — QCM, figure **demi-droite
  graduée 0→3** (`renderFractionDemiDroite`), choix texte « entre X et Y » (pas de vue
  riche fraction). Dénominateurs {2,3,4,5,6,8}, fraction impropre dans (1,3) ;
  distracteurs = bornes voisines et un encadrement non consécutif.

Plafond figure commun aux deux leçons à barre empilée : num < 3·den (≤ 2 unités
entières, ≤ 3 barres).

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

Catégorie `math-calcul-mental`. Quatre origines :

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
- **`maths/division.ts` (#104, #95, CM1 #251) — division par le sens** (jamais posée
  au CE2), 3 leçons CE2 (`DIVISION_LESSONS`) : **« Moitié et quart d'une collection »**
  (`math-div-moitie-quart`, fraction-opérateur, résultat entier ; `calibrated` CE2
  X ≤ 50 / CM1 X ≤ 100), **« Je partage »** (`math-div-partage`, division **exacte**
  dans les tables, deux sens partage/groupement, figure « situation de départ »
  `renderGroupes` sur les items de découverte, **exclue du sprint**) et **« Je
  découvre le reste »** (`math-div-reste`, quotient **+ reste**, deux modes : saisie
  via le runner « problème » et QCM, **exclue du sprint**).

  **Leçon CM1 séparée** (`DIVISION_EUCLIDIENNE_LESSONS`, #251) : **« Quotient et
  reste »** (`math-division-euclidienne`) — **distincte** de la sœur CE2 (celle-ci ne
  bouge pas), pas un recalibrage. Registre **abstrait-numérique** (à l'opposé du
  concret/narratif « jetons-paniers » du CE2) : trois formes d'énoncé — « Dans 58,
  combien de fois 7 ? » (cœur), égalité à trous « 58 = 7 × ? + ? », et un contexte
  court d'appoint (« boîtes de N objets », minoritaire) — **sans figure**. Diviseur
  ∈ [2,9], dividende à **2 chiffres** (10..99, jamais 3 chiffres = territoire de la
  posée), quotient **pouvant dépasser 9** (marqueur CM1, ~40 % des items le forcent
  quand c'est possible), ~1/3 de restes nuls. Même charpente que la sœur CE2 : runner
  « problème » à deux sous-questions (quotient puis reste, correction indépendante
  champ par champ) + variante QCM accessible, distracteur prioritaire = piège
  « reste ≥ diviseur ». Les deux leçons partagent la fabrique **`deuxSousQuestionsType(...)`**
  (scaffolding commun : modes, `probLexique`, `check`), seuls le libellé de saisie, les
  générateurs et `levels: ['cm1']` (fixe, posé sur l'`ExerciseType` — pas `bankByLevel`,
  pas `calibrated`) distinguent les deux. **Exclue du sprint.** Câblée au bloc « Calcul
  mental CM1 » de `core/catalog.ts` (à la suite de #250), insérée dans
  `ORDRE_LECONS.math.cm1` juste après `math-ordre-grandeur-produit`.

  > `deuxSousQuestionsType(...)` vit dans **`maths/_probleme-deux-sous-questions.ts`**
  > (module partagé, #252), et non plus dans `division.ts` : la **durée écoulée CM1**
  > (`mes-duree-ecoulee`, voir Grandeurs et mesures) en est le **3ᵉ client**.
- **`maths/divisibilite.ts` + `maths/ordre-grandeur.ts` (#250) — 2 leçons QCM CM1**
  (`CALCUL_MENTAL_CM1_LESSONS_DEFS`, `core/catalog.ts`), **premier usage réel du
  combinateur `bankByLevel`** (#225) : chaque item de banque porte `levels: ['cm1']`,
  la fabrique d'`ExerciseType` expose `bank.levels`, le catalogue en dérive
  `LessonDef.levels` (comme `calibrated`). Réponse **calculée puis STOCKÉE** dans
  l'item (jamais recalculée au `check`), banques **construites déterministiquement à
  l'import** (aucun aléa → corrigé/galerie stables).
  - **« Divisible par 2, 5 et 10 »** (`math-divisibilite-2-5-10`) : QCM oui/non mêlant
    les trois critères (~1/3 chaque diviseur, ~50/50 oui/non), cas frontière
    équilibrés (fin 0 / 5 / pair non nul / impair ≠ 5), minorité formulée côté
    diviseur (« d est-il un diviseur de N ? »), grands nombres à 5-6 chiffres
    (~19 %) groupés via `formatNombre`. Corrigé nommant les **trois** critères.
    **Exclue du sprint** (oui/non devinable à 50 %).
  - **« Ordre de grandeur d'un produit »** (`math-ordre-grandeur-produit`) : QCM
    « dans quelle classe tombe le résultat ? » (« 48 × 21, le résultat sera… »),
    3 choix libellés par **classe** de nombres + nombre de chiffres (« dans les
    centaines (3 chiffres) » / « milliers (4 chiffres) » / …), espacés ×10. Formulation
    par appartenance de classe et non par proximité (« à peu près » serait faux en haut
    de classe : 5994 ≈ 6000 mais reste « dans les milliers »). Ordre = 10^(nb de
    chiffres − 1) ; un couple est retenu ssi (1) ordre ≥ 100 et (2) l'estimation par
    arrondi au chiffre significatif donne la **même classe** — voir la règle
    d'admissibilité en tête de `ordre-grandeur.ts`.

### Grandeurs et mesures

#### `maths/mesures.ts` (#89, multi-niveaux #287, décimaux CM1 #248, tableau de conversion #394)

moteur de **conversions d'unités** partagé par
4 leçons de « Grandeurs et mesures » — `mes-longueurs`, `mes-masses`, `mes-contenances`,
`mes-durees` (h↔min + fractions d'heure). `conversionType(config)` fabrique un
`ExerciseType` dont `generate()` produit une question texte avec `@`
(emplacement du champ) et une réponse **numérique** ; `MESURE_LESSONS` liste les
descripteurs, chacun `calibrated` { ce2, cm1 } (niveaux dérivés au catalogue,
`core/catalog.ts`). Calibrage CE2 (avis pédagogique, **inchangé** par #248) :
facteur grande→petite ≤ 9, sens inverse sur multiples exacts (réponse entière),
pondération ~60/40 vers le sens ×, réponses **toujours entières** ; mL (L↔mL) et
conversion min↔s écartés (CM1 / surcharge base 60).

**Second mode « tableau de conversion » (#394).** Proposé (2 modes : `saisie`
conseillé + `tableau`, `ui/navigation.ts` → `ModeOption`) dès que la famille a une
`echelle` décimale — **longueurs, masses, contenances**, aux deux niveaux CE2 et
CM1 (l'`echelle` est portée par le niveau CE2 du `calibrated`, exposée aux deux) ;
**absente pour les durées** (base 60, un tableau décimal y donnerait des réponses
fausses) qui restent mono-mode. `generateTableau` part de la **même instance
tirée** que la saisie (`pickConversionInstance`, aucune duplication de la logique
sens/décimal) et affiche un **empan variable** : seulement la tranche contiguë de
l'échelle entre la grande et la petite unité de la paire (« 3 km = ? m » →
km·hm·dam·m, jamais km→mm). La quantité s'étale un chiffre par colonne, la colonne
de tête absorbant les chiffres de poids fort (1-2 chiffres). Les unités de l'empan
non étudiées au niveau sont des **colonnes de transit** (en-tête démoté + case
pointillés, mais saisissables — l'enfant y écrit des 0). **Invariant** : zéro de
transit et virgule ne coexistent **jamais** dans un même exercice (les colonnes de
transit n'apparaissent que sur les paires ×1000 strictement entières ; une virgule
n'apparaît que sur les paires ×10/×100 décimales CM1, dont toutes les unités
intermédiaires sont déjà enseignées). Rendu et interaction (pavé de chiffres
externe, avance automatique) dans `ui/lecon-tableau.ts` (cf.
[Rendu & interactions](ui.md)).

Le CM1 élargit les plages (1–20) et ajoute des unités déjà au programme (dm, g↔mg,
min↔s…) et, depuis #248 (programme 2025 §1.3, au plus 2 chiffres après la virgule),
ouvre des **résultats décimaux** sur les paires ×10 et ×100 concernées : chaque
`Conversion` porte un flag optionnel `decimal?: 'deux-sens' | 'vers-grande'` —
`'deux-sens'` pour les paires ×10 (cm↔mm, dm↔cm, m↔dm, L↔dL, décimal dans les deux
sens, 1 décimale), `'vers-grande'` pour les paires ×100 (m↔cm, L↔cL, décimal
seulement petite→grande — « 456 cm = 4,56 m » — le sens grande→petite restant
entier, « 3 m = 300 cm »). Les paires ×1000 et les durées restent entières (décimal
< 1 hors programme). Le helper `ecritureDecimale` construit l'écriture à virgule à
partir des parties entière/fractionnaire (aucun calcul flottant, pas de zéro final
inutile) ; la réponse décimale est stockée en écriture française (« 4,56 »),
comparée via `checkNumerique`/`parseNombreFr` (cf. [Logique pure](core.md)). Les
masses n'ont pas de paire ×10/×100 : le CM1 y ancre plutôt des **repères décimaux
mémorisés** (0,5 kg = 500 g, 0,25 kg = 250 g) via `facts`, plutôt qu'une génération
décimale générique. Les 4 leçons, jusqu'ici CE2-only au catalogue, sont désormais
surfacées au CM1 et insérées dans `ORDRE_LECONS.math.cm1` après le bloc décimaux
(#246/#247) — transfert pédagogique volontaire (écriture à virgule et valeur de
position décimale tout juste stabilisées).

**Grandes unités de temps (#252, CM1).** La config CM1 de `mes-durees` ajoute, EN PLUS
de h↔min / min↔s, les relations **EXACTES** entre unités de temps : **1 siècle = 100 ans,
1 an = 12 mois, 1 semaine = 7 jours, 1 jour = 24 h** (`maxBig: 9` ; pas de 1 an = 365
jours ni 52 semaines, non exactes). Comme le moteur affiche « valeur + unité » sans
accord, une petite **table de pluriels** (`PLURIELS_UNITE`) + `uniteAccordee(unite,
valeur)` accordent chaque unité-**mot** à SA valeur (pluriel dès 2 ; « mois » invariable),
côté connu ET côté réponse — les deux valeurs sont connues à la génération. Les unités-
**symboles** (h, min, s, cm, kg, L…) sont absentes de la table → **jamais** de pluriel
(`buildQuestion` prend désormais la valeur cible `answerValue` ; le CE2 est
**byte-identique**, `uniteAccordee` renvoyant tout symbole tel quel). TTS : les mots se
lisent tels quels (pas le souci du « h »).

#### `maths/duree-ecoulee.ts` (#252, CM1)

leçon **« Je calcule une durée »** (`mes-duree-ecoulee`, CM1-only, hors sprint),
distincte de la conversion h↔min (`mes-durees`, inchangée). Sur la charpente partagée
**`deuxSousQuestionsType(...)`** (runner « problème » à deux champs numériques corrigés
indépendamment ; mode **saisie** conseillé + variante **QCM**). **Sans figure** (rendu
« deux horloges » **différé**, texte seul). Deux formes tirées aléatoirement (programme
2025 §2.6) : **A « durée écoulée »** (« De 8 h 20 à 10 h 50, combien de temps s'est
écoulé ? » → étapes « Combien d'heures ? » / « Combien de minutes de plus ? ») et
**B « instant + durée → instant »** (« Il est 8 h 20. 2 h 30 plus tard… » → étapes
**« Les heures ? » / « Les minutes ? »**). Les libellés de B évitent volontairement
« Quelle heure ? » (qui, comme dans `heure.ts`, ferait attendre une saisie composée
« 9h30 » → `NaN` sur un champ à un seul nombre). Calibrage (pédagogue +
spécialiste-troubles) : minutes **multiples de 5**, **jamais de passage de midi/minuit**
(même demi-journée), départ < arrivée, durée ≠ 0, amplitude **≤ 4 h** ; la **retenue**
(minutes d'arrivée < minutes de départ) est **dosée** (~1/3 des cas, jamais bannie).
`parle` **100 % en toutes lettres** (`nombreEnMots`, « heures/minutes » écrits : le TTS
n'étend pas le « h »). Champ **`explication`** = stratégie du **« pont »** (« de 8 h 40
à 9 h = 20 min ; de 9 h à 9 h 10 = 10 min ; total 30 min »), rendu après la réponse dans
les **deux** modes (le runner problème affiche désormais `probleme.explication` optionnel,
comme le QCM). Distracteurs QCM = **vraies formes** (jamais une faute affichée), erreurs
classiques (oubli de retenue = ±1 h, minute mal lue), pool redondant garantissant 4 choix
uniques. Résultats **CALCULÉS puis STOCKÉS**. Insérée dans `ORDRE_LECONS.math.cm1` juste
après `mes-durees` (clôture des mesures CM1). _NB_ : les grandes unités de temps (siècle /
an / mois / semaine / jour) sont, elles, traitées par `mes-durees` (voir plus haut), pas
ici.

#### `maths/monnaie.ts` (#96)

2 leçons de monnaie de la même catégorie
(`mes-monnaie-calcul` : prix total / reste en € ou en centimes ; `mes-monnaie-rendu` :
rendu = billet − prix). Même chemin « math moderne » (item `num`). Calibrage CE2 :
réponse **toujours entière**, unité (€ ou c) collée au champ, pas de décimaux ni de
mélange €/c franchissant l'euro, billets 5/10/20/50 € (#287), centimes par pas de 10 sous 1 €.

#### `maths/heure.ts` (#88)

leçon **« Je lis l'heure »** (`mes-lecture-heure`,
catégorie « Grandeurs et mesures »), **première cliente du moteur de figures SVG**
(`core/figures/`) — chaque question affiche une **horloge** générée. Deux modes
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
ajoutés à `core/figures/` (module `polygones.ts`, cf. [Logique pure](core.md)). **Codage des figures (#326)** : les
deux leçons de reconnaissance de figures planes (`geo-cm1-triangles`, `geo-cm1-quadrilateres`)
passent `codage: true` au renderer → les figures portent leur codage géométrique (carrés d'angle
droit, tirets de côtés égaux, longueurs/largeurs distinguées par un double tiret), attendu B.O.
2025. Le codage est **opt-in** : il **rend la reconnaissance équitable** (losange vs
parallélogramme, carré vs losange ne sont plus indécidables « à l'œil ») sans curer les
distracteurs, et **n'affecte que le CM1** — le CE2 partage le moteur mais ne demande pas le
codage, ses figures restent non codées.

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

#### `maths/angles.ts` (#202, extension CM1 #252)

leçon **« Les angles »** (`geo-angles`, Géométrie), **calibrée par niveau** (#225,
combinateur `calibrated` { ce2, cm1 } ; niveaux dérivés au catalogue). **QCM mono-mode**,
cliente du moteur SVG (`renderAngle` / `renderAnglePair` / `renderAngleNomme`).

**CE2 (inchangé, byte-identique).** Six familles d'énoncés (`genAngle`) selon une
pondération (Oui/Non ≤ 45 % / 3 termes ≥ 55 %) : reconnaître l'angle droit (Oui/Non),
**comparer** à l'angle droit (plus petit / égal / plus grand), puis **nommer** (aigu /
droit / obtus, avec une **bulle d'aide** `.angle-aide`). Calibrage (programme 2025,
avis pédagogue + designer) : jugement **à l'œil, SANS degrés** (aigu ~30–60°, obtus
~115–150°, marge nette autour de 90° ; zone indécidable ~80–100° et quasi-plats >170°
bannis) ; le **carré de codage** est posé d'office sur tout angle droit ; orientations
variées (bissectrice). Champ `explication` après réponse.

**CM1 (#252) — comparer DEUX angles entre eux + notation** (`genAngleCM1`, la vraie
nouveauté du niveau, le CE2 ne comparant qu'à l'angle droit ; pondération ≈ 45/25/15/15) :
**`plusOuvert`** (« quel angle est le plus ouvert ? », QCM « Angle A » / « Angle B »,
majoritaire), **`egaux`** (« ces deux angles sont-ils égaux ? », Oui/Non), **`notation`**
(voir ci-dessous) et **`nommer`** en appoint (réutilise `genNommer`, consolidation
aigu/droit/obtus). `plusOuvert`/`egaux` affichent deux angles côte à côte via
**`renderAnglePair(a, b, labels)`** (`FigureSpec` `anglePair`), chaque cadran étiqueté
**A / B** hors du SVG (lettre + `aria-label`, jamais info par la seule position ni la
seule couleur). Écart d'ouverture **NET** (≥ 25°) garanti quand la réponse en dépend
(loyal à l'œil, sans rapporteur). **Piège pédagogique** : la **longueur des demi-droites**
(`AngleSpec.ray`) varie par angle → le plus ouvert a parfois les traits les plus courts
(« la taille du trait n'est pas l'ouverture »). Vocabulaire unifié sur « ouverture ».

**Notation « angle AÔB »** (`notation`, B.O. 2025 §2.5) : figure d'UN angle aux **trois
points nommés** (**`renderAngleNomme(spec, points)`**, `FigureSpec` `angleNomme`) — un
point marqué à chaque extrémité + le sommet ; les lettres de points sont des `<text>` SVG
(**seul** cas où `<text>` est admis sur une figure d'angle : ce sont des NOMS, pas des
cotes/degrés — l'invariant « aucune mesure affichée » tient). Question « quel point est
le sommet de l'angle XŶZ ? », le sommet **au milieu** coiffé du circonflexe ; l'enfant
**désigne** la lettre (QCM, pas de saisie du Ô). Sommet tiré dans {A,E,I,O,U} (formes
précomposées **Â/Ê/Î/Ô/Û**), points extérieurs dans un pool **disjoint** de consonnes →
la notation varie (le sommet n'est pas toujours O). Toutes les réponses **STOCKÉES**.
Insérée dans `ORDRE_LECONS.math.cm1` en clôture du cluster géométrie. Mesure au
rapporteur (degrés) toujours **différée**.

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
