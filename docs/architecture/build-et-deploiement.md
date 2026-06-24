[← Architecture Ludaskia](../ARCHITECTURE.md)

# Build & déploiement

- `vite.config.ts` fixe `base: '/Ludaskia/'` (site « projet » servi sous
  sous-chemin) et `build.outDir: 'dist'`.
- `npm run build` produit un bundle minifié/hashé dans `dist/`, à partir de **deux
  entrées HTML** (`rollupOptions.input`, #271) : `index.html` (vitrine publique) et
  `app.html` (application).
- `.github/workflows/pages.yml` : `npm ci` → `npm run build` → publication de
  `dist/` sur GitHub Pages **quand une release GitHub est publiée**
  (`on: release: published`) ; `workflow_dispatch` en filet manuel. Merger une PR
  sur `main` **ne déploie plus** : `main` est la ligne d'intégration (on y
  consolide plusieurs PR), la mise en prod est une **release délibérée**. Tag
  calendaire `vAAAA.MM.JJ` (suffixe `.2`, `.3`… si plusieurs le même jour),
  publiée via l'agent `gestionnaire-github`. Le `GITHUB_SHA` de l'événement
  release pointe sur le commit du tag → l'estampille SHA reste correcte.
- **Estampille de version** : `vite.config.ts` calcule une `buildVersion` (SHA
  court du commit via `GITHUB_SHA` en CI, sinon horodatage local), l'injecte dans
  l'app (`define: __APP_VERSION__`) **et** émet un `dist/version.json`
  (`{ "version": … }`) via un petit plugin. C'est le socle de l'auto-actualisation.

## Auto-actualisation (onglet toujours à jour)

Pensé pour un enfant qui garde l'onglet ouvert et ne pense pas à rafraîchir après
un déploiement. Logique **pure** dans `core/version.ts` (`APP_VERSION`,
`isNewerVersion`, `canReloadNow` + seuils), orchestration DOM/réseau dans
`ui/version-check.ts` (`initVersionCheck`, branché depuis `main.ts`).

- **Détection** : on interroge `version.json` (sans cache, anti-cache `?t=`) au
  **retour sur l'onglet** (`visibilitychange` → visible) et par **sondage
  périodique** (5 min), débridé anti-rafale. Version distante ≠ `APP_VERSION` →
  mise à jour en attente.
- **Rechargement à un moment SÛR uniquement** (`canReloadNow`) : sur un **écran
  calme** (un conteneur « menu » visible — accueil, navigation, profils…), **hors
  exercice**, **jamais** pendant sprint/révision (perte de progression), après un
  court **délai d'inactivité** (`minIdleMs`) et un instant après le retour sur
  l'onglet (`minVisibleMs`). Sinon on **reporte** au prochain moment calme.
- **Anti-boucle** : la version cible est notée en `sessionStorage`
  (`ludaskia_update_reloaded`) **avant** le reload → on ne recharge qu'**une fois
  par version** dans l'onglet (garde-fou si un cache CDN ressert un `index.html`
  périmé).
- **Rendu** : juste avant le reload, un **voile** (`.update-overlay`,
  `styles/version-update.scss`) porté par la **mascotte** masque le flash blanc
  et donne un repère de continuité ; le message est **lu en TTS** (best-effort, en
  appui du texte). Respecte `prefers-reduced-motion` / `anim-reduced`. Avis UX
  enfant + troubles/attention intégrés (message concret « je me mets à jour », pas
  de « version », pas de bouton, ton « bonne nouvelle »).
