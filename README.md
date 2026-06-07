# Ludaskia

**Entraînement aux automatismes, ludique et chronométré.** Application web
légère (HTML/CSS/JS, sans installation) pour s'exercer en autonomie — pensée
au départ pour le **CE2**, en **maths** comme en **français**.

👉 **[Jouer en ligne](https://thibautdemare.github.io/Ludaskia/)**

## D'où vient le nom ?
*Ludaskia* est un mot-valise inspiré du latin *ludus* / *ludere* (jeu, jouer) et
du grec *áskēsis* (exercice, entraînement) — soit, librement, « **s'exercer en
s'amusant** ». Clin d'œil au passage : en latin, *ludus* désignait aussi l'école
élémentaire, là où l'on apprenait à lire, écrire et compter.

## Les matières
Les exercices sont rangés par **matière → catégorie → leçon** :

- **Mathématiques — Calcul mental** : 15 leçons (tables d'addition et de
  multiplication, compléments, doubles et moitiés, multiples, décompositions,
  multiplier par 10/100…).
- **Français — Conjugaison** : 13 verbes fréquents (auxiliaires, 1er et 2e
  groupes, verbes du 3e groupe) à conjuguer au **présent**, **futur**,
  **imparfait** et **passé composé**.

Le moteur de jeu est **agnostique de la matière** : ajouter un nouveau thème
réutilise toute la mécanique d'entraînement et de progression.

## Ce qu'on peut faire
- **Bilan complet** — toutes les leçons d'une catégorie, plusieurs questions
  chacune.
- **Bilan express** — quelques questions par leçon, pour un tour rapide.
- **Bilan personnalisé** — choisir ses matières / catégories / leçons et le
  nombre de questions, puis **enregistrer ses bilans favoris**.
- **Une leçon à la fois** — cibler un thème et viser le sans-faute.
- **Sprint 5 min** — enchaîner un maximum de bonnes réponses, questions tirées
  au hasard à la volée, **filtrable par matière et par catégorie**.
- **Réviser mes erreurs** — rejouer uniquement les questions ratées.
- **Imprimer / PDF** — une version papier des fiches et bilans.

## Motivation & suivi
- **Compteur d'XP** — chaque bonne réponse rapporte des points, tous modes
  confondus.
- **Objectifs de régularité** (hebdo/mensuels) et **défi du jour**.
- **Médailles** de classement, **records** personnels, **étoiles** par leçon
  réussie sans faute.
- **Trophées à débloquer**, dont des séries **par matière** et **par catégorie**.
- **Statistiques par leçon** pour repérer les thèmes à retravailler.
- **Correction immédiate** : la bonne réponse est affichée en cas d'erreur.

## Profils
Plusieurs enfants peuvent utiliser le même navigateur : chaque **profil** garde
sa propre progression. La progression d'un profil peut être **exportée** dans un
fichier puis **réimportée** (sauvegarde ou transfert vers un autre appareil).

## Utilisation
Le plus simple : [jouer en ligne](https://thibautdemare.github.io/Ludaskia/).
Toute la progression est enregistrée **localement** dans le navigateur (rien
n'est envoyé sur un serveur).

## Pour les développeurs
- **Stack** : HTML/CSS + **TypeScript**, bundle par **Vite** (modules ES),
  tests **Vitest**.
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
Le format se prête bien aux **automatismes**. Au-delà du calcul mental et de la
conjugaison déjà en place, le projet vise d'autres **matières** (vocabulaire /
orthographe, repères histoire-géo…) et d'autres **niveaux scolaires**, en
réutilisant le même moteur de jeu et de progression. Côté motivation, la
gamification continue de s'enrichir (progression, récompenses).

## Licence
À définir.
