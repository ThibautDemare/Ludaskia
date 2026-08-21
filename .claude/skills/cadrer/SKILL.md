---
name: cadrer
description: >-
  Cadre un travail AVANT que le code démarre : transforme un besoin exprimé en
  critères d'acceptation numérotés et observables, avec au moins un critère
  NÉGATIF (ce qui ne doit pas arriver) et un « hors périmètre » explicite. La
  skill fait consulter `pedagogue-primaire` et le cache `docs/reference/programmes/`
  dès que le sujet a une dimension pédagogique, et refuse de clore tant qu'un
  critère n'a pas de cas d'échec identifiable. À invoquer avant d'ouvrir une issue
  de leçon, de mécanique ou d'écran — et systématiquement quand le mainteneur dit
  « on va faire X » sans que X soit encore écrit. À invoquer AUSSI quand on demande
  de démarrer le travail sur une issue existante qui porte le label
  `status: needs scoping` : cette issue n'est pas cadrée, son cadrage passe avant
  toute lecture de code.
---

# Cadrer un travail avant d'écrire le code

Aujourd'hui les tests arrivent **après** l'implémentation, même quand l'auteur des
tests est un agent distinct de l'auteur du code (`auteur-tests-logique`,
`auteur-tests-e2e`). Un critère rédigé après coup ne fait que **décrire ce que
l'implémentation fait déjà** : il ne peut plus servir de garde-fou, ni contre un
biais d'implémentation, ni contre un périmètre réduit sans le dire.

## Pourquoi une skill et pas un sous-agent

Le cadrage est un **dialogue**. Un sous-agent rend un rapport et disparaît ; il ne
peut pas demander au mainteneur « et si l'enfant se trompe deux fois de suite, on
fait quoi ? » puis attendre la réponse. Cette skill tourne donc dans le fil
principal, et **poser des questions au mainteneur fait partie du travail** — pas
une fois à la fin, mais au moment où l'ambiguïté apparaît.

En revanche, ce qui est **de la connaissance** (justesse pédagogique, attendus du
programme) se délègue : voir l'étape 2.

## Le biais à surveiller, et il est fort

Un agent — ou un humain — qui connaît déjà le code propose spontanément les
critères que **le moteur existant sait déjà satisfaire**. Le cadrage se vide alors
de son utilité : il devient une description de l'implémentation prévue, écrite
avant elle plutôt qu'après, ce qui ne change rien.

Signe qu'on est en train de le faire : un critère qu'on peut cocher sans écrire une
ligne de code, ou dont la formulation reprend le vocabulaire du moteur
(« le générateur renvoie un `Exercise` de type `qcm` avec 4 choix ») plutôt que
celui du besoin (« l'enfant doit pouvoir se tromper sans deviner la bonne réponse
par élimination »).

**Reformuler depuis le besoin, pas depuis les capacités connues.** Écrire les
critères en pensant à l'enfant devant l'écran, puis — seulement ensuite — regarder
ce que le moteur sait faire. Si un critère devient difficile à tenir, c'est une
information utile ; ce n'est pas une raison de le réécrire jusqu'à ce qu'il
devienne facile.

## La trame, en quatre sections

Une issue cadrée porte les quatre, dans cet ordre :

### 1. Le problème

Ce qui ne va pas ou ce qui manque, **du point de vue de qui l'utilise** (l'enfant,
le parent). Pas de solution ici. Si on ne sait pas dire à quoi on l'a vu, le
cadrage n'est pas mûr : le dire au mainteneur plutôt que de broder.

### 2. Les critères d'acceptation, numérotés et observables

Un critère est **observable** si on peut décrire le geste qui le vérifie et ce
qu'on doit constater. « L'exercice est adapté au CE2 » n'est pas observable ;
« les nombres restent sous 1 000 et aucune soustraction ne passe par un négatif »
l'est.

Numéroter — pas de puces. Les numéros servent de langage commun entre l'issue, la
PR et les tests (« critère 3 non tenu » se dit, « le troisième point de la liste »
non).

### 3. Au moins un critère NÉGATIF

Ce qui ne doit **pas** arriver. C'est la section que tout le monde oublie, et c'est
souvent la plus utile : elle attrape les régressions et les effets de bord que les
critères positifs laissent passer.

