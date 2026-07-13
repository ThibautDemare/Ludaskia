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

**Hors périmètre, volontairement** : le plancher « 50-100 items distincts par
banque » n'est **pas** un invariant universel — environ la moitié du catalogue
produit, par conception, moins de 50 items distincts (conjugaison = un verbe × un
temps = 6 formes, ~4 types de triangles…). Il reste une cible pour les **banques
de contenu** (vocabulaire, homophones), pas un gate sur l'ensemble du catalogue.

## Smoke tests e2e (Playwright)

**Smoke tests e2e (`e2e/`, Playwright, #129).** Complémentaires : ils pilotent
l'app dans un navigateur (profil mobile Chromium) pour couvrir ce que la logique
pure ne voit pas — navigation par hash, rendu d'un exercice, écran d'une
catégorie vide, démarrage du sprint, **absence d'erreur de rendu**
(`watchErrors`). Restent **ciblés et stables** : on teste le contenu présent sur
`main`, pas une leçon en cours de PR. `vitest` est restreint à `tests/` pour ne
pas ramasser les specs Playwright. Détails : `e2e/README.md`.

À part, `a11y-axe.spec.ts` fait tourner un **scan axe-core** (WCAG A/AA) sur un
échantillon de vues plutôt que des assertions de rendu ciblées — signal
automatisé, **non bloquant** par défaut, complémentaire du jugement de l'agent
`relecteur-accessibilite`. Détails : `e2e/README.md`.
