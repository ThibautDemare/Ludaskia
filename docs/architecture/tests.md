[← Architecture Ludaskia](../ARCHITECTURE.md)

# Tests

## Tests unitaires (Vitest)

Le dossier `tests/` regroupe une **trentaine de fichiers** `*.test.ts` (Vitest), un par
domaine (`ordre-pedagogique`, `niveau`, `mesures`, `level-combinators`, `encadrant-stats`…),
`logic.test.ts` couvrant le cœur historique. Ils importent directement les modules de
`src/core/` (et quelques-uns de `src/ui/`) et couvrent la **logique pure** (génération,
persistance, récompenses, profils), pas le rendu DOM. L'environnement DOM/`localStorage`
est fourni par `happy-dom`.

L'état des modules ES étant un singleton, un `beforeEach` reproduit la fraîcheur
de l'ancien runner : `localStorage.clear()`, rebranchement du hook
(`setOnDataWrite`), remise à zéro de l'état du module `items`, puis
`initProfiles()`. **Lancer `npm test` après toute modif de logique.**

### Harnais d'invariants du catalogue (#410)

`tests/catalogue-invariants.test.ts` balaie **tout** `getAllLessons()` et éprouve,
pour chaque leçon et chaque niveau déclaré, un socle d'invariants communs à tout
`ExerciseType` : `generate()` ne lève pas, `genLessonItem()` (le point d'entrée
catalogue, y compris le math hérité `bilanQ`) produit une réponse non vide, le
round-trip `checkItemAnswer(item, réponse canonique)` — et chaque forme
équivalente déclarée — est accepté, un QCM contient bien la réponse dans ≥ 2 choix
sans doublon, et le générateur n'est pas figé sur un unique item. Le pilotage se
fait sous des graines variées via **`fast-check`** (devDependency, property-based)
et `withSeed` (#41) : un échec nomme la leçon (`$id`) et affiche, grâce au
shrinking de fast-check, la graine minimale qui reproduit le problème.

Ce socle est **générique** : ajouter une leçon n'impose pas de réécrire ces
vérifications à la main, mais reste soumis aux tests **spécifiques** à sa propre
logique (cf. les fichiers dédiés existants — `fractions.test.ts`,
`mesures.test.ts`…) et à sa spec e2e si elle est visuelle.

**Linter métier — typographie des réponses attendues (#578).** Le même harnais
refuse toute réponse générée (`answer`, `answers`) qui porte une apostrophe
typographique (`’`), une espace insécable hors séparateur de milliers, un double
espace, ou une espace en tête/fin — sur les **deux** chemins éprouvés, donc pour
tous les niveaux et tous les modes. Seule la règle de l'apostrophe garde la
**correction** : `normalizeText` ne replie pas `’` vers `'`, donc une réponse
attendue qui en contient est incorrigible dès qu'un enfant la saisit au clavier.
Les trois autres verrouillent la **forme affichée** (réponse révélée, corrigé
imprimé, journal d'erreurs de l'espace encadrant). Exemption documentée : l'espace
fine U+202F **entre deux chiffres** reste légale — c'est le séparateur de milliers
de `formatNombre`, et le mode « tuiles » de la numération stocke volontairement sa
réponse groupée pour qu'elle corresponde au libellé de la tuile. Le texte
**affiché** (énoncés, explications) n'est pas concerné : il est lu, pas tapé.

**Hors périmètre, volontairement** : le plancher « 50-100 items distincts par
banque » n'est **pas** un invariant universel — environ la moitié du catalogue
produit, par conception, moins de 50 items distincts (conjugaison = un verbe × un
temps = 6 formes, ~4 types de triangles…). Il reste une cible pour les **banques
de contenu** (vocabulaire, homophones), pas un gate sur l'ensemble du catalogue.

### Gate statique du journal d'erreurs (#580)

`tests/erreurs-journal-gate.test.ts` fait respecter la règle « pas de correction sans
sa capture » (#391) au lieu de la laisser à la mémoire de qui écrit le code. Il lit les
fichiers de `src/ui` comme du **texte** (pas de DOM, pas de rendu — quelques
millisecondes) et exige que chaque module correctif importe `capterErreur` : tous les
`src/ui/lecon-*.ts`, plus `session.ts`, `sprint.ts`, `revision.ts`, `ortho-runner.ts`
et `revelation-neutre.ts`. Les exceptions sont **écrites dans le test avec leur
raison** (`lecon-du-jour.ts` et `lecon-runner-shared.ts` ne corrigent rien ;
`lecon-passer.ts` journalise par délégation à `revelation-neutre.ts`, ce qu'un test
dédié vérifie), et le test rejette une exception devenue caduque — un module exempté
qui se met à capturer doit sortir de la liste.

Un dernier test croise la convention de nommage avec l'**aiguillage réel** : chaque
`runLeconXxx` appelé dans `navigation.ts` doit venir d'un module du périmètre. Un
runner branché sous un nom hors convention échoue au lieu de passer inaperçu.

**Ce que ce gate ne prouve pas** : que l'appel est au bon endroit, avec un énoncé
lisible et un `lessonId` (sans l'un des deux, `capterErreur` ignore l'entrée en
silence). C'est l'objet de la table de couverture ci-dessous.

### Couverture du journal par format d'exercice (#581)

Le gate précédent travaille au niveau **module** ; celui-ci travaille au niveau
**format d'exercice**. `e2e/journal-couverture.ts` déclare, pour chaque `type` de
l'union `Exercise` (`src/core/exercise.ts`), une leçon d'exemple, le mode joué et le
**geste** qui produit une erreur — source unique de deux vérifications :

- `tests/journal-couverture.test.ts` (Vitest) est le **gate**. Un format sans entrée
  fait échouer le build **deux fois** : à la compilation (la table est typée
  `Record<Exercise['type'], …>`, et l'import depuis `tests/` la fait entrer dans le
  programme TypeScript alors que `e2e/` n'est pas dans `tsconfig.include`) et à
  l'exécution, par relecture du source. Le test confronte en plus chaque entrée au
  catalogue réel : la leçon existe, le mode est déclaré, et elle produit bien **ce**
  format sous 24 graines — sans quoi une leçon renommée laisserait une entrée qui
  rassure sans rien couvrir. Une exception doit s'écrire (`{ couvert: false, raison }`)
  et sa raison être substantielle ; il n'y en a aucune aujourd'hui.
- `e2e/journal-couverture.spec.ts` est la **preuve par l'usage** : une seule spec
  paramétrée (la suite tourne en `workers: 1`, un fichier par format coûterait cher)
  qui joue chaque entrée dans le navigateur et vérifie le round-trip complet. Elle
  verrouille ce qu'aucune analyse statique ne voit : la capture a lieu **au bon
  moment**, avec un énoncé lisible (sinon l'entrée est ignorée en silence, donc zéro
  carte côté encadrant) et des réponses **non vides des deux côtés** — une entrée
  « Réponse attendue : » suivie de rien ne dit rien au parent.

C'est ce fichier qui porte les round-trips de correction ; `erreurs-encadrant.spec.ts`
ne garde que l'**affichage** (regroupement, période, tri, dépliage) plus les deux
scénarios hors couverture-par-format (seuil détaché, révision espacée).

### Voix des libellés : tu à l'enfant, vous à l'adulte (#586)

`tests/voix-libelles-gate.test.ts` tient la part **mécanisable** de la convention #278
(cf. [Conventions rédactionnelles](conventions-redaction.md)) : pas de tutoiement dans
`**/encadrant*.ts`, pas de vouvoiement ailleurs. Le basculement tu → vous est, avec le
retrait du vert de marque, le signal de rupture « on a quitté l'espace de l'enfant » ; un
« votre » égaré l'abîme sans rien casser.

C'est le seul gate **heuristique** du lot, et sa forme découle de cet aveu :

- **Pronoms et possessifs seulement, jamais la conjugaison.** L'impératif d'un écran
  enfant (« Choisis », « Clique ») est lexicalement indistinguable d'autre chose. Le
  défaut qui a motivé #278 — un titre posé par l'interface mais rédigé à la première
  personne — relève du jugement et n'est **pas** attrapé ; l'étendre pour l'attraper
  reviendrait à écrire un correcteur grammatical.
- **`src/data/` hors périmètre, mesure à l'appui** : 47 occurrences de « vous/votre/vos »
  y vivent, toutes légitimes (leçons de conjugaison, pronoms sujets, phrases de
  grammaire). Ce sont des contenus d'exercice, pas la voix de l'interface — les inclure
  demanderait 47 exceptions, et un gate à 47 exceptions ne garde plus rien.
- **Les commentaires sont retirés** avant analyse : le dépôt discute abondamment la
  convention dans ses commentaires, et les lire comme des libellés punirait exactement le
  bon réflexe.
- **Un littéral qui vaut exactement un pronom est écarté par une RÈGLE**, pas par une
  exception : sans sujet ni verbe, il n'y a personne à qui parler. C'est ce qui dispense
  d'exempter la liste des six personnes de la conjugaison.
- **Les exceptions sont ancrées sur un littéral ET sur un compte.** Excuser un fichier
  laisserait passer la faute suivante au même endroit ; excuser un littéral sans compter
  laisserait absorber une occurrence de plus glissée dans le même bloc. Vérifié par
  mutation : ajouter « Tes » dans le bloc déjà excusé fait échouer le compte.

Deux exceptions aujourd'hui, quatre occurrences : l'espace encadrant **cite** un libellé
enfant entre guillemets (« ce que tu connais déjà »), et « Un mot pour les parents »
(`ui/tour.ts`, #330) est une **seconde surface adulte** hors espace encadrant — nuance que
la mesure a fait apparaître, et que la convention mentionne désormais.

### Libellés cités par le guide parents et la vitrine (#599)

`tests/libelles-cites-gate.test.ts` s'attaque à la surface la plus périssable du dépôt.
`guide.html` décrit des parcours en citant des libellés entre guillemets français
(« allez dans Français, puis Orthographe, puis "Les dictées de mots" »). Un bouton renommé
rend ces phrases **fausses** sans rien casser, et l'écart ne se voit qu'au moment où un
parent cherche un bouton qui n'existe plus.

Les deux pistes suggérées par l'issue ont été **écartées après mesure** :

- « restreindre aux citations dans `<strong>` » : sur les 56 `<strong>` du guide, **un
  seul** contient une citation — le `<strong>` sert à l'emphase, pas à marquer un libellé.
  Le filtre aurait couvert 1 citation sur 22.
- « vérifier que la chaîne existe dans `src/` » : trop faible pour les mots courts.
  « vous », « dys », « arbre », « vent » se trouvent tous dans `src/` sans rapport avec un
  libellé — un gate qui les valide rassure sans rien garder.

Trois choix à la place :

- **Les commentaires HTML sont retirés** avant extraction. Les en-têtes du guide et de la
  vitrine documentent leurs arbitrages en citant abondamment : **19 des 41** citations du
  dépôt vivent là. Un commentaire n'est pas une promesse faite au lecteur.
- **Chaque citation restante doit être classée**, en libellé d'interface (vérifié contre
  `src/`) ou en citation de langue (avec sa raison). C'est le cœur du gate : le classement
  ne peut pas s'automatiser — « à revoir » est un état affiché, « il a du mal en
  conjugaison » est une phrase de parent — mais l'**oubli** de classer, si. Une citation
  ajoutée demain ne peut plus passer inaperçue.
- **La présence d'un libellé se prouve par sa POSITION** : il doit terminer le texte d'un
  élément ou la valeur d'un attribut (`>Mes listes<`, `aria-label="Écouter"`). La règle
  passe sur les 15 libellés actuels et réduit fortement le bruit — « Fiche » tombe de 10
  fichiers à 1, et ce fichier est bien celui que le guide décrit.

Éprouvé par mutation, l'**élargissement** d'un libellé est bien attrapé (« Mes listes » →
« Mes listes de mots », « Fiche » → « Fiche à imprimer »). Ce qui passe encore : le
**déplacement** (le libellé existe, mais plus là où le guide l'annonce — le parcours n'est
pas vérifié) et le renommage d'**un** porteur quand il y en a plusieurs.

### Couverture e2e par surface de rendu (#598)

`tests/couverture-e2e-gate.test.ts` fait respecter « pas de fonctionnalité visuelle sans sa
spec » (CLAUDE.md), qui ne tenait jusque-là qu'au réflexe de qui écrivait le code.

**Le choix de la maille décide de tout.** Sur ~170 ids de leçon, 47 seulement apparaissent
en dur dans un `gotoHash` de spec : un gate « une spec par leçon » demanderait une centaine
d'exceptions et mourrait sur son propre critère. C'est aussi la mauvaise unité — une 172ᵉ
leçon de vocabulaire sur un moteur déjà couvert ne risque rien ; un runner neuf, si. Trois
surfaces, énumérables et petites :

- **Les modes** (`type.modes`, #69) — **9 ids** dans tout le catalogue, tous couverts, zéro
  exception. C'est le trou que le CLAUDE.md nommait explicitement : la table de #581 ne
  déclarant qu'**un** mode par format, rien ne garantissait que le second mode d'un type
  soit joué un jour. Un mode compte comme couvert s'il est cliqué
  (`.mode-btn[data-mode="…"]`) dans une spec, ou déclaré dans la table de #581.
- **Les runners** (`src/ui/lecon-*.ts`, 13 fichiers) — dix sont aiguillés par
  `navigation.ts` selon le type d'exercice, donc couverts via leur type. Les trois autres
  (`lecon-du-jour`, `lecon-passer`, `lecon-runner-shared`) portent chacun une **signature
  CSS** que le test exige de retrouver **à la fois dans le module** (sinon la preuve ne
  prouve rien) **et dans au moins une spec** (sinon le runner n'est pas exercé).
- **Les types** — **délégués** à la table de #581, qui fait mieux qu'un scan de texte :
  typée `Record<Exercise['type'], …>`, elle casse la compilation sur un type neuf, et sa
  spec paramétrée *joue* chaque entrée. Ce gate ne la recopie pas, il **vérifie que la
  délégation est réelle** : chaque type aiguillé par `navigation.ts` doit y avoir son
  entrée. En reconstruire une version par scan aurait donné une garde plus faible avec
  l'apparence du contraire.

Le critère « exclure les specs qui amorcent tout le programme via `leconsDuNiveau()` » est
satisfait **par construction** : aucun signal de couverture ne vient d'une énumération d'ids
de leçon, seulement de gestes ciblés. Un test le vérifie tout de même, en refusant qu'un
mode n'ait pour seuls témoins ces quatre specs.

Détail appris en éprouvant le gate par mutation : la présence d'une signature se teste **au
token près** (`lqcm-progress-lab(?![\w-])`). En simple sous-chaîne, renommer
`.lqcm-progress` restait « prouvé » par `.lqcm-progress-lab`.

**Ce qu'il ne prouve pas** : que la spec soit bonne. Un `data-mode` cliqué sans rien vérifier
derrière satisfait le gate ; il garde l'**existence** d'un chemin e2e par surface, la
profondeur du round-trip restant l'affaire de `e2e/journal-couverture.spec.ts`.

### Nom accessible des champs de réponse (#577)

`tests/champs-libelles.test.ts` balaie le catalogue et exige qu'aucun `<input class="ans…">`
d'une fiche ne parte **sans `aria-label`** — un champ anonyme est annoncé « zone de saisie »
par un lecteur d'écran, et axe le classe `critical`. Ce balayage vaut mieux qu'un scan axe
seul : celui-ci ne visite que **9 vues** échantillons, et c'est le gate qui a trouvé la
leçon `math-decomposer-multiplication`, qui construit ses champs à la main hors de
`renderItem` et n'était couverte par aucune vue scannée.

Il verrouille aussi ce qu'axe **ne sait pas voir** : huit champs tous nommés « signe de
comparaison » satisfont la règle `label` sans rien résoudre. Les tests exigent donc que les
champs d'une même fiche se **distinguent** (conjugaison : un pronom par champ ; comparaison :
les deux nombres comparés). Cf. `nomChampReponse` dans [Cœur logique](core.md).

### Préfixe `ludaskia_` des clés de stockage (#597)

`tests/cles-stockage-gate.test.ts` lit `src/` comme du texte. Le préfixe n'est pas une
préférence de nommage : `appKeys()` filtre sur lui, donc c'est **lui qui décide** qu'une
donnée entre dans l'export de sauvegarde du parent et disparaît avec le profil supprimé.
Une clé hors convention fonctionne pourtant parfaitement — `lsGet`/`lsSet` la préfixent par
le profil comme les autres — si bien que l'oubli ne se voit qu'au moment où un parent
restaure une sauvegarde amputée, des mois plus tard.

Deux filets qui se rattrapent l'un l'autre :

- **Les déclarations** — toute constante nommée comme une clé (`*_KEY`, `CLE_*`, listes
  `CLES_*`) doit valoir un littéral préfixé. Attrape la clé écrite hors convention avant
  même qu'elle soit branchée. S'en tenir au suffixe `_KEY` aurait laissé passer
  `CLE_GLOBALE` et `CLES_PROFIL`, qui sont exactement des clés de stockage.
- **Les sites d'appel** — le premier argument de chaque appel aux huit helpers de
  `storage.ts` doit se ramener à une clé conforme : littéral préfixé, ou constante
  conforme mentionnée dans l'expression (`uuid + '/' + STARS_KEY`). Attrape la clé écrite
  en dur au vol, que le premier filet ne voit pas.

Deux détails de méthode qui font la différence entre un gate et une illusion de gate :

- **Les indirections sont listées avec une PREUVE.** Là où la clé passe par une variable
  locale ou une fonction constructrice (`runsKey`, la boucle de `engagement.ts`, les clés
  issues d'`appKeys()`), l'exception porte une expression régulière que le fichier doit
  encore satisfaire. Réécrire `runsKey` sans le préfixe fait tomber la preuve : le silence
  ne gagne pas par défaut.
- **Le gate vérifie sa propre raison d'être.** Un test relit `appKeys()` et exige qu'il
  filtre toujours sur `ludaskia_`. Si ce filtre change, ce n'est plus la même convention
  qu'on garde, et mieux vaut relire le gate que le laisser vérifier une règle morte.

Le seuil anti-liste-vide est double (≥ 30 clés, ≥ 60 sites d'appel) : un scan cassé rendrait
sinon le gate vert en n'examinant plus rien.

### Contraste AA des tokens de couleur (#576, #582)

`tests/contraste-tokens.test.ts` lit les tokens dans `base.scss`/`themes.scss` et éprouve
leur contraste WCAG **thème par thème** — les six (cinq clairs + Nuit ; « Clair-obscur »
n'est pas résolu en JS et applique la palette Nuit, déjà couverte), en quelques
millisecondes. Complète le scan axe, qui ne visite que 9 vues, ne voit qu'**un** thème (celui
rendu) et reste **non bloquant**.

**La rampe de gris (#576)** — `--ink`, `--grey`, `--muted` sur `--paper`, `--page-bg`,
`--accent-soft` — avec deux gardes de plus, qui font la différence entre un gate utile et un
gate contournable :

- **`--muted` doit rester visiblement plus clair que `--grey`.** Sans elle, la façon la plus
  simple de faire passer le test serait d'aligner les deux tokens — ce qui supprimerait un
  niveau de hiérarchie visuelle au lieu de corriger le contraste.
- **L'opacité d'un trophée verrouillé est recalculée, pas figée.** Le test compose la couleur
  comme le fait le navigateur et vérifie le résultat ; un nombre magique (« ≥ 0,85 ») ne
  dirait pas pourquoi et se périmerait au premier changement de palette.

**La table de paires (#582)** étend le principe à tous les autres couples : ~18 paires de
**texte** (4,5:1, SC 1.4.3) et 4 paires **non textuelles** (3:1, SC 1.4.11), soit ~130 cas.
Trois choix de conception structurent la table :

- **On ne teste que les couples qu'on peut montrer du doigt.** Chaque entrée porte l'endroit
  où le couple existe vraiment dans les feuilles. Un couple plausible mais inexistant produit
  soit une garde vide, soit une dérogation à justifier — du bruit qui décrédibilise le gate.
  Deux couples ont ainsi été **écartés après mesure** : `--on-accent` sur `--admin-fill` (les
  boutons de l'espace encadrant écrivent `#fff` en dur) et `--accent` sur `--page-bg`.
- **Le décoratif est explicitement hors périmètre**, avec la raison écrite : `--line` et
  `--track` sur `--paper` (~1,2:1), `--warn-bd` sur `--warn-bg`. SC 1.4.11 ne vise que les
  composants d'interface et les objets graphiques porteurs d'information ; soumettre les
  filets aux 3:1 obligerait à tout déroger, donc à ne plus rien garder.
- **Un même couple peut relever des deux régimes.** `--accent` sur `--paper` est du texte
  (4,5:1) quand c'est un libellé et un composant (3:1) quand c'est une bordure de bouton : la
  nature fait partie de l'identité d'un cas, sinon une dérogation posée sur l'un déborde en
  silence sur l'autre.

**Les dérogations s'auto-périment.** Un défaut connu mais non corrigé (#385, #438, #600,
#601) est déclaré avec son issue et son motif, et le test correspondant est **inversé** : il
exige que le couple soit *encore* en échec. Le jour où quelqu'un corrige la couleur, `npm
test` échoue tant que l'entrée n'est pas retirée. C'est volontaire : une allow-list qui
survit à ce qu'elle justifiait finit par masquer une vraie régression.

**La formule vit dans `tools/contrast/wcag.js`**, partagé avec l'outil interactif
`tools/contrast/contrast.mjs` (qui n'en est plus que l'habillage CLI). Celui qu'on lance pour
**choisir** une couleur et celui qui fait **échouer** `npm test` mesurent la même chose par
construction. Le module a ses propres ancres testées (21:1, 1:1, les deux gris qui encadrent
le seuil AA à un cran près) : si la formule dérive, ce sont elles qui tombent d'abord. C'est
le seul JS du programme TypeScript (`allowJs`), parce que le CLI s'exécute sans build.

## Smoke tests e2e (Playwright)

**Smoke tests e2e (`e2e/`, Playwright, #129).** Complémentaires : ils pilotent
l'app dans un navigateur (profil mobile Chromium) pour couvrir ce que la logique
pure ne voit pas — navigation par hash, rendu d'un exercice, écran d'une
catégorie vide, démarrage du sprint, **absence d'erreur de rendu**
(`watchErrors`). Restent **ciblés et stables** : on teste le contenu présent sur
`main`, pas une leçon en cours de PR. `vitest` est restreint à `tests/` pour ne
pas ramasser les specs Playwright. Détails : `e2e/README.md`.

**Deux serveurs webServer** (`playwright.config.ts`, #306) : le serveur de dev
habituel (`npm run dev`, port 4173), et un second qui sert le **build de
production** via `npm run build && npm run preview` (port 4174, export
`PROD_URL`). Le service worker est volontairement **désactivé** sous le serveur
de dev — enregistré, il servirait d'un test à l'autre les assets mis en cache
par le précédent, avec des échecs différés et incompréhensibles. Seule
`e2e/offline.spec.ts` cible le second serveur, où elle exerce le **vrai**
précache du build plutôt qu'une approximation.

À part, `a11y-axe.spec.ts` fait tourner un **scan axe-core** (WCAG A/AA) sur un
échantillon de vues plutôt que des assertions de rendu ciblées — signal
automatisé, **non bloquant** par défaut, complémentaire du jugement de l'agent
`relecteur-accessibilite`. Détails : `e2e/README.md`.

Autre famille, `galerie.spec.ts` (#412) compare le rendu du catalogue à des
**baselines de screenshots** (`toHaveScreenshot`) via la route **DEV-only**
`#galerie` (`src/ui/galerie.ts`, gardée par `import.meta.env.DEV` — absente du
bundle de production) qui affiche, groupée par catégorie, la fiche de chaque
leçon sous `withSeed`, **puis un exemplaire de chaque écran de runner
interactif** (#419 : tuiles, ordre, tri, appariement, problème, tableau de
conversion). Ces boards sont rendus par le **même code que le runner live** —
les widgets partagés (`ui/tuile-interaction.ts`, `ui/appariement.ts`) et deux
fonctions de rendu **pures** extraites des runners pour être réutilisées
(`renderProblemeBoardHTML` de `ui/lecon-probleme.ts`, `renderTableauBoardHTML`
de `ui/lecon-tableau.ts`) — de sorte qu'un snapshot détecte les régressions du
**vrai** rendu ; la galerie n'appelle **jamais** les entrées `runLeconXxx` (qui
portent les effets de bord : toolbar, aide, storage, listener `document` du
tableau). Chaque section porte un `data-gallery` → une **capture dédiée** (une
nouvelle section est donc snapshotée automatiquement). Les baselines sont
**ancrées sur l'environnement de la CI** (ubuntu + Chromium) — comparaison
ignorée hors Linux — et se régénèrent via le workflow
`.github/workflows/update-snapshots.yml`. Détails et procédure : `e2e/README.md`.
