[← Architecture Ludaskia](../ARCHITECTURE.md)

# Build & déploiement

- `vite.config.ts` fixe `base: '/Ludaskia/'` (site « projet » servi sous
  sous-chemin) et `build.outDir: 'dist'`.
- `npm run build` produit un bundle minifié/hashé dans `dist/`, à partir de **trois
  entrées HTML** (`rollupOptions.input`) : `index.html` (vitrine publique, #271),
  `app.html` (application) et `guide.html` (guide utilisateur pour les parents, #562).
- `.github/workflows/pages.yml` : `npm ci` → `npm run build` → publication de
  `dist/` sur GitHub Pages **quand une release GitHub est publiée**
  (`on: release: published`) ; `workflow_dispatch` en filet manuel. Merger une PR
  sur `main` **ne déploie plus** : `main` est la ligne d'intégration (on y
  consolide plusieurs PR), la mise en prod est une **release délibérée**. Tag
  calendaire `vAAAA.MM.JJ` (suffixe `.2`, `.3`… si plusieurs le même jour),
  publiée via l'agent `gestionnaire-github`. Le `GITHUB_SHA` de l'événement
  release pointe sur le commit du tag → l'estampille SHA reste correcte.
- **Estampille de version** : `vite.config.ts` calcule une `buildVersion` (SHA
  court du commit via `GITHUB_SHA` en CI, sinon horodatage local) et l'injecte
  dans l'app (`define: __APP_VERSION__`) — affichage, diagnostic et anti-boucle
  de l'auto-actualisation ci-dessous. Depuis #306, ce n'est **plus** le
  déclencheur de la mise à jour (cf. Hors-ligne ci-dessous) : le `dist/version.json`
  publié et le plugin qui l'émettait ont disparu avec l'ancien sondage.

## Hors-ligne (service worker, #306)

Le worker est **écrit à la main** (`src/sw.ts`), en mode **`injectManifest`** de
`vite-plugin-pwa` plutôt qu'une recette Workbox standard (`generateSW`) : Vite
n'y injecte que `self.__WB_MANIFEST`, la liste versionnée des fichiers du build ;
tout le reste (précache sélectif, réchauffement de fond, récupération à la
demande, pas de bascule automatique) est écrit à la main. Le worker tourne dans
un contexte **worker**, aux globales incompatibles avec celles du DOM : un
second projet TypeScript, `tsconfig.sw.json` (n'inclut que `src/sw.ts` et
`core/pwa-cache.ts`), est lancé **en plus** du principal par `npm run typecheck`.

- **Précache en deux temps.** À l'INSTALLATION, seule la **coquille** de l'app
  (les trois pages, le bundle, la CSS, la police, les images) est mise en cache
  — les 26 shards de verbes (~850 Ko, chargés en `import()` paresseux) en sont
  exclus, pour ne pas alourdir la première visite d'un contenu pas encore
  utile. Le reste est **réchauffé** plus tard, en fond, par petites tranches
  (`ui/pwa.ts`, cf. [Rendu & interactions](ui.md)) tant que l'application est
  calme et que quelqu'un s'en sert vraiment (`core/engagement.ts`, cf. [Logique
  pure](core.md)). Une ressource pas encore en cache reste servie **à la
  demande** (réseau, puis rangée) : un enfant qui explore le catalogue complète
  son cache sans y penser.
- **Arithmétique pure dans `core/pwa-cache.ts`** (cf. [Logique
  pure](core.md)) : clé de cache (URL + révision Workbox pour les fichiers à
  nom stable), partition immédiat/différé, entrées manquantes, entrées
  **obsolètes** (purgées à l'activation — seul mécanisme de bornage du cache,
  volontairement sans durée de vie). Aucune API navigateur : testable sans
  service worker, et importée **telle quelle** par `src/sw.ts`.
- **Jamais de `skipWaiting()` automatique** : une nouvelle version installée
  reste EN ATTENTE, et c'est l'app qui décide du moment de la bascule (cf.
  Auto-actualisation ci-dessous) — recharger sous les doigts d'un enfant en
  plein exercice serait exactement ce que la logique de politesse existante
  évite depuis toujours.
- **Désactivé sous le serveur de dev** (`devOptions.enabled`, piloté par la
  variable d'environnement `LUDASKIA_PWA_DEV=1`) : un SW enregistré y servirait
  d'un test Playwright à l'autre les assets mis en cache par le précédent,
  produisant des échecs différés et incompréhensibles. Il est toujours produit
  en `vite build`. En conséquence, `playwright.config.ts` démarre **deux
  serveurs** : le serveur de dev habituel (sans SW), et le **build de
  production servi par `vite preview`** (port 4174, export `PROD_URL`), seul
  visé par la spec hors-ligne (`e2e/offline.spec.ts`) qui a besoin d'un vrai
  worker.
- **Manifeste web + icônes** : `manifest` de `VitePWA` (nom, couleurs,
  `start_url: 'app.html'` — l'installation ouvre l'application, pas la
  vitrine). Icônes (`pwa-192.png`, `pwa-512.png`, `pwa-maskable-512.png`)
  générées dans `public/` par `npm run pwa:icons`
  (`tools/pwa-icons/generate.mjs`) : même parti pris que la bannière Open
  Graph — composées en HTML aux vraies couleurs/logo de l'app puis rasterisées
  via Chromium (Playwright), plutôt qu'un PNG dessiné à la main qui se
  désynchroniserait du logo. À régénérer après un changement de logo ou de
  couleur d'accent.
- **Dictée et voix hors ligne** : `ui/tts.ts:dicteeDisponible()` exige
  désormais une voix française **locale** dès que `navigator.onLine === false`
  — une voix « distante » (`localService === false`) ne produit aucun son sans
  réseau. Un appareil dont la seule voix française est distante voit donc la
  dictée se désactiver hors ligne plutôt que rester proposée et muette
  (`raisonSansVoix()` distingue les deux causes pour le message affiché à
  l'adulte).
- Le **rappel de sauvegarde** de l'accueil (proposer d'installer et
  d'exporter) est un mécanisme distinct, décrit dans [Logique
  pure](core.md) et [Données & profils](donnees-et-profils.md).

## Auto-actualisation (onglet toujours à jour)

Pensé pour un enfant qui garde l'onglet ouvert et ne pense pas à rafraîchir après
un déploiement. Logique **pure** dans `core/version.ts` (`APP_VERSION`,
`canReloadNow` + seuils), observation partagée dans `ui/app-calme.ts` (cf.
[Rendu & interactions](ui.md)), orchestration dans `ui/mise-a-jour.ts`
(`signalerVersionEnAttente`, appelé par `ui/pwa.ts`).

- **Détection** : depuis #306, c'est le **service worker** qui le dit, et non
  plus un sondage. Une nouvelle version installée reste « en attente » — événement
  `waiting` de `workbox-window`, relayé par `onNeedRefresh` dans `ui/pwa.ts` —
  et `ui/pwa.ts` revérifie aussi périodiquement (`registration.update()`) et au
  retour sur l'onglet, pour qu'un onglet resté ouvert longtemps découvre un
  déploiement. (Avant #306, un sondage périodique de `version.json` comparait
  la version publiée à `APP_VERSION` ; le fichier et son sondage ont disparu
  avec ce mécanisme — cf. Hors-ligne ci-dessus.)
- **Rechargement à un moment SÛR uniquement** (`canReloadNow`) : sur un **écran
  calme** (un conteneur « menu » visible — accueil, navigation, profils…), **hors
  exercice**, **jamais** pendant sprint/révision (perte de progression), après un
  court **délai d'inactivité** (`minIdleMs`) et un instant après le retour sur
  l'onglet (`minVisibleMs`). Sinon on **reporte** au prochain moment calme.
- **Anti-boucle** : la version cible est notée en `sessionStorage`
  (`ludaskia_update_reloaded`) **avant** le reload → on ne recharge qu'**une fois
  par version** dans l'onglet (garde-fou si un cache CDN ressert un `index.html`
  périmé). **Filet complémentaire** : si la bascule (`skipWaiting` puis
  `controllerchange`) n'aboutit pas (worker tué, message perdu),
  `ui/pwa.ts` recharge quand même après un court délai — mieux vaut une page
  rechargée pour rien qu'un voile qui ne se lève jamais.
- **Rendu** : juste avant le reload, un **voile** (`.update-overlay`,
  `styles/version-update.scss`) porté par la **mascotte** masque le flash blanc
  et donne un repère de continuité ; le message est **lu en TTS** (best-effort, en
  appui du texte). Respecte `prefers-reduced-motion` / `anim-reduced`. Avis UX
  enfant + troubles/attention intégrés (message concret « je me mets à jour », pas
  de « version », pas de bouton, ton « bonne nouvelle »).
