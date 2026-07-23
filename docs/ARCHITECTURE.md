# Architecture — Ludaskia

> Document **« état courant »** : il décrit l'architecture telle qu'elle est
> aujourd'hui, et se met à jour **sur place** à chaque évolution. L'historique
> des décisions vit dans les commits, les PR et les issues — pas ici.
>
> Ce fichier est le **sommaire** : le détail est réparti par thème dans
> [`docs/architecture/`](architecture/). Quand l'architecture évolue, on met à
> jour le **sous-fichier** concerné (et ce sommaire si on ajoute/retire une
> section).

## Vue d'ensemble

Mini-application web d'entraînement **multi-matières** (CE2, et **début de CM1**). Côté
**maths**, le catalogue suit le découpage du manuel CE2 en **Numération** (dont les
**fractions**), **Calcul** (opérations posées), **Calcul mental** (dont la **division par
le sens**), **Grandeurs et mesures**, **Géométrie** et **Résolution de problèmes**
(#92) — toutes peuplées —, complétées par une 7e catégorie **Organisation et gestion de
données** (#257, lecture de tableaux/diagrammes), **CM1 seule** (« Bientôt disponible »
sous un profil CE2). Côté
**français**, le catalogue suit les 4 catégories du manuel CE2 dans l'ordre
canonique — **grammaire**, **conjugaison**, **orthographe**, **vocabulaire**
(#107) ; **grammaire** porte le **pronom sujet et l'accord sujet-verbe** (#115)
et les **classes de mots / articles / adverbes** (#116) et **les phrases**
(ponctuation, types, #204), **vocabulaire** accueille
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
**vérification** d'un exercice — c'est ce qui rend le moteur agnostique de la matière. Le
**niveau scolaire** est un réglage de contenu **par matière** (CE2 partout, CM1 amorcé sur
quelques leçons) — voir [Niveaux scolaires](architecture/niveaux-scolaires.md). Le document
de conception initial est `docs/design-multi-subject.md`.

## Sommaire

### Code & structure

- [Structure des sources (`src/`)](architecture/structure-du-code.md) —
  arborescence, `main.ts`, état de module partagé.
- [Contenu & leçons (`src/data/`)](architecture/contenu-et-lecons.md) — toutes les
  leçons, par **Matière → Catégorie** (français : grammaire / conjugaison /
  orthographe / vocabulaire ; maths : numération / calcul / calcul mental / grandeurs &
  mesures / géométrie / problèmes / organisation et gestion de données).
- [Logique pure (`src/core/`)](architecture/core.md) — modules `core/` regroupés par
  thème : fondations (dont **`figures/`**, moteur de figures SVG découpé par
  famille), catalogue, progression, révision, gamification, encadrant.
- [Rendu & interactions (`src/ui/`)](architecture/ui.md) — modules `ui/`, runners
  d'exercice, thèmes d'affichage, **Accessibilité (#42)**.

### Fonctionnement

- [Modes & navigation](architecture/modes-et-navigation.md) — routage par hash,
  **onboarding du 1er lancement** (classe → mot parents → guide, #225/#330), modes
  d'exercice, choix de mode (#69), reprise (#63), **programme du jour** composé par
  l'encadrant (#440), **Pipeline multi-matières**.
- [Données & profils](architecture/donnees-et-profils.md) — clés `localStorage`,
  cycle de vie des profils.
- [Gamification](architecture/gamification.md) — médailles, trophées, objectifs de
  régularité, XP & niveaux, déblocages.
- [Espace encadrant (#234)](architecture/espace-encadrant.md) — **organisée en
  onglets** (#459), consultation sans bascule, récap d'accompagnement,
  **composition du programme du jour** (#440), verrou PIN optionnel.
- [Niveaux scolaires (#225)](architecture/niveaux-scolaires.md) — classe par
  matière, namespacing de progression `@niveau`.

### Conventions & outillage

- [Conventions rédactionnelles](architecture/conventions-redaction.md) — voix
  « tu / je » (#278), titres sémantiques & hiérarchie (#277).
- [Stack & outillage](architecture/outillage.md) — TypeScript / Vite / SCSS,
  commandes, intégration continue.
- [Tests](architecture/tests.md) — Vitest (logique pure), smoke Playwright (e2e).
- [Build & déploiement](architecture/build-et-deploiement.md) — GitHub Pages,
  estampille de version, auto-actualisation.
- [Piste d'évolution](architecture/pistes-d-evolution.md) — chantiers à explorer.
