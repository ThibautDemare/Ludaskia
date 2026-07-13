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

- **Tester le contenu de la branche** : les leçons **ajoutées dans la même PR**
  ont leur spec (ex. `numeration.spec.ts`, #98) — elle atterrit sur `main` avec
  la leçon. Ne pas tester une leçon vivant sur une **autre** branche ouverte. Un
  smoke test ne doit pas devenir rouge parce qu'une leçon d'un autre lot a bougé.
- Naviguer via `gotoHash` (helpers) ; vérifier l'absence d'erreur de rendu via
  `watchErrors` (exceptions non rattrapées + `console.error` applicatifs).
- Rester **ciblé et robuste** : peu de tests, des sélecteurs stables
  (`#btnVerify`, `.cat-empty`, `.lesson-item`…), pas de suite exhaustive fragile.
- **Sprint déterministe** : le tirage du sprint est aléatoire par nature. Pour tester le
  rendu d'un type de question précis sous sprint, passer par le **composeur de bilan
  personnalisé** scopé à une seule leçon plutôt que mocker l'aléatoire : `bilan-cat-<id>`
  → `#bcSelectNone` → cocher la leçon visée (`.bc-lesson-check[value=…]`) → mode `sprint`
  (`.bc-mode-radio[value="sprint"]`) → `#bcRun` (#64, `ui/bilan.ts`). Le sprint ne tire
  plus que sur cette leçon. Exemple : `e2e/pave-signes.spec.ts`.

## CI

Job `e2e` séparé dans `.github/workflows/ci.yml`, **bloquant** (#413) : la suite
est fiabilisée (exécution en série `workers=1`, `retries: 1`, `trace:
on-first-retry`) et gèle le merge en cas d'échec. Reste à l'ajouter aux status
checks requis de la branche protégée `main` (réglage du dépôt, côté mainteneur).
