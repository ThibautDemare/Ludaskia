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

Playwright démarre **deux** serveurs (`webServer` dans `playwright.config.ts`),
l'app étant servie sous `/Ludaskia/` dans les deux cas. En local, un serveur déjà
lancé sur le port visé est réutilisé.

| Port | Quoi | Pour qui |
| --- | --- | --- |
| **4173** | `npm run dev` | toutes les specs, via `gotoHash` |
| **4174** | `npm run build` + `vite preview` (export `PROD_URL`) | `offline.spec.ts` |

Pourquoi deux : le **service worker est volontairement désactivé sous le serveur
de dev** (#306). Un SW enregistré là sert d'un test à l'autre les assets mis en
cache par le précédent, et les échecs qui en découlent sont différés et
incompréhensibles. La spec hors-ligne a pourtant besoin d'un vrai worker : elle
vise donc le **build de production**, où elle exerce le vrai précache et non une
approximation. Elle navigue en URL absolue (`PROD_URL`), pas via `gotoHash`.

⚠️ `reuseExistingServer` est actif hors CI : si un serveur de dev tourne déjà sur
4173 **depuis un autre dépôt ou un autre worktree**, Playwright le réutilise et
vous testez du code périmé (404 inexplicables). Vérifier que le port est libre,
sinon lancer avec une config temporaire sur des ports isolés.

## Conventions

- **Tester le contenu de la branche** : les leçons **ajoutées dans la même PR**
  ont leur spec (ex. `numeration.spec.ts`, #98) — elle atterrit sur `main` avec
  la leçon. Ne pas tester une leçon vivant sur une **autre** branche ouverte. Un
  smoke test ne doit pas devenir rouge parce qu'une leçon d'un autre lot a bougé.
- Naviguer via `gotoHash` (helpers) ; vérifier l'absence d'erreur de rendu via
  `watchErrors` (exceptions non rattrapées + `console.error` applicatifs).
- Rester **ciblé et robuste** : peu de tests, des sélecteurs stables
  (`#btnVerify`, `.cat-empty`, `.lesson-item`…), pas de suite exhaustive fragile.
- **Pas d'import de `src/` dans une spec** : une spec reste une boîte noire du rendu,
  elle ne doit pas rougir parce qu'un module interne a été renommé (l'exactitude du
  catalogue est éprouvée côté Vitest). Un id de leçon connu s'écrit **en dur**. Seule
  exception, centralisée dans `helpers.ts` : `leconsDuNiveau(matiere, niveau)`, pour
  les scénarios qui doivent amorcer le **programme entier** (ex. « toutes les leçons
  mises de côté », #485) — impossible à figer à la main sans pourrir à chaque ajout.
- **Sprint déterministe** : le tirage du sprint est aléatoire par nature. Pour tester le
  rendu d'un type de question précis sous sprint, passer par le **composeur de bilan
  personnalisé** scopé à une seule leçon plutôt que mocker l'aléatoire : `bilan-cat-<id>`
  → `#bcSelectNone` → cocher la leçon visée (`.bc-lesson-check[value=…]`) → mode `sprint`
  (`.bc-mode-radio[value="sprint"]`) → `#bcRun` (#64, `ui/bilan.ts`). Le sprint ne tire
  plus que sur cette leçon. Exemple : `e2e/pave-signes.spec.ts`.
- **Atteindre le bilan du sprint sans attendre 5 minutes réelles** : le chrono du sprint
  tourne sur `Date.now()` + `setInterval`, donc rien de plus fiable qu'une horloge
  truquée pour le faire s'écouler — jamais un `waitForTimeout` (non déterministe, et
  bien trop long pour un smoke test). Utiliser l'API `page.clock` de Playwright :
  `await page.clock.install()` **avant** de lancer le sprint (avant le clic sur
  `#scLaunch`/l'appel à `runSprint`, donc avant la création du `setInterval` qui décrémente
  le temps restant), puis `await page.clock.fastForward('05:01')` une fois la dernière
  question répondue pour atteindre `.sprint-done`. Installer l'horloge APRÈS le lancement
  ne fonctionne pas (l'intervalle déjà créé tourne sur l'horloge réelle). Exemple :
  `e2e/je-ne-sais-pas.spec.ts` (« Sprint : valider un champ vide… »).
- **Forcer une fenêtre de course de façon déterministe** : un scénario qui ne reproduit un bug
  que si une action retardée (un `setTimeout` de débounce, par ex.) retombe **pendant** un
  autre événement ne doit pas dépendre du temps réel écoulé entre deux clics Playwright — ce
  temps varie avec la machine, et le test ne perd la course qu'une fois sur N. Enchaîner les
  gestes qui doivent tomber dans la même fenêtre au sein d'un **seul `page.evaluate`** (même
  tour de boucle d'évènements JS : leurs suites en microtâche se rejouent à temps réel quasi
  nul, forcément avant qu'une macrotâche de type `setTimeout` ne puisse se déclencher), puis
  avancer une horloge truquée (`page.clock`) pour faire retomber le minuteur en vol soi-même.
  La fenêtre du bug est ainsi heurtée à chaque run. Exemple : `e2e/encadrant-banque.spec.ts`
  (« un re-rendu complet pendant la fenêtre d'annonce… », #527).

## Scan a11y automatique (axe-core, #411)

`a11y-axe.spec.ts` injecte **axe-core** (`@axe-core/playwright`) dans les vues
pilotées et remonte les violations **WCAG 2.0/2.1/2.2 niveaux A + AA** (contraste,
libellés de formulaire, `<title>`/`<desc>` des figures SVG, rôles ARIA, ordre des
titres, `target-size` des cibles tactiles…). C'est un **signal automatisé** qui
**complète** l'agent-conseil `relecteur-accessibilite` (jugement sémantique,
qualité du TTS, pertinence contextuelle) sans le remplacer. Helper réutilisable :
`e2e/axe.ts` (`scanA11y` pour lancer le scan, `formatA11yReport` pour le rapport
lisible). On écarte les règles « best-practice » (bruit non normatif).

- **Échantillon scanné** (représentatif des grandes familles de rendu, pas
  exhaustif) : **accueil / grille des leçons** (navigation principale), une
  **leçon maths avec figure SVG** (libellés de figure + contraste des tracés),
  une **leçon français en saisie** (consigne + champ de formulaire), une **leçon
  à tuiles** (ARIA sur-mesure : rôles, zone de dépôt — la famille la plus à
  risque), l'**espace encadrant** (écran adulte dense), une **modale de saisie**
  et une **modale de gamification** (dialogs superposés, scan restreint au
  sous-arbre de la modale). On couvre un exemplaire de chaque famille plutôt que
  toutes les leçons : les régressions a11y sont quasiment toujours structurelles
  (un composant, un thème), donc un représentant par famille suffit à les
  attraper sans suite fragile.
- **Attente avant scan** : chaque vue attend un élément repère **puis la fin des
  animations d'entrée** (`settleAnimations`) — scanner une modale à mi-fondu
  (`modal-pop`, opacité 0→1) donnerait un contraste non déterministe. Règle à
  suivre pour toute vue animée ajoutée à l'échantillon.
- **Rapport** : groupé **par règle puis par élément**, trié par sévérité, avec le
  `failureSummary` d'axe (ratio et couleurs mesurés pour le contraste) et les
  règles `incomplete` (qu'axe n'a pas pu trancher). Imprimé dans les logs
  (exploitable tel quel par un agent) ; le détail JSON complet est **attaché** au
  rapport Playwright (`axe-<hash>.json`).
- **Atterrissage NON bloquant** : par défaut les violations sont **remontées mais
  ne font pas échouer** le test — on ne fige pas le merge sur la dette a11y
  existante (suivie en #385/#386/#387). La bascule en **gate bloquant** est un
  suivi séparé, une fois la dette soldée. Pour prévisualiser ce que le gate
  bloquerait : `A11Y_GATE=1 npx playwright test e2e/a11y-axe.spec.ts` (le scan
  échoue alors sur toute violation, avec le rapport en message d'assertion).

## Snapshots visuels de la galerie (#412)

`galerie.spec.ts` compare le rendu du catalogue à des **baselines de screenshots**
commitées, pour attraper les régressions purement **graphiques** (mise en page
cassée, figure SVG mal rendue, couleur qui change) que les smoke tests (absence
d'erreur JS + interaction) ne voient pas. Complète — sans le remplacer — le
jugement esthétique/émotionnel de l'agent `designer-ux-enfant` : on n'attrape ici
que les régressions **mécaniques**.

- **Route galerie** (`src/ui/galerie.ts`) : la route **DEV** `#galerie` rend en une
  page la **fiche de chaque leçon**, groupée par catégorie. Elle est **absente du
  build de production** : le handler est gardé par `import.meta.env.DEV` et importe
  le module galerie dynamiquement → en prod (`vite build`, `DEV=false`) Rollup
  supprime la branche **et** l'import ⇒ ce code n'est pas dans le bundle exposé. La
  CI e2e tourne, elle, sur le serveur Vite `npm run dev` (`DEV=true`) → route dispo.
- **Rendu déterministe** : toute la galerie est construite sous `withSeed` (graine
  fixe) et chaque leçon calibrée à son premier niveau (`levels[0]`), donc contenu
  **identique d'un run à l'autre**, indépendant du profil/niveau actif — condition
  d'une comparaison de pixels stable.
- **Une capture par catégorie** (`toHaveScreenshot` sur chaque `[data-gallery]`,
  `animations: 'disabled'`) : diff localisé, PNG de taille raisonnable. Une seule
  route/spec couvre tout le catalogue visuel.
- **Périmètre v1** : les **fiches** (saisie, QCM en cases à cocher, opérations
  posées, **figures SVG**, listes). Les écrans de **runner** interactifs (tuiles,
  tri, appariement, problème, tableau de conversion), couplés à `#sheets`/au chrono
  et à l'enregistrement d'un essai, sont un autre type de rendu → suivi séparé.

### Baselines : ancrées sur la CI, jamais générées en local

Le **moteur de rendu de texte** dépend de l'OS (FreeType sous Linux, DirectWrite
sous Windows, CoreText sous macOS) : même police (Nunito est auto-hébergée,
identique partout), l'anti-crénelage diffère → une baseline générée sous
Windows/macOS ne correspondrait jamais au rendu **ubuntu + Chromium** du runner CI.
Les baselines sont donc **ancrées sur l'environnement de la CI** et le test de
comparaison est **ignoré hors Linux** (`test.skip`, visible « skipped » en local).
Le 1er test de la spec (rendu sans erreur + présence des sections) tourne, lui, sur
toutes les plateformes : il valide la galerie en local sans dépendre des baselines.

### Régénérer les baselines (rendu volontairement modifié)

**Quand** : uniquement après une **évolution VOLONTAIRE du rendu** (nouvelle leçon,
refonte d'un composant, changement de couleur/figure assumé). Un diff **inattendu**
est une **régression** → corriger le code, **ne pas** régénérer pour masquer.

**Comment** : via le workflow CI `.github/workflows/update-snapshots.yml`, qui
régénère dans l'environnement du runner (ubuntu + Chromium) — seul moyen d'obtenir
des pixels identiques à ceux comparés par le job `e2e`. Il recommite les PNG
modifiés sur la branche via le `GITHUB_TOKEN`.

- **Workflow déjà sur `main`** : onglet **Actions → « Mettre à jour les snapshots
  visuels » → Run workflow**, choisir la branche. Il régénère et recommite les
  baselines. ⚠ Ce push (par `GITHUB_TOKEN`) **ne redéclenche aucun workflow** : pour
  relancer la comparaison (`ci.yml`), pousser ensuite un commit **normal** (ou
  ouvrir/rouvrir la PR).
- **Amorçage** (workflow pas encore sur `main`, ou 1re génération d'une branche) :
  pousser sur la branche un commit dont le **message contient `[update-snapshots]`**.
  Le déclencheur `push` du workflow s'exécute, régénère et recommite les baselines.
  Ordre propre pour éviter une CI rouge : pousser la branche (commit
  `[update-snapshots]`) **avant** d'ouvrir la PR ; une fois les baselines commitées
  par le bot (`git fetch`), ouvrir la PR → `ci.yml` compare avec les baselines en
  place.

**Ne jamais** régénérer en local : `npx playwright test galerie --update-snapshots`
sous Windows/macOS est ignoré (`test.skip` hors Linux) et ne produit rien
d'exploitable ; sur une machine Linux le rendu diffère encore du runner CI.

## CI

Job `e2e` séparé dans `.github/workflows/ci.yml`, **bloquant** (#413) : la suite
est fiabilisée (exécution en série `workers=1`, `retries: 1`, `trace:
on-first-retry`) et gèle le merge en cas d'échec. Reste à l'ajouter aux status
checks requis de la branche protégée `main` (réglage du dépôt, côté mainteneur).
