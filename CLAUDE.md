# CLAUDE.md — Ludaskia

## Présentation
Mini-application web d'entraînement au **calcul mental** (niveau CE2), en
**HTML/CSS/JS vanilla**, **sans build ni dépendance**. Elle génère des calculs
aléatoires, corrige instantanément, chronomètre, et propose une couche de
gamification (records, médailles, trophées, objectifs) avec gestion de profils.

L'app doit fonctionner **en ouverture locale `file://`** (double-clic) ET servie
en HTTP (GitHub Pages). Cette contrainte explique deux choix structurants :
- **scripts classiques** (pas de modules ES, bloqués en `file://`) ;
- **routing par hash** (pas de `history.pushState`, problématique en `file://`).

## Lancer
- Ouvrir `index.html` (double-clic ou serveur statique).
- Tests : `node tests/run.js` (aucune dépendance ; code de sortie 1 si échec).

## Architecture
Fichiers en **UTF-8** (emojis). Pas d'outillage : on édite, on recharge.

### CSS (`css/`, chargés dans cet ordre via `<link>`)
`base` (variables + reset) · `toolbar` · `home` · `sheets` (feuilles d'exos +
bandeau de résultat) · `gamification` (objectifs, classements, trophées) ·
`lessons` · `profiles` · `sprint` · `modal` · `print`.
Variables clés dans `base.css` : `--blue`, `--ui` (police d'interface
`system-ui`, distincte du serif Georgia des feuilles), `--muted`, palette
`--warn`, `--ok`, `--ko`.

### JS (`js/`, scripts classiques chargés DANS CET ORDRE)
L'ordre compte : les fichiers partagent la **portée globale** (les `const`/`let`
de premier niveau sont visibles entre scripts ; les références croisées ne sont
résolues qu'à l'exécution, pas au chargement).

1. `utils.js` — aléatoire (`rnd`, `choice`, `sample`), déduplication
   (`uniqueComm/Exact`, `commKey`), `escapeHTML`, `fmt` (mm:ss).
2. `storage.js` — `lsGet/lsSet` (préfixés par profil), accès bruts
   (`lsKeysRaw/lsRemoveRaw/lsSetRaw`, `appKeys`), `setActivePrefix`,
   hook `onDataWrite`, constante `PROFILES_KEY`.
3. `profiles.js` — profils (UUID, préfixe, `updatedAt`), export/import.
   `initProfiles()` s'exécute au chargement.
4. `chrono.js` — chronomètre croissant de la barre (sessions).
5. `items.js` — fabriques d'items `{text, answer}` (`add/sub/mul/dbl/half/
   comp/facteur`), `renderItem`, `gridHTML`, `ficheHTML` ; `sessionItems`
   (id de champ → item, pour la révision) ; `renderLesson` + `lessonAttr()`
   (tag `data-lesson`).
6. `lessons.js` — `LESSONS` (15 leçons constructibles isolément), `buildFiches`,
   `THEMES`, `bilanQ`/`bilanHTML` (bilan express), `coverHTML`,
   `fichesPagesHTML`, `buildPrintableDOM`.
7. `progress.js` — persistance + règles : records de bilans (`recordRun`,
   `cmpRun` « score puis temps »), série (`updateStreak`, `streakSuffix`, `max`),
   étoiles (`recordLessonResult`, `starsEarned`), stats par leçon
   (`recordLessonStats`, `lessonAvgPct`), périodes calendaires
   (`startOfWeek/Month`, `countSince`).
8. `rewards.js` — défi du jour contextuel (`CHALLENGES`, `getGoal`, `updateGoal`)
   et trophées (`TROPHIES`, helper `tiers()`, `evaluateTrophies`, `gSnapshot`).
9. `effects.js` — `sparkline` (SVG), `confetti`, modale `showCelebration`.
10. `render.js` — rendus accueil/sélecteur/profils (`renderHomeStats`,
    `renderObjectives`, `renderGoal`, `renderTrophies`, `renderLessons`,
    `renderToolbarProfile`, `renderProfileMenu`, `renderProfiles`,
    `boardHTML`/`sprintBoardHTML`, `pctColor`, config `REGULARITY`).
11. `navigation.js` — routing par hash (`route`), vues (`showHomeView`,
    `showLessonsView`, `showProfilesView`, `runComplet/Express/Lecon/Revision`),
    `setToolbar`, `afterStart`, état (`currentMode`, `lastErrors`…).
12. `sprint.js` — mode sprint 5 min (compte à rebours, questions une par une).
13. `session.js` — `verify` (correction + enregistrement), saisie clavier,
    impression (`beforeprint`/`afterprint`).
14. `main.js` — câblage `DOMContentLoaded` + menu déroulant de profils +
    `downloadJSON`.

## Modes & navigation
Vues routées par hash (Précédent/Suivant du navigateur fonctionnent) :
`#accueil` · `#lecons` · `#profils` · `#complet` · `#express` · `#lecon-<n>` ·
`#sprint` · `#revision`. Les déclencheurs changent juste le hash ; `route()`
(sur `hashchange`) rend la vue.
Modes d'exercice : **bilan complet** (15 fiches), **bilan express** (3 calculs ×
15 leçons), **une leçon à la fois**, **sprint 5 min**, **révision** (rejoue les
erreurs, n'enregistre rien).

## Données (localStorage)
Tout passe par `lsGet/lsSet`. Les clés sont **préfixées par le profil actif**
(`<uuid>/ludaskia_…`) sauf la méta globale `ludaskia_profiles`.
Clés par profil : `ludaskia_runs_{complet,express,sprint}`, `ludaskia_streak`,
`ludaskia_stars`, `ludaskia_lessonStats`, `ludaskia_goal`, `ludaskia_goalsDone`,
`ludaskia_trophies`.

## Profils
- Chaque profil a un **UUID stable** (id inter-appareils) et un **`updatedAt`**
  (ms) bumpé à chaque écriture de données via le hook `onDataWrite`.
- Sélecteur = **liste déroulante dans la barre d'outils** (bascule rapide +
  « Gérer »). Écran `#profils` : créer / renommer / avatar / réinitialiser /
  supprimer (jamais le dernier).
