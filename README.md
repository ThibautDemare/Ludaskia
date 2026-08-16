# Ludaskia

**Entraînement aux automatismes, ludique et chronométré.** Application web
légère (sans installation, sans compte) pour s'exercer en autonomie en **maths**
et en **français**, du **CE2** au **CM1**.

👉 **[Jouer en ligne](https://thibautdemare.github.io/Ludaskia/)**

## D'où vient le nom ?
*Ludaskia* est un mot-valise inspiré du latin *ludus* / *ludere* (jeu, jouer) et
du grec *áskēsis* (exercice, entraînement) — soit, librement, « **s'exercer en
s'amusant** ». Clin d'œil au passage : en latin, *ludus* désignait aussi l'école
élémentaire, là où l'on apprenait à lire, écrire et compter.

## Les matières
Les exercices sont rangés par **matière → catégorie → leçon**, dans l'ordre du
programme. On choisit sa **classe** (CE2 ou CM1) au démarrage pour n'avoir que les
exercices adaptés.

- **Mathématiques** — **Numération** (comparer, encadrer, valeur des chiffres,
  décompositions, fractions), **Calcul** (additions, soustractions et
  multiplications posées), **Calcul mental** (tables, compléments, doubles et
  moitiés, multiples, multiplier par 10/100…, partages), **Grandeurs et mesures**
  (longueurs, masses, contenances, durées, monnaie, lire l'heure, périmètre),
  **Géométrie** (figures planes, cercle, solides, angles, symétrie) et
  **Résolution de problèmes**.
- **Français** — **Grammaire** (pronom sujet, accord sujet-verbe, classes de
  mots, types de phrases), **Conjugaison** (verbes fréquents au **présent**,
  **futur**, **imparfait** et **passé composé**), **Orthographe** (dictées de
  mots, accords, homophones, règles) et **Vocabulaire** (ordre alphabétique, sens
  propre/figuré, familles de mots, champs lexicaux, synonymes et contraires,
  homonymes).

Beaucoup de leçons proposent **deux façons de répondre** — saisie au clavier ou
QCM — et certaines s'appuient sur des **figures générées** (horloge, formes
géométriques…) ou des **interactions** (déplacer ou trier des tuiles).

Le moteur de jeu est **agnostique de la matière et du niveau** : ajouter une
leçon, une matière ou une classe réutilise toute la mécanique d'entraînement et
de progression.

## Ce qu'on peut faire
- **Leçon du jour** — le prochain pas à travailler, mis en avant sur l'accueil
  (la progression avance par la **maîtrise**, pas par le calendrier).
- **Une leçon à la fois** — cibler un thème et viser le sans-faute.
- **Sprint 5 min** — enchaîner un maximum de bonnes réponses, questions tirées au
  hasard à la volée (maths et français), **filtrable par matière et par catégorie**.
- **Révision** — un rappel régulier de ce qui a déjà été vu, **espacé dans le
  temps** (révision espacée).
- **Bilan d'une catégorie** — **complet** (toutes les leçons) ou **express** (un
  tour rapide et borné).
- **Bilan personnalisé** — choisir ses matières / catégories / leçons et le
  nombre de questions, puis **enregistrer ses bilans favoris**.
- **Imprimer / PDF** — une version papier des fiches et bilans, avec corrigé.

## Motivation & suivi
- **XP et niveaux** — chaque bonne réponse rapporte des points, tous modes
  confondus, et fait monter de niveau.
- **Déblocages par palier** — rangs, **compagnon qui évolue**, avatars et
  **thèmes de couleur**.
- **Objectifs de régularité** (hebdo/mensuels) et **défi du jour** porté par la
  mascotte de l'accueil.
- **Médailles** de classement, **records** personnels, **étoiles** par leçon
  réussie sans faute.
- **Trophées à débloquer**, dont des séries **par matière** et **par catégorie**.
- **Statistiques par leçon** pour repérer les thèmes à retravailler.
- **Correction immédiate** : la bonne réponse est affichée en cas d'erreur.

## Profils & espace encadrants
Plusieurs enfants peuvent utiliser le même navigateur : chaque **profil** garde
sa propre progression, son avatar, son thème et ses réglages de confort. La
progression d'un profil peut être **exportée** dans un fichier puis **réimportée**
(sauvegarde ou transfert vers un autre appareil).

L'**espace encadrants** réunit ce qui s'adresse à l'adulte, sans rien rendre
obligatoire : l'enfant peut s'entraîner sans qu'un adulte ait quoi que ce soit à
régler. On y **suit** où en est chaque notion et sur quoi ça a coincé, on
**prépare** une séance ou une leçon « à revoir », on **saisit la liste de mots de
la dictée** de la semaine, et on **adapte** l'application (classe, aménagements
« dys » / attention). Un **code d'accès** optionnel garde le tout hors de portée.

Par principe : ni note, ni moyenne, ni classement, ni comparaison entre enfants —
un outil d'accompagnement, pas un bulletin. Le détail est dans
[`docs/architecture/espace-encadrant.md`](docs/architecture/espace-encadrant.md).

## Accessibilité & confort
Chacun ajuste son expérience : **lecture à voix haute** des consignes
(« Écouter »), **chrono du Sprint masquable** pour s'entraîner sans pression, et
réglages d'**affichage** (police, couleurs, animations réduites). Une attention
particulière est portée aux profils « dys » et à la lisibilité.

D'autres **aménagements se posent depuis l'espace encadrants** et ne bougent
plus, pour que l'enfant n'ait rien à régler lui-même.

## Utilisation
Le plus simple : [jouer en ligne](https://thibautdemare.github.io/Ludaskia/).
Toute la progression est enregistrée **localement** dans le navigateur (rien
n'est envoyé sur un serveur), et l'entraînement **continue de fonctionner si la
connexion se coupe** une fois la page ouverte. Rouvrir l'application plus tard
sans réseau n'est en revanche pas encore garanti (service worker à venir).

## Pour les développeurs
- **Stack** : HTML + **SCSS** et **TypeScript** (`strict`), bundle par **Vite**
  (modules ES). Tests **Vitest** (logique) et **Playwright** (smoke e2e). Qualité :
  **ESLint** + **Prettier**. Déploiement : **GitHub Pages**.
- Installer les dépendances :

      npm install

- Serveur de développement (rechargement à chaud) :

      npm run dev

- Tests (Vitest) :

      npm test

- Build de production (vers `dist/`) :

      npm run build

- Architecture dans `docs/ARCHITECTURE.md`, conventions et process dans
  `CLAUDE.md` / `CONTRIBUTING.md`.

## Feuille de route
Le format se prête bien aux **automatismes**. Au-delà du CE2 et du CM1 déjà en
place, le projet vise d'autres **niveaux scolaires** et de nouveaux **contenus**,
en réutilisant le même moteur de jeu et de progression. Côté motivation, la
gamification continue de s'enrichir (progression, récompenses).

## Licence
**Tous droits réservés** (`UNLICENSED`). Le code source est **public et
consultable** par transparence et curiosité, mais ce **n'est pas un logiciel
libre** : aucune autorisation de réutilisation, de modification ou de
redistribution n'est accordée.
