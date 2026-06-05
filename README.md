# Ludaskia

**Entraînement au calcul mental, ludique et chronométré.** Application web
légère (HTML/CSS/JS, sans installation) pour s'exercer en autonomie — pensée
au départ pour le **CE2**.

👉 **[Jouer en ligne](https://thibautdemare.github.io/Ludaskia/)**

## Ce qu'on peut faire
- **Bilan complet** — les 15 leçons, une douzaine de calculs chacune.
- **Bilan express** — 3 calculs par leçon, en ~15 minutes.
- **Une leçon à la fois** — cibler un thème et viser le sans-faute.
- **Sprint 5 min** — enchaîner un maximum de bonnes réponses, calculs tirés au
  hasard, à la volée.
- **Réviser mes erreurs** — rejouer uniquement les calculs ratés.
- **Imprimer / PDF** — une version papier (page de garde, 15 fiches, 2 bilans).

## Motivation & suivi
- **Objectifs de régularité** (hebdo/mensuels) et **défi du jour**.
- **Médailles** de classement, **trophées** à débloquer, **records** personnels.
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
- **Stack** : HTML/CSS + **TypeScript**, bundle par **Vite** (modules ES).
- Installer les dépendances :

      npm install

- Serveur de développement (rechargement à chaud) :

      npm run dev

- Tests (Vitest) :

      npm test

- Build de production (vers `dist/`) :

      npm run build

- Détails d'architecture et conventions dans `CLAUDE.md` et `CONTRIBUTING.md`.

## Feuille de route
Le format se prête bien aux **automatismes** : au-delà du calcul mental, le
projet vise d'autres **niveaux** et d'autres **matières** (conjugaison,
vocabulaire/langues, repères histoire-géo…), en réutilisant le même moteur de
jeu et de progression.

## Licence
À définir.