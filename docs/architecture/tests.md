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

### Gate statique du journal d'erreurs (#580)

`tests/erreurs-journal-gate.test.ts` fait respecter la règle « pas de correction sans
sa capture » (#391) au lieu de la laisser à la mémoire de qui écrit le code. Il lit les
fichiers de `src/ui` comme du **texte** (pas de DOM, pas de rendu — quelques
millisecondes) et exige que chaque module correctif importe `capterErreur` : tous les
`src/ui/lecon-*.ts`, plus `session.ts`, `sprint.ts`, `revision.ts`, `ortho-runner.ts`
et `revelation-neutre.ts`. Les exceptions sont **écrites dans le test avec leur
raison** (`lecon-du-jour.ts` et `lecon-runner-shared.ts` ne corrigent rien ;
`lecon-passer.ts` journalise par délégation à `revelation-neutre.ts`, ce qu'un test
dédié vérifie), et le test rejette une exception devenue caduque — un module exempté
qui se met à capturer doit sortir de la liste.

Un dernier test croise la convention de nommage avec l'**aiguillage réel** : chaque
`runLeconXxx` appelé dans `navigation.ts` doit venir d'un module du périmètre. Un
runner branché sous un nom hors convention échoue au lieu de passer inaperçu.

**Ce que ce gate ne prouve pas** : que l'appel est au bon endroit, avec un énoncé
lisible et un `lessonId` (sans l'un des deux, `capterErreur` ignore l'entrée en
silence), ni qu'il couvre **tous les modes** d'un type. C'est l'objet de la table de
couverture (#581).

## Smoke tests e2e (Playwright)

**Smoke tests e2e (`e2e/`, Playwright, #129).** Complémentaires : ils pilotent
l'app dans un navigateur (profil mobile Chromium) pour couvrir ce que la logique
pure ne voit pas — navigation par hash, rendu d'un exercice, écran d'une
catégorie vide, démarrage du sprint, **absence d'erreur de rendu**
(`watchErrors`). Restent **ciblés et stables** : on teste le contenu présent sur
`main`, pas une leçon en cours de PR. `vitest` est restreint à `tests/` pour ne
pas ramasser les specs Playwright. Détails : `e2e/README.md`.

**Deux serveurs webServer** (`playwright.config.ts`, #306) : le serveur de dev
habituel (`npm run dev`, port 4173), et un second qui sert le **build de
production** via `npm run build && npm run preview` (port 4174, export
`PROD_URL`). Le service worker est volontairement **désactivé** sous le serveur
de dev — enregistré, il servirait d'un test à l'autre les assets mis en cache
par le précédent, avec des échecs différés et incompréhensibles. Seule
`e2e/offline.spec.ts` cible le second serveur, où elle exerce le **vrai**
précache du build plutôt qu'une approximation.

À part, `a11y-axe.spec.ts` fait tourner un **scan axe-core** (WCAG A/AA) sur un
échantillon de vues plutôt que des assertions de rendu ciblées — signal
automatisé, **non bloquant** par défaut, complémentaire du jugement de l'agent
`relecteur-accessibilite`. Détails : `e2e/README.md`.

Autre famille, `galerie.spec.ts` (#412) compare le rendu du catalogue à des
**baselines de screenshots** (`toHaveScreenshot`) via la route **DEV-only**
`#galerie` (`src/ui/galerie.ts`, gardée par `import.meta.env.DEV` — absente du
bundle de production) qui affiche, groupée par catégorie, la fiche de chaque
leçon sous `withSeed`, **puis un exemplaire de chaque écran de runner
interactif** (#419 : tuiles, ordre, tri, appariement, problème, tableau de
conversion). Ces boards sont rendus par le **même code que le runner live** —
les widgets partagés (`ui/tuile-interaction.ts`, `ui/appariement.ts`) et deux
fonctions de rendu **pures** extraites des runners pour être réutilisées
(`renderProblemeBoardHTML` de `ui/lecon-probleme.ts`, `renderTableauBoardHTML`
de `ui/lecon-tableau.ts`) — de sorte qu'un snapshot détecte les régressions du
**vrai** rendu ; la galerie n'appelle **jamais** les entrées `runLeconXxx` (qui
portent les effets de bord : toolbar, aide, storage, listener `document` du
tableau). Chaque section porte un `data-gallery` → une **capture dédiée** (une
nouvelle section est donc snapshotée automatiquement). Les baselines sont
**ancrées sur l'environnement de la CI** (ubuntu + Chromium) — comparaison
ignorée hors Linux — et se régénèrent via le workflow
`.github/workflows/update-snapshots.yml`. Détails et procédure : `e2e/README.md`.
