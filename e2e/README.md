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

## Couverture du journal d'erreurs (#581)

`journal-couverture.ts` (une **table**, pas une spec) déclare pour chaque format
d'exercice une leçon, un mode et le geste qui produit une erreur ;
`journal-couverture.spec.ts` boucle dessus et rejoue le même round-trip pour chacun
(produire l'erreur par une vraie interaction → la retrouver dans l'espace encadrant).
**Ajouter un format d'exercice = ajouter son entrée**, sinon `npm run typecheck` et
`npm test` échouent (le gate est côté Vitest, `tests/journal-couverture.test.ts` —
détails dans [docs/architecture/tests.md](../docs/architecture/tests.md)).

Deux points de méthode si tu touches à cette table :

- **Elle importe `src/`, et c'est délibéré** (dérogation à la règle ci-dessus) : elle
  n'importe que des **types** (`Exercise['type']`, `SchoolLevel`, `ModeOrtho`), et
  c'est justement ce couplage qui fait le gate — une union d'exercices qui s'étend
  sans que la table suive doit rougir. Le fichier n'est pas une spec : il est lu par
  la spec **et** par le test Vitest, d'où sa position à part.
- **Aucun `expect` dans les gestes** : la table est importée par Vitest, donc rien de
  `@playwright/test` ne doit y entrer à l'exécution (`import type` seulement). Un
  geste utilise `Page`/`Locator` (`waitFor`, `click`, `fill`) et lève une `Error`
  explicite s'il ne peut pas produire l'erreur attendue ; les assertions vivent dans
  la spec.

## Couverture par surface de rendu (#598)

