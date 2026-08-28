# Tests — Ludaskia

Tests de la logique (génération, persistance, récompenses), via Vitest.

```bash
npm test
```

Sortie : liste des cas (✓/✗) puis un bilan ; le code de sortie vaut `1` si un test échoue
(utilisable en pré-commit / CI).

## Comment ça marche
Les modules de `src/` sont des modules ES avec `import`/`export`. `tests/logic.test.ts`
les importe directement et teste la **logique pure** (pas le rendu DOM). L'environnement
DOM/`localStorage` est fourni par `happy-dom` (configuré dans `vite.config.ts`).

Comme l'état des modules ES est un singleton, un `beforeEach` reproduit la fraîcheur de
l'ancien `freshEnv()` : `localStorage.clear()`, rebranchement du hook d'écriture
(`setOnDataWrite(touchActiveProfile)`) puis `initProfiles()` pour recréer un profil par
défaut et le préfixe actif. Le **rendu** n'a plus d'état de module à réinitialiser
(#352) : `renderItem`/`gridHTML` reçoivent un `RenderContext` explicite
(`createRenderContext()`), donc aucun état ne fuit d'un test à l'autre.

## Étendre
- Importer le symbole à tester depuis `../src/core/*` (ou `../src/ui/*`) et l'ajouter à
  l'objet `api` en tête de `logic.test.ts` si l'on garde le style `api.x`.
- Ajouter un cas : `test('nom', () => { ... })` avec les assertions `expect(...)`.
- **Nouvelle leçon** : pas besoin d'écrire à la main les invariants structurels de base
  (`generate()` ne lève pas, round-trip de correction, QCM bien formé, générateur non
  figé) — `catalogue-invariants.test.ts` les éprouve automatiquement pour **toute**
  leçon du catalogue, sous des graines variées via `fast-check` (property-based). N'écrire
  un test dédié que pour la **logique propre** à la leçon (calculs spécifiques, cas
  limites) ; voir `docs/architecture/tests.md`.
- **Réponses attendues** : le même harnais porte un linter de typographie (#578) —
  pas d'apostrophe typographique (`’`) dans une `answer`/`answers`, ni d'espace
  parasite. Une leçon dont la réponse s'écrit `l’action de…` échoue : l'enfant tape
  l'apostrophe droite de son clavier et `normalizeText` ne replie pas les deux formes.
- **Nouveau niveau scolaire jouable** : le JSON-LD de la vitrine (`index.html`)
  annonce les classes disponibles (`educationalLevel`) — `tests/seo-decouvrabilite.test.ts`
  (#631) les compare à `availableLevels(getAllLessons())` et échoue si le balisage
  n'est pas mis à jour ; voir `docs/architecture/build-et-deploiement.md`.
