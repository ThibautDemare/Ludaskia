# Ludaskia

**Entraînement au calcul mental, ludique et chronométré.** Application web
légère (HTML/CSS/JS, sans installation) pour s'exercer en autonomie — pensée
au départ pour le **CE2**.

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
Aucune installation : ouvrir `index.html` dans un navigateur (double-clic, ou via
n'importe quel serveur statique). Toute la progression est enregistrée
**localement** dans le navigateur (rien n'est envoyé sur un serveur).

## Pour les développeurs
- **Vanilla** : HTML/CSS/JS, **aucune dépendance, aucun build**.
- Tests (Node, sans dépendance) :

      node tests/run.js

- Détails d'architecture et conventions dans `CLAUDE.md`.

## Feuille de route
Le format se prête bien aux **automatismes** : au-delà du calcul mental, le
projet vise d'autres **niveaux** et d'autres **matières** (conjugaison,
vocabulaire/langues, repères histoire-géo…), en réutilisant le même moteur de
jeu et de progression.

## Licence
À définir.