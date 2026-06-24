[← Architecture Ludaskia](../ARCHITECTURE.md)

# Modes & navigation

## Routage par hash

Vues routées **par hash** (le Précédent/Suivant du navigateur fonctionne, et un
hébergement statique sous sous-chemin `/Ludaskia/` ne nécessite aucune config de
fallback SPA) : `#accueil` · `#matieres` · `#matiere-<id>` · `#categorie-<id>` ·
`#lecon-<id>` · `#mode-<id>` (choix de mode d'une leçon, #69) · `#sprint-config` ·
`#sprint` · `#bilan-custom` · `#bilan-cat-<id>` · `#ortho-mode-<id>` (choix de mode
d'une liste d'ortho) · `#ortho-new` · `#ortho-edit-<id>` · `#ortho-revoir-<id>`
(création / édition / relecture des listes d'ortho) · `#revision-espacee` · `#profils` ·
`#encadrant` (espace encadrant, #234) · `#revision`
(`#lecons`, ancien sélecteur plat, reste
routable mais n'est plus lié). Les identifiants de leçon sont des **chaînes**
(`math-tables-addition`, `fr-conj-etre-present`…). Les déclencheurs changent juste
le hash ; `route()` (sur `hashchange`) rend la vue.

## Modes d'exercice

Modes d'exercice : **une leçon à la fois** (atteinte via Matière → Catégorie),
**bilan express/complet** (au niveau d'une catégorie ; l'express est borné),
**bilan personnalisé** (sélection libre, ou scopé à une catégorie, + favoris),
**sprint 5 min** (filtrable, multi-matières), **révision des erreurs** (rejoue les
erreurs d'une session, n'enregistre rien). L'accueil ne propose plus de cartes
express/complet : on y accède par Matière → Catégorie. Le **mode Révision**
(accueil, `#revision-espacee`) rejoue les éléments **dus** par répétition espacée
— mots d'orthographe **et** leçons maths/conjugaison — **regroupés par catégorie**,
un élément à la fois, sans chrono ni record.

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

## Reprise d'un exercice en cours (#63)

Les exercices **grille** (leçon, bilans
express/complet/personnalisé) sont **sauvegardés automatiquement** quand on les
quitte (navigation, onglet masqué/fermé, saisie débouncée) et reproposés sur
l'**accueil** (sous la progression) et l'**écran de catégorie** dans une section
**« À continuer »**. Reprendre restaure l'état **exact** (calculs posés, réponses,
temps actif) sans régénérer ; le **chrono repris est masqué** et un exercice repris
**ne compte pas pour le temps**. Une reprise est **propre au profil**, **unique par
identité d'exercice** (relancer demande « Continuer / Recommencer »), et **expire**
en silence après 7 j. Le **sprint** et la **révision espacée** sont hors périmètre
(on **confirme** avant de quitter ces modes, faute de reprise).

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
