# Architecture — Ludaskia

> Document **« état courant »** : il décrit l'architecture telle qu'elle est
> aujourd'hui, et se met à jour **sur place** à chaque évolution. L'historique
> des décisions vit dans les commits, les PR et les issues — pas ici.

## Vue d'ensemble
Mini-application web d'entraînement au **calcul mental** (niveau CE2) : génération
de calculs aléatoires, correction instantanée, chronomètre, et une couche de
gamification (records, médailles, trophées, objectifs) avec gestion de profils.
100 % **côté client** (aucun serveur) ; la progression est stockée en
`localStorage`.

## Stack & outillage
- **TypeScript** (`strict`) en **modules ES**, bundlé par **Vite**.
- Styles en **SCSS** (compilés par Vite).
- Tests : **Vitest** (environnement `happy-dom`).
- Qualité : **ESLint** (flat config + `typescript-eslint`) et **Prettier**.
- Déploiement : **GitHub Pages** via GitHub Actions (build Vite → `dist/`).

### Commandes
| Commande | Rôle |
|----------|------|
| `npm install` | installer les dépendances |
| `npm run dev` | serveur de dev + HMR |
| `npm run build` | build de production → `dist/` |
| `npm test` | tests Vitest |
| `npm run typecheck` | `tsc --noEmit` (strict) |
| `npm run lint` | ESLint |
| `npm run format` / `format:check` | Prettier |

La CI (`.github/workflows/ci.yml`, job `test`) enchaîne `format:check → lint →
typecheck → test` sur chaque PR et push `main`.

## Structure des sources (`src/`)
On sépare la **logique pure** (testable sans DOM) du **rendu/interactions DOM**.
Les dépendances entre fichiers sont **explicites** (`import`/`export`) : l'ordre
de chargement est géré par le bundler, pas par l'ordre des `<script>`.

```
src/
  main.ts        # point d'entrée : styles + bootstrap ordonné + câblage DOM
  core/          # logique pure (aucun accès DOM au chargement)
  ui/            # rendu et interactions DOM
  styles/        # *.scss (importés depuis main.ts)
```

### `src/core/`
- **`utils.ts`** — aléatoire (`rnd`, `choice`, `sample`), déduplication
  (`uniqueComm/Exact`, `commKey`), `escapeHTML`, `fmt` (mm:ss).
- **`storage.ts`** — `lsGet/lsSet` (clés préfixées par profil), accès bruts
  (`lsKeysRaw/lsRemoveRaw/lsSetRaw`, `appKeys`), `setActivePrefix`, constante
  `PROFILES_KEY`, et `setOnDataWrite(fn)` (hook appelé après chaque écriture de
  donnée de profil — branché depuis `main.ts`).
- **`profiles.ts`** — profils (UUID, préfixe, `updatedAt`), `initProfiles`,
  export/import. ⚠️ Plus d'effet de bord au chargement : `initProfiles()` et le
  branchement du hook sont appelés par `main.ts`.
- **`items.ts`** — fabriques d'items `{text, answer}` (`add/sub/mul/dbl/half/
  comp/facteur`), `renderItem`, `gridHTML`, `ficheHTML`, `lessonAttr()` (tag
  `data-lesson`). État de module exposé via accesseurs (voir plus bas).
- **`lessons.ts`** — `LESSONS` (15 leçons constructibles isolément),
  `buildFiches`, `THEMES`, `bilanQ`/`bilanHTML` (bilan express), `coverHTML`,
  `fichesPagesHTML`, `buildPrintableDOM`.
- **`progress.ts`** — records de bilans (`recordRun`, `cmpRun` « score puis
  temps »), série (`updateStreak`, `streakSuffix`), étoiles
  (`recordLessonResult`, `starsEarned`), stats par leçon (`recordLessonStats`,
  `lessonAvgPct`), périodes calendaires (`startOfWeek/Month`, `countSince`).
- **`rewards.ts`** — défi du jour contextuel (`CHALLENGES`, `getGoal`,
  `updateGoal`) et trophées (`TROPHIES`, `tiers()`, `evaluateTrophies`,
  `gSnapshot`).

### `src/ui/`
- **`chrono.ts`** — chronomètre croissant de la barre (sessions).
- **`effects.ts`** — `sparkline` (SVG), `confetti`, modale `showCelebration`.
- **`render.ts`** — rendus accueil/sélecteur/profils (`renderHomeStats`,
  `renderObjectives`, `renderGoal`, `renderTrophies`, `renderLessons`,
  `renderToolbarProfile`, `renderProfileMenu`, `renderProfiles`,
  `boardHTML`/`sprintBoardHTML`, `pctColor`, config `REGULARITY`).
- **`navigation.ts`** — routing par hash (`route`), vues (`showHomeView`,
  `showLessonsView`, `showProfilesView`, `runComplet/Express/Lecon/Revision`),
  `setToolbar`, `afterStart`, état de session.
- **`sprint.ts`** — mode sprint 5 min (compte à rebours, questions une par une).
- **`session.ts`** — `verify` (correction + enregistrement), saisie clavier,
  impression (`beforeprint`/`afterprint`).
- **`menu.ts`** — liste déroulante de profils (`open/close/toggleProfileMenu`),
  extrait pour éviter un cycle `main ↔ navigation`.

### `src/main.ts` (entrée)
Importe les 10 feuilles SCSS, puis initialise **dans cet ordre** :
1. `setOnDataWrite(touchActiveProfile)` (hook de bump `updatedAt`),
2. `initProfiles()`,
3. câblage du DOM + `route()` initiale — exécuté immédiatement si le DOM est
   prêt, sinon sur `DOMContentLoaded` (les modules sont différés).

`index.html` ne charge qu'**une seule** entrée : `<script type="module"
src="/src/main.ts">`.

### État de module partagé (accesseurs)
En modules ES, on ne peut pas réassigner une variable d'un autre module. Les
états globaux mutables d'autrefois sont donc exposés via des paires
accesseur/mutateur, **comportement identique** :
- `items.ts` : `get/setInputCounter` (+ `nextInputId`), `get/setSessionItems`,
  `get/setRenderLesson` ;
- `chrono.ts` : `get/setTimer` (le handle d'intervalle est réutilisé par le sprint) ;
- `navigation.ts` : `get/set` pour `currentMode`, `currentLessonNum`,
  `sessionRecorded`, `lastErrors`, `pendingRevision`.

## Modes & navigation
Vues routées **par hash** (le Précédent/Suivant du navigateur fonctionne, et un
hébergement statique sous sous-chemin `/Ludaskia/` ne nécessite aucune config de
fallback SPA) : `#accueil` · `#lecons` · `#profils` · `#complet` · `#express` ·
`#lecon-<n>` · `#sprint` · `#revision`. Les déclencheurs changent juste le hash ;
`route()` (sur `hashchange`) rend la vue.

