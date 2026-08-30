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

### Gate du texte parlé du sprint (#630)

`tests/sprint-tts-gate.test.ts` garde l'invariant du bouton « Écouter » ajouté au
sprint : **toute** question tirable par le mode doit donner quelque chose à lire à
voix haute. Deux leçons du catalogue sont délibérément **muettes**
(`parle: ''` — homophones, participes en `-é`/`-és`/`-ée`/`-ées`, où l'entendre
donnerait la réponse) ; rien ne liait mécaniquement « énoncé muet » à « exclue du
sprint » avant ce gate, `estEligibleSprintHorsNiveau` ne regardant pas `parle`. Il interroge
donc le **prédicat réel** du tirage (`estEligibleSprintHorsNiveau`, `core/catalog.ts`) et le
**générateur réel** de la question (`genSprintQuestion`, `core/sprint-item.ts`) —
pas une liste recopiée à la main, qui aurait divergé au premier format ajouté — et
échantillonne **40 tirages par (leçon, niveau)** éligible : la mutité peut ne
toucher qu'une partie des tirages d'une banque (seuls quelques items portant
`parle: ''`), un tirage unique la manquerait une fois sur deux. Deux témoins
prouvent que le gate a des dents (il resterait vert par construction sans eux) :
un énoncé à `parle` vide rend bien un texte parlé vide, et les deux leçons muettes
assumées restent bien hors du pool. **Ce qu'il ne prouve pas** : que le bouton est
réellement greffé à l'écran, ni qu'il parle — c'est l'objet d'`e2e/sprint-ecouter.spec.ts`.

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

**Une mention ajoutée à une ligne existante n'a, elle, aucun gate (#536, rejet écrit.)**
Ce gate accroche sur des surfaces **structurelles** : un id de mode, un type d'`Exercise`,
un runner. Le champ `capFranchi` de « Travaillé récemment » (cf. [Espace
encadrant](espace-encadrant.md)) n'en crée aucune — même composant, même route, un champ
optionnel de plus sur une structure déjà rendue. Rien de mécanisable n'attrape « une
mention ajoutée à une ligne existante doit avoir sa spec e2e » ; un gate textuel cherchant
la classe `.enc-trav-cap` se contournerait par un simple renommage. Contrepartie posée en
**checklist** plutôt qu'en test : une ligne dans le prompt de `relecteur-qualite`
(`.claude/agents/relecteur-qualite.md`).

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

### Échappement HTML par construction (#614)

Cinq fichiers, cinq niveaux.

