[← Architecture Ludaskia](../ARCHITECTURE.md)

# Modes & navigation

## Routage par hash

Vues routées **par hash** (le Précédent/Suivant du navigateur fonctionne, et un
hébergement statique sous sous-chemin `/Ludaskia/` ne nécessite aucune config de
fallback SPA) : `#accueil` · `#matieres` · `#matiere-<id>` · `#categorie-<id>` ·
`#lecon-<id>` · `#mode-<id>` (choix de mode d'une leçon, #69) · `#sprint-config` ·
`#sprint` · `#bilan-custom` · `#bilan-cat-<id>` · `#ortho-mode-<id>` (choix de mode
d'une liste d'ortho) · `#ortho-new` · `#ortho-edit-<id>` · `#ortho-revoir-<id>`
(création / édition / relecture des listes d'ortho) · `#revision-espacee` ·
`#seance` (programme du jour composé par l'encadrant, #440) · `#profils` ·
`#encadrant` / `#encadrant/<onglet>` (espace encadrant en onglets, #234/#459) ·
`#revision`
(`#lecons`, ancien sélecteur plat, reste
routable mais n'est plus lié). Les identifiants de leçon sont des **chaînes**
(`math-tables-addition`, `fr-conj-etre-present`…). Les déclencheurs changent juste
le hash ; `route()` (sur `hashchange`) rend la vue.

## Onboarding du 1er lancement (#225, #330)

Au premier lancement, `main.ts` enchaîne (après `route()`) un onboarding en **trois
étapes**, chacune mémorisée **par profil** : **choix de classe** → **mot aux parents** →
**tour enfant**. La modale de **choix de classe** (`ui/onboarding.ts`,
`maybeShowClassChoice`, **choix forcé**, déclenchée si `besoinChoixNiveau()` — voir
[Niveaux scolaires](niveaux-scolaires.md)) s'affiche d'abord ; son callback `onChosen`
re-rend la vue puis appelle `maybeOnboarding()` (`ui/tour.ts`). Quand aucun choix de
classe n'est requis, `maybeOnboarding()` est appelé directement. Celui-ci, **idempotent
et sans effet hors accueil** (et anti-chevauchement avec les autres overlays), affiche
une fois le **mot aux parents** (modale destinée à l'adulte), puis enchaîne sur le **tour
enfant** guidé par la mascotte (3 repères de l'accueil ; voir `ui/tour.ts` /
[Rendu & interactions](ui.md)). Chaque étape pose son drapeau « déjà vu » dès
l'ouverture (`ludaskia_parents_seen`, `ludaskia_tour_seen`), donc l'enchaînement ne se
rejoue jamais tout seul. Le bouton **« ? »** de la barre d'accueil (`#btnGuide`, drapeau
`guide` de `setToolbar`) **rejoue le tour à volonté**, sans toucher à ces drapeaux.

## Modes d'exercice

Modes d'exercice : **une leçon à la fois** (atteinte via Matière → Catégorie),
**bilan express/complet** (au niveau d'une catégorie ; l'express est borné),
**bilan personnalisé** (sélection libre, ou scopé à une catégorie, + favoris),
**sprint 5 min** (filtrable, multi-matières), **révision des erreurs** (rejoue les
erreurs d'une session, n'enregistre rien). L'accueil ne propose plus de cartes
express/complet : on y accède par Matière → Catégorie. Le **mode Révision**
(accueil, `#revision-espacee`) rejoue les éléments **dus** par répétition espacée
— mots d'orthographe **et** leçons maths/conjugaison — **regroupés par catégorie**,
un élément à la fois, sans chrono ni record. Les exercices à **geste** (tuiles,
rangement, tri, appariement, « clique sur le mot ») y sont rejoués avec leur **vrai
widget** (#186/#345/#466) **et leur aide contextuelle** (#272) : bouton « ampoule »
sur la carte + bulle au 1er geste de ce type jamais vu, comme en leçon — c'est
souvent ici, longtemps après la leçon, que l'enfant a besoin de retrouver comment se
rectifier.

## Programme du jour composé par l'encadrant (#440)

Le **programme du jour** (`#seance`, `startSeance`/`showSeanceView` dans
`navigation.ts`, rendu par `ui/seance.ts`, logique par `core/seance.ts`) est une
**séance** (nom interne des types) : une liste d'**étapes**, chacune un mode
existant (Sprint, Révision espacée, **la file « à revoir »** #464, Leçon du jour,
une leçon précise, une ou plusieurs dictées) demandé un certain nombre de fois
(`count`), composée à l'avance par l'encadrant pour un profil (cf. [Espace
encadrant](espace-encadrant.md)). **Distinct de la « leçon du jour »** (#208,
`core/lecon-du-jour.ts`) : celle-ci propose *une* leçon au fil de l'**avancement**
(franchie = étoile OU score ≥ 70 % sur un essai complet en mode leçon, #485 — la
maîtrise durable, elle, reste portée par la révision espacée), sans intervention
adulte, alors que le programme est une **liste composée à
l'avance**, potentiellement multi-modes, que l'enfant réalise **dans l'ordre
qu'il veut** (une étape épuisée sort des propositions ; « compléter » = tout
faire). Au plus un programme s'applique par jour (récurrence par **date**
ponctuelle ou **jours de semaine**, garde-fou de conflit côté composition).
**Reset paresseux** à minuit (calculé à la lecture, comme le défi du jour) :
aucun timer, aucun affichage punitif si le programme n'est pas fini à temps.

**Étape « à revoir » et étapes conditionnelles (#464)** : l'encadrant peut ajouter
une étape qui puise, au lancement, dans la file épinglée « à revoir » (même file
que la carte d'accueil dédiée, cf. [Espace encadrant](espace-encadrant.md)) plutôt
que de laisser cette file sur sa seule surface d'accueil. Cette étape est
**conditionnelle** : sans rien d'épinglé, elle est escamotée du programme du jour
(jamais affichée vide) ; une définition dont **aucune** étape ne s'applique vaut
« pas de programme ». Le cœur ne sait pas calculer seul cette condition (l'« acquis »
d'une dictée dépend de la disponibilité du TTS, connue de l'UI) : c'est `ui/seance.ts`
qui fournit le `ContexteSeance` à chaque lecture, via sa porte d'entrée unique
`vueProgramme()` (utilisée aussi par la navigation). Depuis #498, ce contexte porte
les ids épinglés **par nature** (leçons / listes d'orthographe), et non plus un
simple compte : il sert autant à décider si l'étape s'applique qu'à reconnaître,
dans le journal d'activité, laquelle des épinglées vient d'être travaillée.

**Attribution sur ce qui a été fait, pas sur le bouton pris (#498)** : le journal
d'activité (`loadActivity`, #319) porte désormais une **référence** par session
(`ActivityEntry.ref` = id de la leçon ou de la liste d'orthographe travaillée ;
absente pour une session **multi-cibles**, comme un bilan ou un sprint).
`resoudreProgramme` (remplace `resoudrePending`, appelée par `rafraichirProgramme`
via `showHomeView`/`showSeanceView`) relit, à chaque passage, les sessions
**nouvelles depuis son dernier passage** (curseur `SeanceJour.vuTs`) et cherche,
pour chacune, l'étape restante qu'elle satisfait (`etapeSatisfaite`, arbitrage **du
plus spécifique au plus large** en cas d'ambiguïté — une leçon épinglée nourrit
d'abord « à revoir » plutôt que « Leçon du jour »). Le marqueur posé au lancement
(`marquerEtapeLancee`) survit mais ne conditionne plus le crédit : il ne sert plus
qu'à **dater** l'étape (durée réelle, métrique) et à **lever une ambiguïté** quand
il désigne l'une des étapes candidates. Conséquence directe : une leçon lancée
depuis la carte « À revoir » de l'accueil, une dictée lancée depuis le catalogue,
ou une activité **reprise** puis terminée plus tard, créditent leur étape aussi
bien qu'un lancement depuis le programme lui-même — aucun mode/runner n'est
modifié pour ça. Sans session satisfaisante trouvée (abandon en cours d'étape),
rien n'est crédité ni faussé. Une étape déjà travaillée aujourd'hui **reste
comptée et affichée** même si elle cesse de s'appliquer en cours de journée
(épinglée retirée par l'adulte, ou redevenue solide) : elle sort seulement des
propositions. La complétion de **tout** le programme — qu'elle vienne d'une étape
tout juste créditée ou du contexte qui fait disparaître la dernière étape restante
— est détectée dans ce même passage et déclenche modale + confettis
(`showCelebration`) et le trophée dédié (cf. [Gamification](gamification.md)),
**sans XP** (chaque mode a déjà donné le sien).

**Retour en fin d'activité (#461)** : une leçon ou une dictée lancée depuis le
programme ramène, à sa fin, vers `#seance` (« Retour au programme ») plutôt que vers
la catégorie catalogue de la leçon — c'est `ui/retour-activite.ts` (cf. [Rendu &
interactions](ui.md)) qui mémorise cette origine et la restitue aux écrans de fin.
Sprint et révision espacée restent hors périmètre : ils finissent sur l'accueil, qui
re-rend déjà la carte du programme.

**Deux surfaces enfant** : la carte d'accueil `#cardProgramme` (`renderProgrammeCard`,
masquée hors programme applicable ce jour) et l'écran dédié `#seance` (`renderSeance`)
— tuiles des étapes restantes en ordre libre, jauge de pastilles, bouton « Choisis
pour moi ». Vocabulaire à l'écran, des **deux côtés** (enfant et encadrant) :
toujours « programme » / « programme du jour » ; « séance » ne subsiste que dans les
noms internes du code (`SeanceDef`, `core/seance.ts`…).

## Choix du sous-exercice / mode depuis une leçon (#69)

Quand un `ExerciseType`
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

## Reprise d'un exercice en cours (#63, étendue aux runners #498)

Deux **natures** d'exercice sont **sauvegardées automatiquement** quand on les
quitte (navigation, onglet masqué/fermé, saisie débouncée) et reproposées sur
l'**accueil** (sous la progression) et l'**écran de catégorie** dans une section
**« À continuer »** :
- la **fiche en saisie** et les **bilans** (express/complet/personnalisé) —
  reprise historique (#63) : l'état tient dans le DOM (champs remplis), on
  restaure le rendu **exact** (calculs posés, réponses, temps actif) sans
  régénérer ;
- depuis #498, les **dix runners « une question à la fois »** (QCM, QCM multi,
  tri, ordre, tuiles, tableau de conversion, appariement, clic-mot, droite
  graduée, problème), qui n'avaient jusque-là **aucune** reprise (leur état vit
  en mémoire, pas dans le DOM). On restaure l'**état logique** (questions déjà
  tirées, index, score) et c'est le runner qui se **re-rend lui-même**.
  Granularité : le début de la question **entamée** — les questions déjà
  validées ne sont jamais rejouées.

Un instantané écrit avant #498 (sans nature déclarée) est lu comme une fiche,
sans perte de reprise en cours à la mise à jour. Le **chrono repris est masqué**
et un exercice repris **ne compte pas pour le temps**. Une reprise est **propre
au profil**, **unique par identité d'exercice** (`startLecon` propose désormais
« Continuer / Recommencer » **avant** l'écran de choix de mode, #69, les deux
natures étant reprenables) et **expire** en silence après 7 j. Le **sprint** et
la **révision espacée** restent hors périmètre (on **confirme** avant de
quitter ces modes, faute de reprise). Détail des modules côté rendu :
`ui/resume.ts` et `ui/runner-reprise.ts`, cf. [Rendu & interactions](ui.md).

## Pipeline multi-matières

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
