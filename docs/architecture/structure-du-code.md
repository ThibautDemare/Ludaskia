[← Architecture Ludaskia](../ARCHITECTURE.md)

# Structure des sources (`src/`)

On sépare la **logique pure** (testable sans DOM) du **rendu/interactions DOM**.
Les dépendances entre fichiers sont **explicites** (`import`/`export`) : l'ordre
de chargement est géré par le bundler, pas par l'ordre des `<script>`.

```
src/
  main.ts        # entrée de l'APPLICATION (chargée par app.html)
  vitrine.ts     # entrée de la VITRINE publique (chargée par index.html, #271)
  core/          # logique pure (aucun accès DOM au chargement)
  ui/            # rendu et interactions DOM
  data/          # contenus statiques par matière (ex. francais/conjugaison.ts)
  styles/        # *.scss (importés depuis main.ts)
  fonts/         # nunito-variable.woff2 (police embarquée)
```

Le détail de chaque dossier vit dans son propre fichier :

- **`src/data/`** → [Contenu & leçons](contenu-et-lecons.md)
- **`src/core/`** → [Logique pure (`core/`)](core.md)
- **`src/ui/`** → [Rendu & interactions (`ui/`)](ui.md)

## `src/main.ts` (entrée de l'application)

Importe les feuilles SCSS, puis initialise **dans cet ordre** :

1. `setOnDataWrite(touchActiveProfile)` (hook de bump `updatedAt`),
2. `initProfiles()`,
3. `applyPreferences()` (thème `data-theme` + classes a11y),
4. `initTts()` (synthèse vocale),
5. `initVersionCheck()` (auto-actualisation),
6. câblage du DOM + `route()` initiale — exécuté immédiatement si le DOM est
   prêt, sinon sur `DOMContentLoaded` (les modules sont différés).

Le câblage DOM (`wireDOM`) pose ensuite — dans cet ordre — `paintStaticIcons`,
`installVisiblePasswordReveal`, `installGroupedNumberEcho`, `initEggs`, `fillFooterYear`,
`initFooterCookie`, et **`initSession()`** (écouteurs délégués de saisie / navigation
clavier / impression de `session.ts`, sans effet de bord à l'import), puis les listeners
sur les boutons fixes de la barre.

Le projet a **deux pages** (#271) : **`app.html`** charge l'application
(`<script type="module" src="/src/main.ts">`) ; **`index.html`** est la **vitrine**
publique et charge `<script type="module" src="/src/vitrine.ts">`.

## État de module partagé (accesseurs)

En modules ES, on ne peut pas réassigner une variable d'un autre module. Les
états globaux mutables d'autrefois sont donc exposés via des paires
accesseur/mutateur, **comportement identique** :

- `items.ts` : `get/setInputCounter` (+ `nextInputId`), `get/setSessionItems`,
  `get/setRenderLesson`, `get/setPrintMode` (#289 : rendu papier des QCM en cases à
  cocher, posé/retiré autour de `buildPrintableDOM`), `get/setCorrigeMode` (#41 :
  sous-mode qui révèle les réponses pour le corrigé imprimable) ;
- `chrono.ts` : `get/setTimer` (le handle d'intervalle est réutilisé par le sprint) ;
- `navigation.ts` : `get/set` pour `currentMode`, `currentLessonId`,
  `sessionRecorded`, `lastErrors`, `pendingRevision`.
