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

## Scan a11y automatique (axe-core, #411)

`a11y-axe.spec.ts` injecte **axe-core** (`@axe-core/playwright`) dans les vues
pilotées et remonte les violations **WCAG 2.0/2.1 niveaux A + AA** (contraste,
libellés de formulaire, `<title>`/`<desc>` des figures SVG, rôles ARIA, ordre des
titres…). C'est un **signal automatisé** qui **complète** l'agent-conseil
`relecteur-accessibilite` (jugement sémantique, qualité du TTS, pertinence
contextuelle) sans le remplacer. Helper réutilisable : `e2e/axe.ts` (`scanA11y`
pour lancer le scan, `formatA11yReport` pour le rapport lisible).

- **Échantillon scanné** (représentatif des grandes familles de rendu, pas
  exhaustif) : **accueil / grille des leçons** (navigation principale), une
  **leçon maths avec figure SVG** (libellés de figure + contraste des tracés),
  une **leçon français en saisie** (consigne + champ de formulaire), l'**espace
  encadrant** (écran adulte dense), une **modale** (dialog superposé, scan
  restreint au sous-arbre de la modale). On couvre un exemplaire de chaque
  famille plutôt que toutes les leçons : les régressions a11y sont quasiment
  toujours structurelles (un composant, un thème), donc un représentant par
  famille suffit à les attraper sans suite fragile.
- **Rapport** : groupé **par règle puis par élément**, trié par sévérité,
  imprimé dans les logs (exploitable tel quel par un agent) ; le détail JSON
  complet est **attaché** au rapport Playwright (`axe-<hash>.json`).
- **Atterrissage NON bloquant** : par défaut les violations sont **remontées mais
  ne font pas échouer** le test — on ne fige pas le merge sur la dette a11y
  existante (suivie en #385/#386/#387). La bascule en **gate bloquant** est un
  suivi séparé, une fois la dette soldée. Pour prévisualiser ce que le gate
  bloquerait : `A11Y_GATE=1 npx playwright test e2e/a11y-axe.spec.ts` (le scan
  échoue alors sur toute violation, avec le rapport en message d'assertion).

## CI

Job `e2e` séparé dans `.github/workflows/ci.yml`, **bloquant** (#413) : la suite
est fiabilisée (exécution en série `workers=1`, `retries: 1`, `trace:
on-first-retry`) et gèle le merge en cas d'échec. Reste à l'ajouter aux status
checks requis de la branche protégée `main` (réglage du dépôt, côté mainteneur).
