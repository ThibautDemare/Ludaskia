# Tests e2e (Playwright)

Smoke tests de **navigation et de rendu réel**, complémentaires des tests
**Vitest** (`tests/`, logique pure sans DOM). Ils pilotent l'application dans un
navigateur (profil mobile Chromium — cœur de cible tablette/smartphone) pour
attraper les régressions que la logique pure ne voit pas : crash de rendu au
lancement d'un exercice, navigation par hash cassée, écran d'une catégorie
vide, etc.

## Lancer

```bash
npm run test:e2e            # tout le harnais (démarre un serveur Vite tout seul)
npx playwright test --ui    # mode interactif (debug)
```

Au premier usage, installer le navigateur : `npx playwright install chromium`.

Le serveur de dev est démarré automatiquement par Playwright (`webServer` dans
`playwright.config.ts`) sur le port **4173**, l'app étant servie sous
`/Ludaskia/`. En local, un serveur déjà lancé est réutilisé.

## Conventions

- **Tester le contenu stable de `main`** (calcul mental, catégories vides,
  sprint), pas une leçon en cours de PR — un smoke test ne doit pas devenir
  rouge parce qu'une leçon a bougé.
- Naviguer via `gotoHash` (helpers) ; vérifier l'absence d'erreur de rendu via
  `watchErrors` (exceptions non rattrapées + `console.error` applicatifs).
- Rester **ciblé et robuste** : peu de tests, des sélecteurs stables
  (`#btnVerify`, `.cat-empty`, `.lesson-item`…), pas de suite exhaustive fragile.

## CI

Job `e2e` séparé dans `.github/workflows/ci.yml`, **non bloquant**
(`continue-on-error`) tant que le harnais se stabilise (#129).
