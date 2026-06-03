# Tests — Calcul mental CE2

Tests de la logique (génération, persistance, récompenses), sans dépendance.

```bash
node exercices/tests/run.js
```

Sortie : liste des cas (✓/✗) puis un bilan ; le code de sortie vaut `1` si un test échoue
(utilisable en pré-commit / CI).

## Comment ça marche
Les fichiers de `js/` sont des scripts classiques partageant la portée globale.
`run.js` les concatène, les exécute dans un contexte `vm` avec des stubs
`document`/`window`/`localStorage`, et expose les symboles à tester via `globalThis.__api`.
Seule la **logique pure** est couverte (pas le rendu DOM).

## Étendre
- Ajouter un symbole à tester : compléter la liste `API` en tête de `run.js`.
- Ajouter un cas : `test('nom', () => { const {api}=freshEnv(); ... })` avec les
  assertions `eq(a,b)` / `ok(cond)`. `freshEnv()` repart d'un `localStorage` vierge.