Modes d'exercice : **bilan complet** (15 fiches), **bilan express** (3 calculs ×
15 leçons), **une leçon à la fois**, **sprint 5 min**, **révision** (rejoue les
erreurs, n'enregistre rien).

## Données (`localStorage`)
Tout passe par `lsGet/lsSet`. Les clés sont **préfixées par le profil actif**
(`<uuid>/ludaskia_…`) sauf la méta globale `ludaskia_profiles`. Clés par profil :
`ludaskia_runs_{complet,express,sprint}`, `ludaskia_streak`, `ludaskia_stars`,
`ludaskia_lessonStats`, `ludaskia_goal`, `ludaskia_goalsDone`,
`ludaskia_trophies`.

## Profils
- Chaque profil a un **UUID stable** (id inter-appareils) et un **`updatedAt`**
  (ms) bumpé à chaque écriture via le hook `onDataWrite`.
- Sélecteur = **liste déroulante dans la barre d'outils** (bascule rapide +
  « Gérer »). Écran `#profils` : créer / renommer / avatar / réinitialiser /
  supprimer (jamais le dernier).
- **Export/import par profil** (`exportProfiles`/`importProfiles`) : fusion par
  **UUID**, écrase un profil existant **seulement si la sauvegarde est plus
  récente** (`updatedAt`), ajoute si l'UUID est inconnu.
- Pas de migration de données prévue (on part de profils vierges).

## Gamification (pédagogie : régularité espacée, pas de pression quotidienne)
- **Médailles** = podiums des classements (🥇🥈🥉). **Trophées** = collection de
  succès cumulatifs.
- **Objectifs de régularité** (panneau d'accueil, périodes calendaires) :
  3 sprints/semaine, 2 bilans express/mois, 1 bilan complet/mois.
- **Défi du jour** contextuel et « qualité » : jamais un défi impossible
  (remédiation seulement s'il existe une leçon < 70 % ; « bats ton record »
  seulement s'il y a un record).
- **Série de jours** calculée en coulisse, uniquement pour les trophées 3/7 jours
  (one-shot, jamais reperdus) ; pas d'affichage anxiogène.
- Trophées à paliers via `tiers(prefix, icon, metric, levels)` ; un trophée se
  déclare par `{metric, n}` (compilé en test `g[metric] >= n`) ou un `test`
  explicite. `gSnapshot()` fournit les métriques.
- **Règle des 60 %** : un bilan/leçon ne « compte » (temps, record, étoile,
  objectif, trophée) que si ≥ 60 % des calculs ont une réponse. Le sprint compte
  s'il va au bout des 5 minutes.
- Une récompense déclenche une **modale + confettis** (jamais de confettis sans
  explication).

## Tests
`tests/logic.test.ts` (Vitest) importe directement les modules de `src/core/` (et
quelques-uns de `src/ui/`) et couvre la **logique pure** (génération, persistance,
récompenses, profils), pas le rendu DOM. L'environnement DOM/`localStorage` est
fourni par `happy-dom`.

L'état des modules ES étant un singleton, un `beforeEach` reproduit la fraîcheur
de l'ancien runner : `localStorage.clear()`, rebranchement du hook
(`setOnDataWrite`), remise à zéro de l'état du module `items`, puis
`initProfiles()`. **Lancer `npm test` après toute modif de logique.**

## Build & déploiement
- `vite.config.ts` fixe `base: '/Ludaskia/'` (site « projet » servi sous
  sous-chemin) et `build.outDir: 'dist'`.
- `npm run build` produit un bundle minifié/hashé dans `dist/`.
- `.github/workflows/pages.yml` : `npm ci` → `npm run build` → publication de
  `dist/` sur GitHub Pages à chaque push `main`.

## Piste d'évolution (réflexion, non implémentée)
Étendre à d'autres **niveaux** et **matières**, en gardant le format « question
courte → réponse vérifiable ». Bon filtre : **automatisme/mémorisation**.
Candidats : conjugaison, maths étendus (conversions d'unités, CP→collège), verbes
irréguliers anglais ; puis orthographe et mémorisation (capitales/dates) via un
**mode QCM**. Généralisations moteur nécessaires : réponses **texte normalisées**
(+ variantes), **mode QCM**, hiérarchie **matière → niveau → leçons**
(aujourd'hui `LESSONS` est plat), générateurs par compétence. Profils, sprint,
trophées, objectifs et stats sont **agnostiques de la matière** et se réutilisent
tels quels.