- **Export/import par profil** (`exportProfiles`/`importProfiles`) : fusion par
  **UUID**, écrase un profil existant **seulement si la sauvegarde est plus
  récente** (`updatedAt`), ajoute si l'UUID est inconnu.
- Pas de migration de données prévue (on part de profils vierges).

## Gamification (pédagogie : régularité espacée, pas de pression quotidienne)
- **Médailles** = podiums des classements (🥇🥈🥉). **Trophées** = collection de
  succès cumulatifs (anciennement « badges »).
- **Objectifs de régularité** (panneau d'accueil, périodes calendaires) :
  3 sprints/semaine, 2 bilans express/mois, 1 bilan complet/mois.
- **Défi du jour** contextuel et « qualité » : ne propose jamais un défi
  impossible (remédiation seulement s'il existe une leçon < 70 % ; « bats ton
  record » seulement s'il y a un record).
- **Série de jours** calculée en coulisse, uniquement pour les trophées 3/7 jours
  (one-shot, jamais reperdus) ; pas d'affichage anxiogène.
- Trophées à paliers via `tiers(prefix, icon, metric, levels)` ; un trophée se
  déclare par `{metric, n}` (compilé en test `g[metric] >= n`) ou un `test`
  explicite. `gSnapshot()` fournit les métriques.
- **Règle des 60 %** : un bilan/leçon ne « compte » (temps, record, étoile,
  objectif, trophée) que si ≥ 60 % des calculs ont une réponse. Le sprint, lui,
  compte s'il va au bout des 5 minutes.
- Une récompense (record, étoile, trophée, défi) déclenche une **modale +
  confettis** (les confettis ne se déclenchent jamais sans explication).

## Tests (`tests/run.js`)
- Sans dépendance : concatène les `js/` dans un contexte `vm` avec des stubs
  `document`/`window`/`localStorage`, expose les symboles via `globalThis.__api`.
- Couvre la **logique pure** (génération, persistance, récompenses, profils),
  pas le rendu DOM.
- Ajouter un symbole testable : compléter la liste `API` en tête du fichier.
- Ajouter un cas : `test('nom', () => { const {api}=freshEnv(); ... })` avec
  `eq(a,b)` / `ok(cond)`. `freshEnv()` repart d'un `localStorage` vierge.
- **Lancer les tests après toute modif de logique.**

## Conventions
- **Vanilla, zéro dépendance, zéro build.** Ne pas introduire de bundler/modules
  ES sans réévaluer la contrainte `file://`.
- **UI et commentaires en français.**
- Toujours passer par `lsGet/lsSet` pour le stockage (jamais `localStorage`
  directement, sauf accès bruts dédiés dans `storage.js`).
- **Commits : ne pas ajouter d'attribution Claude / `Co-Authored-By` / « Generated
  with Claude Code ».**

## Piste d'évolution (réflexion en cours, non implémentée)
Étendre à d'autres **niveaux** et **matières**, en gardant le format « question
courte → réponse vérifiable ». Bon filtre : **automatisme/mémorisation** (pas la
compréhension ni la production). Candidats forts : conjugaison (français),
maths étendus (conversions d'unités, niveaux CP→collège), verbes irréguliers
anglais ; puis orthographe (homophones) et mémorisation (capitales/dates) via un
**mode QCM**. Généralisations moteur nécessaires : réponses **texte normalisées**
(+ variantes acceptées), **mode QCM**, hiérarchie **matière → niveau → leçons**
(aujourd'hui `LESSONS` est plat), générateurs par compétence (à règles ou pilotés
par des listes de données). Profils, sprint, trophées, objectifs et stats sont
**agnostiques de la matière** et se réutilisent tels quels.