La règle « pas de fonctionnalité visuelle sans sa spec » est tenue par un gate Vitest,
`tests/couverture-e2e-gate.test.ts`, qui lit `e2e/*.spec.ts` comme du texte : chaque **id
de mode** du catalogue (9 aujourd'hui) et chaque **runner** `src/ui/lecon-*.ts` doit être
exercé. Deux conséquences pour qui écrit une spec ici :

- **Un mode compte comme couvert** s'il est cliqué via `.mode-btn[data-mode="…"]` dans une
  spec, ou déclaré dans `journal-couverture.ts`. Un mode qu'on se contente de laisser par
  défaut ne compte pas — c'est précisément le trou visé.
- **Un runner sans aiguillage par type** (`lecon-du-jour`, `lecon-passer`,
  `lecon-runner-shared`) est prouvé couvert par une **signature CSS** que le gate cherche
  dans les specs (`.lj-title`, `.lecon-reveal`, `.lqcm-progress-lab`). Renommer une de ces
  classes sans toucher la spec fait échouer `npm test` : c'est voulu, la spec ne testerait
  plus rien.

Le gate garde l'**existence** d'un chemin, pas sa qualité. Détails et raisons :
[docs/architecture/tests.md](../docs/architecture/tests.md).

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
- **Gate BLOQUANT** (#583) : toute violation fait échouer le build. Le scan avait
  atterri non bloquant (#411) pour ne pas figer le merge sur la dette existante ;
  celle-ci est soldée (#576, #577, #386) ou déclarée. Le drapeau `A11Y_GATE` n'existe
  plus — un gate qu'il faut penser à activer n'est pas un gate.
- **Dérogations par CAUSE, pas par élément** : ce qui reste est déclaré dans le
  fichier par **couple de couleurs** (celles que mesure axe, composition alpha
  comprise), avec son issue, sa mesure et sa date, et la liste des vues où il se
  manifeste. C'est la bonne maille : les 38 éléments signalés en août ne
  correspondaient qu'à **4 causes racines**, et une liste par sélecteur aurait grossi
  à chaque vue ajoutée sans rien dire de plus.
  Une dérogation qui **n'excuse plus rien** fait échouer le test : corriger le défaut
  oblige à retirer l'entrée, sinon l'allow-list survit à ce qu'elle justifiait.
- **`incomplete` reste informatif** : axe y dit qu'il n'a pas su trancher (ex.
  `target-size` sur un élément partiellement masqué). Faire échouer un build sur un
  « je ne sais pas » ne se corrige pas, ça se contourne.
- **Ajouter une vue** : lui donner un **repère stable** à attendre (pas un
  `waitForTimeout`), et vérifier ensuite quelles dérogations elle déclenche — chacune
  doit lister cette vue, sinon le scan échoue. Deux vues ont été **écartées**
  délibérément (« Révision espacée », « Séance ») : leur contenu dépend de
  l'historique du profil et, sur un profil neuf, elles rendent un écran vide. Un gate
  sur un écran vide ne garde rien.

## Snapshots visuels de la galerie (#412)

> ⚠️ **État réel, à lire avant le reste de cette section.** La comparaison de pixels
> est **DE-GATÉE depuis #458** (`test.fixme`, sur **toutes** les plateformes) et le
> dépôt ne contient **aucune baseline**. Autrement dit : aujourd'hui, rien ici
> n'attrape une régression graphique. Ce qui tourne réellement, c'est le **premier**
> test de la spec — « la galerie se rend sans erreur et expose ses sections » —, qui
> est gatant, tourne partout, et vaut déjà quelque chose : il rend **toutes** les
> fiches et **tous** les écrans de runner et exige zéro erreur JS.
>
> Tout ce qui suit (ancrage CI des baselines, procédure de régénération, workflow
> `update-snapshots.yml`) est donc **en sommeil** : la mécanique est décrite parce
> qu'elle redeviendra nécessaire quand #458 rendra le rendu déterministe, pas parce
> qu'elle protège quoi que ce soit maintenant. Ne pas la lire comme un garde-fou en
> place. Conséquence pratique immédiate : pousser un commit `[update-snapshots]`
> déclenche bien le workflow, mais il ne régénère **rien** (le test à régénérer est
> `fixme`) — le job passe au vert en une trentaine de secondes sans rien produire.

`galerie.spec.ts` compare — **quand elle est active** — le rendu du catalogue à des
**baselines de screenshots** commitées, pour attraper les régressions purement
**graphiques** (mise en page cassée, figure SVG mal rendue, couleur qui change) que
les smoke tests (absence d'erreur JS + interaction) ne voient pas. Complète — sans le
remplacer — le jugement esthétique/émotionnel de l'agent `designer-ux-enfant` : on
n'attrape ici que les régressions **mécaniques**.

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
- **Une capture par LEÇON** (`toHaveScreenshot` sur chaque `[data-gallery-lesson]`),
  plus une par écran de runner, `animations: 'disabled'`. Pas par catégorie : une
  section catégorie empile toutes ses fiches (des dizaines de milliers de pixels pour
  la numération), impossible à stabiliser au screenshot. Un article de leçon est
  petit, et le diff est localisé à la leçon fautive.
- **Périmètre** : les **fiches** (saisie, QCM en cases à cocher, opérations posées,
  **figures SVG**, listes) **et**, depuis #419, un exemplaire de chaque écran de
  **runner** interactif (tuiles, ordre, tri, appariement, problème, tableau de
  conversion). Ces écrans sont rendus par le **même code** que le runner live, pas par
  une maquette — cf. `docs/architecture/tests.md`.

### Baselines : ancrées sur la CI, jamais générées en local — **en sommeil (#458)**

Le **moteur de rendu de texte** dépend de l'OS (FreeType sous Linux, DirectWrite
sous Windows, CoreText sous macOS) : même police (Nunito est auto-hébergée,
identique partout), l'anti-crénelage diffère → une baseline générée sous
Windows/macOS ne correspondrait jamais au rendu **ubuntu + Chromium** du runner CI.
Les baselines sont donc **ancrées sur l'environnement de la CI**.

Ce n'est pas ce qui a de-gaté la comparaison. La cause est autre, et plus tenace
(#458) : la hauteur des articles de leçon est **non déterministe au sous-pixel** d'un
run CI à l'autre — scaling SVG `width:100%/height:auto` des figures, reflow de texte
—, si bien qu'aucune baseline ne tient et que le jeu de leçons fautives **varie d'un
run à l'autre** (donc même une liste d'exclusion ne converge pas). Le test de
comparaison est marqué `test.fixme` **partout**, plus seulement hors Linux, et aucune
baseline n'est commitée.

Le 1er test de la spec (rendu sans erreur + présence des sections) tourne, lui, sur
toutes les plateformes : il valide la galerie sans dépendre des baselines. C'est
aujourd'hui **le seul** garde-fou de cette spec.

### Régénérer les baselines (rendu volontairement modifié) — **procédure dormante**

Rien à régénérer tant que #458 n'est pas résolu : le test que régénérerait le workflow
est `fixme`, donc il ne produit aucun PNG. La procédure ci-dessous est conservée parce
qu'elle redeviendra la bonne — pas parce qu'elle sert aujourd'hui.

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

**Ne jamais** régénérer en local : sur une machine Linux le rendu diffère encore du
runner CI, et ailleurs le moteur de texte n'est même pas le même. (Aujourd'hui la
commande ne produit de toute façon rien, le test étant `fixme`.)

## CI

Job `e2e` séparé dans `.github/workflows/ci.yml`, **bloquant** (#413) : la suite
est fiabilisée (exécution en série `workers=1`, `retries: 1`, `trace:
on-first-retry`) et gèle le merge en cas d'échec. Reste à l'ajouter aux status
checks requis de la branche protégée `main` (réglage du dépôt, côté mainteneur).

**Installation du navigateur : `npx playwright install chromium`, sans `--with-deps`.**
Mesure du 19/08/2026 : sur l'image `ubuntu-latest`, toutes les bibliothèques de Chromium
sont déjà présentes (y compris `fonts-noto-color-emoji`, donc les emojis de l'appli
s'affichent pareil). `--with-deps` n'installait réellement que **21 Mo de polices**
japonaises, chinoises, thaï et X11 historiques — sans usage pour une appli française dont
la police d'interface est embarquée dans le dépôt. Et le cache Playwright ne couvre que le
**binaire du navigateur**, jamais les paquets apt : ces 21 Mo se retéléchargeaient à chaque
run. Le jour où le miroir Ubuntu a ralenti, l'étape est passée à **24 min** (pour 11 min de
tests) et trois jobs sont morts au timeout de 6 h.

⚠ Les **deux** workflows qui lancent Playwright (`ci.yml` et `update-snapshots.yml`)
doivent installer le navigateur de la **même façon** : le second GÉNÈRE les baselines que
le premier COMPARE au pixel près. Des polices système présentes d'un côté et absentes de
l'autre suffiraient à faire échouer une comparaison sur un rendu pourtant inchangé.

**Garde-fou de durée.** Chaque job porte un `timeout-minutes` (15 pour `test`, 25 pour
`e2e`, 30 pour la régénération des baselines). Sans limite explicite, GitHub laisse tourner
un job **six heures** : c'est ce qui est arrivé le 19/08/2026 à trois jobs gelés sur un
téléchargement apt, qui affichaient « pending » tout du long sans jamais signaler qu'il
fallait relancer. Une étape bloquée doit échouer vite et bruyamment. Si la suite s'approche
un jour de sa borne, la découper — pas relever le nombre.
