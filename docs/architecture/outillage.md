[← Architecture Ludaskia](../ARCHITECTURE.md)

# Stack & outillage

- **TypeScript** (`strict`) en **modules ES**, bundlé par **Vite**.
- Styles en **SCSS** (compilés par Vite).
- Tests : **Vitest** (logique pure, `happy-dom`, + **fast-check** pour le harnais
  d'invariants du catalogue #410) + **Playwright** (smoke e2e navigation/rendu,
  dossier `e2e/`, #129), complété par des **snapshots visuels** du catalogue
  (`toHaveScreenshot`, #412, baselines ancrées sur l'environnement CI) et un
  **scan d'accessibilité automatique axe-core** (`@axe-core/playwright`, #411)
  sur un échantillon de vues — ce dernier **non bloquant** par défaut. Détail
  dans `e2e/README.md`.
- Qualité : **ESLint** (flat config + `typescript-eslint`) et **Prettier**.
- Déploiement : **GitHub Pages** via GitHub Actions (build Vite → `dist/`).

## Commandes

| Commande | Rôle |
|----------|------|
| `npm install` | installer les dépendances |
| `npm run dev` | serveur de dev + HMR |
| `npm run build` | build de production → `dist/` |
| `npm test` | tests Vitest |
| `npm run typecheck` | `tsc --noEmit` (strict) |
| `npm run lint` | ESLint |
| `npm run format` / `format:check` | Prettier |
| `npm run test:e2e` | smoke tests Playwright (`e2e/`) |

En complément, des **scripts de génération** d'assets/données (hors cycle de dev courant) :
`npm run verbs:gen` (shards de conjugaison LEFFF, cf. `verbs-lookup.ts`), `npm run forest:gen`
(SVG de la forêt d'accueil) et `npm run og:gen` (image Open Graph de la vitrine).

## Intégration continue (CI)

La CI (`.github/workflows/ci.yml`) a deux jobs : `test` enchaîne `format:check →
lint → typecheck → test` (bloquant), et `e2e` lance les smoke tests Playwright
(**bloquant** depuis #413 ; #129). Sur chaque PR et push `main`.

Un workflow séparé, `.github/workflows/update-snapshots.yml` (#412), régénère et
recommite les baselines de screenshots de la galerie (`e2e/galerie.spec.ts`) sur
l'environnement ubuntu — déclenché manuellement (`workflow_dispatch`) ou par un
commit dont le message contient `[update-snapshots]` (hors `main`). Détail :
`e2e/README.md`.