Exemples de la forme attendue :
- « aucune leçon existante ne change de comportement » ;
- « le mode ne doit jamais afficher deux fois le même mot dans une série » ;
- « la correction ne doit pas accepter une réponse tapée avec une apostrophe
  typographique » ;
- « rien de tout ça ne doit apparaître sur l'accueil avant le niveau 5 ».

### 4. Le hors périmètre, explicite

Ce qu'on ne fait **pas** dans ce lot, et pourquoi. Deux effets : le travail ne
s'étale pas en cours de route, et — l'inverse, qui est arrivé — personne ne peut
livrer une version réduite en présentant la réduction comme le périmètre prévu.
Ce qui n'est pas écrit ici est **dans** le périmètre.

## Étapes

### 1. Faire dire le besoin
Reformuler ce que demande le mainteneur en une phrase, et la lui soumettre. Une
reformulation acceptée vaut mieux qu'une hypothèse silencieuse. C'est aussi le
moment de demander ce qui manque — un cadrage qui ne pose aucune question est
presque toujours un cadrage qui a supposé.

### 2. Aller chercher la connaissance, ne pas l'improviser
Dès que le sujet a une **dimension pédagogique** (une notion, un niveau, une
progression, une formulation de consigne) :
- lire le cache local **`docs/reference/programmes/`** — extraits sourcés des
  attendus et repères CE2-CM1, à consulter **avant** d'aller sur eduscol ;
- consulter **`pedagogue-primaire`** sur le fond, avec une **question ouverte**
  (« à quel moment cette notion est-elle attendue, et sous quelle forme ? »), pas
  une solution à valider. Une question fermée obtient un « oui » qui n'apprend
  rien.

Selon la dimension : **`designer-ux-enfant`** pour le rendu, **`gamification-enfant`**
pour l'équilibrage d'une mécanique, **`specialiste-troubles-apprentissage`** pour
l'accessibilité cognitive. Croiser deux avis quand le sujet est à la frontière.

### 3. Écrire les critères, puis les éprouver un par un
Pour **chaque** critère, se poser la question, à voix haute dans le cadrage :

> **Comment saurait-on que ce critère est violé ?**

Si on ne sait pas répondre, le critère n'est pas un critère : c'est une intention.
Deux issues possibles — le reformuler jusqu'à ce qu'un cas d'échec apparaisse, ou
le déplacer en « hors périmètre » s'il relève du jugement et pas du vérifiable.
**Ne pas clore le cadrage** avec un critère qui n'a pas passé cette question ; s'il
en reste un, le signaler explicitement au mainteneur au lieu de le laisser passer
en silence.

Utile pour la suite : quand le cas d'échec est identifiable, il **est** le test à
écrire. C'est ce qui permet à `auteur-tests-logique` / `auteur-tests-e2e` de partir
de l'issue et non du code.

### 4. Écrire le hors périmètre
Y mettre ce qui a été discuté puis écarté (avec la raison en une ligne), et ce
qu'on aurait pu croire inclus. Un « hors périmètre » vide sur un sujet non trivial
est suspect : ça veut dire qu'on n'a pas cherché les bords.

### 5. Ouvrir l'issue
Passer le contenu à **`gestionnaire-github`** : il connaît les labels obligatoires
(type + priorité + effort, plus le niveau scolaire le cas échéant), les
conventions de langue (issues en **français**) et la procédure d'appel de `gh`.
Ne pas appeler `gh` à la main pour ça.

## Garde-fous

- **Ne pas trancher un arbitrage produit à la place du mainteneur.** Le cadrage
  met les options sur la table, avec leur coût ; le choix lui revient. Une
  question qui change ce qu'on va construire se pose, elle ne se devine pas.
- **Ne pas réduire le périmètre en cours de cadrage** pour rendre le travail plus
  simple. Si le besoin est gros, le dire et proposer un découpage **explicite** en
  plusieurs issues — ce qui n'est pas la même chose que livrer moins sans le dire.
- **Ne pas cadrer et implémenter dans le même souffle.** Le cadrage doit pouvoir
  être relu et contesté avant que du code existe ; c'est tout son intérêt.
- **Ne pas écrire les critères d'un travail qu'on va soi-même implémenter**
  (cf. `CLAUDE.md`, § Conventions) : c'est le même angle mort que « auteur ≠
  testeur ».
