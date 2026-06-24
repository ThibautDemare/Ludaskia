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

## Smoke tests e2e (Playwright)

**Smoke tests e2e (`e2e/`, Playwright, #129).** Complémentaires : ils pilotent
l'app dans un navigateur (profil mobile Chromium) pour couvrir ce que la logique
pure ne voit pas — navigation par hash, rendu d'un exercice, écran d'une
catégorie vide, démarrage du sprint, **absence d'erreur de rendu**
(`watchErrors`). Restent **ciblés et stables** : on teste le contenu présent sur
`main`, pas une leçon en cours de PR. `vitest` est restreint à `tests/` pour ne
pas ramasser les specs Playwright. Détails : `e2e/README.md`.