`tests/html-positions-gate.test.ts` attrape deux fautes de rendu qui compilent
proprement, passent ESLint et passent les tests unitaires : une interpolation à une
position que le gabarit **refuse** (elle lève, donc l'écran ne se rend plus) et du
**balisage écrit en chaîne** (il sera échappé et lu en clair par l'enfant). Il garde
aussi la frontière du moteur de figures — chaque point d'entrée doit être marqué
`brut()` à l'appel (cf. [Rendu & échappement](rendu-et-echappement.md)).

Deux choix de méthode y sont structurants. Il interroge le **typechecker**, pas les noms :
une première version reconnaissait les fabriques par leur nom (`html`, `attribut`,
`brut`…) et criait sur **45 sites sains**, faute de savoir que `ttsAttr(…)` ou
`marqueCase(…)` rendent déjà un fragment — un gate qui se trompe trois fois sur quatre
finit contourné. Et il rejoue `analyserPositions`, **la fonction du moteur**, plutôt
qu'une copie de l'automate qui divergerait au premier changement. Coût ~3 s, en
environnement `node`. Anti-liste-vide : ≥ 300 gabarits et ≥ 1000 interpolations examinés.

**Il tenait autrefois une troisième faute — le fragment sorti de son gabarit —, et
elle a fui en production** (release `v2026.08.28`) : cinq sites affichaient
« [object Object] » (résultat du sprint, résultat de toute leçon, pastilles du
« programme du jour »). Le détecteur ne testait que la forme `a + frag` (`PlusToken`)
; le motif réel de ces cinq sites était l'accumulateur `extra += html\`…\``
(`PlusEqualsToken`) — un seul jeton d'écart, et rien ne vérifiait que ce détecteur
détectait encore quelque chose : sur un arbre sain, un détecteur troué rend le même
vert qu'un détecteur correct. La classe a donc migré, en plus large, vers le fichier
suivant ; son numéro reste **vacant** dans [Rendu & échappement](rendu-et-echappement.md),
qui cite les classes par numéro — renuméroter ferait mentir ces renvois. Trois autres
sites (runner QCM de leçon, deux écrans de révision) affichaient le mot `html` nu,
une forme que `html-positions-gate` n'avait jamais eu vocation à voir : c'est une
détection entièrement nouvelle, pas un trou dans une détection existante.

`tests/fuites-gabarit-html-gate.test.ts` reprend la classe migrée en mieux : **exhaustif
sur `src/`** par construction (là où l'e2e n'échantillonne que quelques écrans),
**typé** (il attrape `x += fabriqueUnFragment()`, qu'aucune regex ne voit), et
couvrant `+`, `+=`, gabarit non balisé, `.join()`, `String()`, `.toString()` — plus la
seconde forme, nouvelle : un jeton technique (`html`, `balisage`…) resté collé dans le
balisage **statique** du gabarit, comme le mot « html » nu avant le backtick fermant
en production. ~3-4 s au `npm test`.

Sa particularité, et c'est la leçon de l'incident : il est **vérifié contre un
échantillon fautif** tenu dans un fichier virtuel (jamais écrit sur le disque,
jamais compilé ni linté par le projet), qui rejoue les deux formes — témoins
légitimes compris (un lien `guide.html` coupé par une interpolation, un fragment
joint par `joindre()`) — et exige que le détecteur les signale **toutes**, sans
faux positif. Cette auto-vérification a servi dès l'écriture : elle a démasqué une
première version qui ratait un jeton collé juste après un nœud texte. Sans elle, un
trou dans ce détecteur serait, à nouveau, indiscernable d'un arbre sain.

`tests/html-injection-balayage.test.ts` prend le problème par l'autre bout : au lieu
d'une liste de caractères choisie à la main (donc ceux auxquels l'auteur a pensé), il
balaie les codes **1 à 255** plus les espaces Unicode, sur les trois positions, et laisse
l'**analyseur DOM** juger — « la balise porte-t-elle encore exactement un attribut, avec
la valeur d'origine ». Cette forme a trouvé son premier défaut à l'écriture : l'attribut
non quoté échappait par une **table** de sept caractères avec un repli `?? c`, alors que
la regex qui la pilotait capturait bien plus large ; le repli ne rattrapait rien, en
silence. Ses trois **contrôles négatifs** ne sont pas décoratifs : ils vérifient que
l'oracle sait voir une injection quand on la laisse délibérément passer, sans quoi le
balayage passerait tout aussi bien si l'analyseur ne voyait rien du tout.

`tests/html-gabarit.test.ts` éprouve le **contrat du gabarit** `html`
([Rendu & échappement](rendu-et-echappement.md)), position par position : texte,
valeur d'attribut quotée, valeur d'attribut NUE (où l'espace suffit à ouvrir un
attribut voisin, ce que `escapeHTML` seul laisserait passer), URL (schéma
`javascript:` / `data:` **refusé**, pas échappé — le danger n'y est pas dans les
caractères). Plus la composition : un `SafeHtml` traverse sans **double
échappement**, un tableau se joint, `false` / `null` / `undefined` rendent du vide.

`tests/echappement-chemins-sensibles.test.ts` prend la chaîne complète, de la donnée
au fragment rendu, sur les quatre chemins que l'issue nommait : nom de profil, valeur
de tuile saisie par l'enfant, libellés de leçon, `aria-label`. Il lit le **DOM
produit**, pas la chaîne : « l'élément `<img>` n'existe pas » dit ce qui compte, là où
un test sur la chaîne se satisferait d'un `&lt;` obtenu par hasard. Ces chemins étaient
déjà échappés avant #614 — c'est le point : la conversion ne devait rien dé-échapper.

Côté e2e, `e2e/echappement-rendu.spec.ts` (11 tests) ferme le risque symétrique,
invisible aux gates statiques : un fragment **doublement** échappé ne casse ni la
compilation ni un sélecteur, il s'affiche simplement en clair à l'enfant. La spec lit
le TEXTE VISIBLE de neuf familles de rendu et refuse toute ouverture de balise, plus
« [object Object] » et le mot `html` nu — marques des deux oublis symétriques. Le
**chevron seul** n'est pas testé, délibérément : les leçons de comparaison affichent
« 3 < 5 ». Elle n'en couvrait que quatre (fiche, runner à widget, espace encadrant,
sprint) quand les huit sites ci-dessus ont fui en production : aucun n'était sur les
six écrans qu'elle traversait alors, malgré un en-tête qui nommait déjà les deux
symptômes cherchés. Cinq tests de plus depuis, un par écran qui avait réellement fui
(runner QCM de leçon — question et résultat —, résultat du sprint, « programme du
jour », révision QCM et problème) : c'est la limite propre à un gate par
échantillon, qui ne prouve que les écrans qu'il visite.

La règle ESLint, elle, vit dans `eslint.config.js` et exige que toute affectation à
`.innerHTML` soit de la forme `X.balisage`.

### Commentaires SCSS qui avalent du code (36bf465)

`tests/scss-commentaires-gate.test.ts` répond à un défaut qui a traversé toute la chaîne
existante sans un mot : un commentaire SCSS fermé par « * / » (avec une espace) au lieu du
terminateur laisse Sass chercher plus loin, trouver celui d'un commentaire **suivant**, et avaler
entre les deux une règle CSS complète — qui cesse simplement d'exister dans la sortie. Le cas réel
(`.enc-compo-frise` dans `encadrant.scss`) passait `prettier --check` (qui avait même
**reformaté** la prose avalée, la rendant illisible sans jamais rien signaler), le build, et
`npm test`/`lint`/`typecheck`. Rien dans l'outillage ne remarquait une règle CSS qui disparaît.

**Le déséquilibre d'ouvertures/fermetures n'est PAS le signal** : le défaut d'origine était
parfaitement équilibré (deux `/*`, deux `*/`) — c'est le VOL de terminateur qui compte, pas un
comptage global.

Trois filets, sans aucune exemption à maintenir :

1. **Mécanisme.** Un commentaire fautif contient forcément le `/*` de celui dont il a volé le
   terminateur (0 faux positif sur les 911 commentaires bloc du dépôt, mesure du 26/08/2026).
2. **Contenu.** Une ligne de code reconnaissable, seule sur sa ligne, à l'intérieur d'un
   commentaire (ouverture de règle, fermeture de bloc, déclaration `propriété: valeur;`,
   directive `@include …;`).
3. **Oracle Sass.** Chaque feuille est réellement **compilée**, et les deux filets textuels
   rejoués sur le CSS produit — Sass conserve les commentaires « loud » dans sa sortie, donc une
   règle avalée s'y retrouve verbatim, à l'intérieur d'un commentaire. Ce filet ferme un trou que
   même #614 laissait ouvert : rien dans `npm test` ne compilait les feuilles avant lui.

**Ce qu'il ne voit pas**, à ne pas surestimer : « la règle existe dans le CSS produit » n'est pas
« la règle s'applique à l'élément visé ». Passent donc inaperçus un mixin plus jamais inclus, une
branche `@if` jamais prise, un sélecteur qui ne correspond à aucun HTML, et une règle écrasée plus
loin par une autre. Il ne vérifie **aucune valeur** : `flex-basis: 100%` devenu `flex-basis: 10%`
est invisible ici (domaine du e2e et de la relecture). Portée limitée aux `.scss` de `src/` : ni
le CSS inline d'`index.html`, ni celui d'un futur composant.

### Contraste AA des tokens de couleur (#576, #582)

`tests/contraste-tokens.test.ts` lit les tokens dans `base.scss`/`themes.scss` et éprouve
leur contraste WCAG **thème par thème** — les six (cinq clairs + Nuit ; « Clair-obscur »
n'est pas résolu en JS et applique la palette Nuit, déjà couverte), en quelques
millisecondes. Complète le scan axe qui, même devenu bloquant (#583), ne visite que 14 vues
et ne voit qu'**un** thème — celui rendu.

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

**Les dérogations s'auto-périment.** Un défaut connu mais non corrigé (#385, #438, #600)
est déclaré avec son issue et son motif, et le test correspondant est **inversé** : il
exige que le couple soit *encore* en échec. Le jour où quelqu'un corrige la couleur, `npm
test` échoue tant que l'entrée n'est pas retirée. C'est volontaire : une allow-list qui
survit à ce qu'elle justifiait finit par masquer une vraie régression.

**La palette d'IMPRESSION est vérifiée comme un miroir** de la palette claire (#601).
`print.scss` force une quinzaine de tokens en `!important` pour rétablir les couleurs claires
sur papier quel que soit le thème d'affichage — un thème Nuit rendrait un corrigé illisible.
C'est une **copie à la main**, et une copie ne suit pas sa source : elle forçait encore
`--muted: #9aa1ac`, la valeur d'avant #576, celle qui plafonnait à 2,6:1. Le token avait été
corrigé à la source, sa copie non, et rien ne pouvait le voir — le gate ne lisait que
`base.scss` et `themes.scss`. Le papier n'est pourtant pas moins exigeant que l'écran : c'est
même là que le parent lit le corrigé. Chaque token forcé doit désormais valoir la valeur
claire, et toute divergence voulue s'écrit avec sa raison (`--page-bg`, blanc sur papier —
imprimer un aplat teinté gâcherait de l'encre pour rien). Le test échoue **aussi** si une
divergence déclarée cesse d'en être une.

**La formule vit dans `tools/contrast/wcag.js`**, partagé avec l'outil interactif
`tools/contrast/contrast.mjs` (qui n'en est plus que l'habillage CLI). Celui qu'on lance pour
**choisir** une couleur et celui qui fait **échouer** `npm test` mesurent la même chose par
construction. Le module a ses propres ancres testées (21:1, 1:1, les deux gris qui encadrent
le seuil AA à un cran près) : si la formule dérive, ce sont elles qui tombent d'abord. C'est
le seul JS du programme TypeScript (`allowJs`), parce que le CLI s'exécute sans build.

### Découvrabilité par les moteurs — balisage des trois pages (#631)

`tests/seo-decouvrabilite.test.ts` (27 tests) éprouve le balisage SEO des trois
pages contre les **attendus de l'issue**, pas contre le code : URL canonique
absolue par page (avec la répartition assumée — vitrine et guide sur
elles-mêmes, `app.html` sur la vitrine), `meta description` propre à
`app.html`, validité et contenu de `public/sitemap.xml` (deux URL exactement,
`app.html` exclue, chaque `<loc>` correspondant à une page qui existe et se
déclare canonique), JSON-LD `WebApplication`/`FAQPage` fidèle au contenu
visible, et le critère négatif « une seule URL présentée comme page
d'accueil » (pas de doublon de canonical, pas de repli par `meta robots
noindex`).

**Le seul test qui lit le dépôt plutôt que l'issue est le critère 5** : les
classes scolaires annoncées dans le `WebApplication` (`educationalLevel`) sont
comparées à `availableLevels(getAllLessons())` — la même source que le choix
de classe au démarrage de l'application. Ouvrir l'application à un nouveau
niveau scolaire sans mettre à jour le JSON-LD de la vitrine fait donc échouer
`npm test`.

**Critère 8 (3 tests) — preuve de propriété Search Console / Bing Webmaster
Tools.** Les deux `<meta>` de vérification (`google-site-verification`,
`msvalidate.01`) doivent être présentes dans le `<head>` de la vitrine avec le
jeton **exact** (une lettre altérée ou une valeur tronquée fait échouer le
test — c'est le cas le plus vicieux, où la balise a l'air en place et ne
vérifie plus rien), chaque jeton ne doit apparaître **qu'une fois** et jamais
dans un `<script>` (aucun script n'est ajouté par cette ouverture de compte),
et aucun des deux ne doit être recopié sur `app.html` ni `guide.html`. Cf.
[Build & déploiement](build-et-deploiement.md) pour ce que ces jetons sont
(et ne sont pas) et pourquoi les retirer casserait la propriété en silence.

**Chaque règle prouve son mordant avant d'être appliquée à la page réelle** :
un gate qui ne trouve rien serait indiscernable d'un gate qui ne cherche rien,
donc chaque fonction de règle (canonical, écart de FAQ…) est d'abord soumise à
du balisage fautif fabriqué à la main — canonical relatif, canonical vers une
autre page, deux canonicals concurrents, question de FAQ oubliée — avant
d'être appliquée aux trois pages.

**Rejet écrit : le contenu des réponses de FAQ n'est pas comparé au texte
visible.** Le gate compare les **questions** (libellés exacts, inventaire dans
les deux sens, cf. critère 6 ci-dessus) mais ne vérifie du côté des
**réponses** que leur non-vacuité. Une comparaison littérale casserait sur
tout lien, tout `<strong>` et toute fusion de plusieurs `<p>` du HTML visible
absents du texte `Answer.text` — des éditions de forme, pas de fond — pour un
mauvais rapport coût/fragilité sur les 14 réponses au total, qui changent
rarement. Ce qui tient la fidélité à la place : le comptage des questions
(mécanisé, ci-dessus) et un rappel posé au point d'édition réel, en
commentaire juste avant `<div class="v-faq-list">` dans `index.html` et
`guide.html` — vérifier qu'aucune clause (renvoi, condition, exception) ne
disparaît en fusionnant plusieurs paragraphes dans une réponse JSON-LD, cf.
[Conventions rédactionnelles](conventions-redaction.md).

Cf. [Build & déploiement](build-et-deploiement.md) pour ce que ce balisage dit
(et pour les pistes écartées ou différées, consignées là-bas plutôt qu'ici).

### Le texte narratif d'une frise se vérifie en e2e, pas en Vitest (#545)

Précédent établi deux fois désormais — la frise d'états (`friseNotionHTML`, #521) puis la frise
de composition des listes de dictée (`friseCompositionHTML`, #545) : le CALCUL (quelles cellules,
quelles dates, quel changement) est couvert en Vitest sur les fonctions pures de `core/` ; la
PHRASE réellement rendue (le récit lu par un lecteur d'écran ou affiché en clair) n'est vérifiée
qu'en e2e, sur le DOM produit par le vrai runner (`e2e/frise-composition-listes.spec.ts`,
critère 12 par exemple). Ce n'est pas un trou de couverture : dupliquer l'assertion de texte dans
les deux couches ferait dériver l'une sans l'autre, et cette suite Vitest reste sur `src/core/`
(cf. en tête de page) — elle n'appelle pas les fonctions de rendu de `src/ui/` qui composent la
phrase finale. Le premier précédent (la frise d'états) n'avait
jamais été écrit noir sur blanc, ce qui a fait rouvrir la question à la frise suivante — d'où cette
note, pour qu'un futur relecteur ne redemande pas « où est le test Vitest du texte de la frise ? ».

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
échantillon de **14 vues** plutôt que des assertions de rendu ciblées — signal
automatisé et **bloquant** depuis #583, complémentaire du jugement de l'agent
`relecteur-accessibilite`. Détails : `e2e/README.md`.

**La bascule s'est faite sur mesure, pas sur intention.** Le scan avait atterri non
bloquant (#411) pour ne pas figer le merge sur la dette existante : 6 vues en échec sur 9,
2 règles (`color-contrast`, `label`), le 19/08/2026. Après #576 (token `--muted`), #577
(champs sans nom accessible), #386 (ligne de champ invisible en Nuit) et le gate de paires
de tokens #582 : **2 vues, 1 règle**, la règle `label` ayant entièrement disparu. Ce qui
restait est **déclaré en dérogation** — par couple de couleurs, avec issue, mesure et date
— plutôt que corrigé à la va-vite, parce que les deux causes restantes (#600, #609) sont
des décisions de design.

Deux choix qui font la différence entre ce gate et une allow-list qui s'endort :

- **La maille est la cause, pas l'élément.** Les 38 éléments signalés en août ne
  correspondaient qu'à 4 causes racines ; une liste par sélecteur aurait grossi à chaque
  vue ajoutée sans rien dire de plus. Une dérogation déclare le couple de couleurs
  **mesuré par axe** — donc la couleur réellement rendue, composition alpha comprise. C'est
  ce qui permet de nommer `#50926e`, qui n'est écrit dans aucune feuille : c'est un voile
  blanc à 16 % posé sur l'accent (la pastille du chronomètre, #609).
- **Une dérogation qui n'excuse plus rien fait échouer le test.** Corriger le défaut oblige
  à retirer l'entrée. Sans ça, l'allow-list survit à ce qu'elle justifiait et finit par
  couvrir une vraie régression.

L'échantillon est passé de 9 à 14 vues, **décidé sur mesure** : sept candidates scannées,
cinq retenues, deux écartées (« Révision espacée », « Séance » rendent un écran vide sur un
profil neuf — un gate sur un écran vide ne garde rien). Les cinq ajoutées n'ont apporté
**aucune cause racine nouvelle** : élargir était de la couverture gratuite. Elles ont en
revanche montré que `--accent` sur `--page-bg` est un couple **réel**, alors que le gate de
#582 l'avait écarté au motif que « l'accent en texte est toujours posé sur une carte » — le
couple a été ajouté à la table, et l'erreur consignée là-bas.

**`e2e/aucune-ressource-tierce.spec.ts` (#631)** est un gate transversal du même
genre, sur les trois pages cette fois : il écoute le **réseau réel**
(`page.on('request')`) et les cookies posés plutôt que le seul HTML servi — un
tracker posé par du JS après coup ne se verrait pas à la seule lecture du
source — et refuse tout hôte hors origine (`data:`/`blob:` acceptés, ce sont
des ressources inline). C'est la contrepartie non négociable de la
déclaration Search Console / Bing Webmaster Tools qu'introduit #631 : se
déclarer aux moteurs ne doit rien ajouter dans la page que voit l'enfant.

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
tableau).

**La comparaison de pixels agrandit le viewport avant de capturer, et c'est la seule
chose à comprendre de cette spec (#458).** **185 des 189 éléments capturés** — 179 des
183 fiches, plus les 6 écrans de runner — sont **plus hauts que le viewport** du profil
mobile (393×727). Playwright ne sait capturer un élément plus grand que le viewport
qu'en **défilant et en assemblant** plusieurs prises, et cet assemblage n'est pas
reproductible : deux captures consécutives de la même fiche diffèrent, animations
désactivées et hauteur stable au centième de pixel. Mesuré : **178 fiches instables sur
183** au viewport nominal, **0 sur 183** dès que le viewport dépasse la plus grande
fiche.

C'est ce qui a de-gaté ce test pendant des mois. Le diagnostic d'origine — arrondi
sous-pixel du scaling SVG `width:100%/height:auto` — était **faux**, et l'a envoyé
chercher au mauvais endroit : les hauteurs sont stables (3562,25 px sur douze prises
sur `num-dec-grille`), le DPR fractionnaire du profil mobile n'y est pour rien (sonde
CI à `deviceScaleFactor: 1` : même leçon en échec), et ce n'est pas un écart local ↔ CI
(l'échec se reproduit dans un seul run, sur une seule machine). Trace de la
rectification : commentaire daté sur #458.

La spec mesure donc les hauteurs, agrandit le viewport **une seule fois**, puis
**vérifie l'invariant dont elle dépend** — plus aucune capture ne déborde —, avec la
liste des fautives en message d'échec, un garde-fou contre la limite de texture du
compositeur, et un refus de passer sur un sélecteur vide. Rien du rendu n'est épinglé
ni arrondi : la largeur ne change pas, donc la mise en page des fiches non plus.

**Ce que ce régime ne voit plus, écrit noir sur blanc** : tout ce qui ne s'exprime qu'à
viewport court — règles en `vh`, `position: sticky`, media queries de hauteur
(`@media (orientation: landscape) and (max-height: 540px)` sur `.figure-svg`). Aucune
ne s'applique aujourd'hui à la galerie (barre d'outils et pied de page y sont masqués,
cf. `galerie.scss`) et ces régressions relèvent des specs de leçon, pas de la galerie.

Les baselines restent **ancrées sur l'environnement CI** (ubuntu + Chromium, le moteur
de texte différant d'un OS à l'autre) et régénérées via
`.github/workflows/update-snapshots.yml`. Corollaire retenu de #458 : après une
régénération, **deux runs CI** avant de conclure — l'instabilité qu'on vient de fermer
ne se voyait justement pas sur un run unique. Détails et procédure : `e2e/README.md`.

### Rappel des mots difficiles (#618) — deux volets NON rejoués en e2e, et pourquoi

`e2e/mots-difficiles.spec.ts` couvre la pause du runner d'orthographe, le bouton
« Relire ces mots » et sa restriction, la non-fuite du filtre de relecture (Précédent
**et** rechargement), le réglage encadrant et la fin de révision espacée. Deux volets du
cadrage en sont **volontairement absents**, écrits ici pour qu'ils ne soient pas
re-remontés à chaque relecture :

- **La dictée lancée en mode ciblé** (critère 3). Sa branche d'escalade est la copie
  structurelle de celle du mot caché — mêmes appels `noterMotDifficile` / `diffCorrect` /
  `renderAtelier` — et la rendre observable demanderait de **simuler une voix TTS** (cf.
  `ortho-dictee-muette.spec.ts`) **en plus** de rejouer les huit activités d'une séance.
  Le mot caché, lui, est bien joué de bout en bout : c'est le chemin qui prouve la
  mécanique.
- **Le volet NÉGATIF « une séance ciblée sur les tuiles ne nomme jamais rien »**
  (critère 3). Ce que ce volet garde est une **absence de point d'appel** : le mode tuiles
  n'a aucune branche de correction guidée. C'est vérifiable par lecture (aucun
  `noterMotDifficile` hors des branches `motCache` / `dictee` de `ortho-runner.ts`) alors
  qu'un test e2e devrait poser huit grilles de tuiles pour ne rien observer — le coût est
  celui d'un scénario complet, la preuve est plus faible que celle du call-site.

Corollaire à tenir : si un jour le mode tuiles gagne une correction guidée, ce n'est pas
ce fichier qu'il faudra relire mais la décision 1 de #618, qui l'exclut explicitement du
dispositif.
