# CLAUDE.md — Ludaskia

Mini-application web d'entraînement au **calcul mental** (CE2) : génération de
calculs, correction instantanée, chronomètre, gamification (records, médailles,
trophées, objectifs) et profils. 100 % côté client (`localStorage`).
**TypeScript + Vite + SCSS**, tests **Vitest**.

## Où trouver quoi
- **Architecture technique** (stack, structure `src/`, données, build, déploiement,
  gamification) → **`docs/ARCHITECTURE.md`** (doc « état courant », tenue à jour).
- **Process de contribution** (branche → PR → CI → rebase-merge, Conventional
  Commits, `main` protégée) → **`CONTRIBUTING.md`**.

## Lancer
- `npm install` puis `npm run dev` (serveur + HMR).
- Avant de pousser : `npm run typecheck`, `npm run lint`, `npm test`.
- Build de prod : `npm run build` (→ `dist/`).

## Conventions
- **Code, UI, commentaires, docs et issues : en français.** Messages de commit/PR :
  en **anglais** (Conventional Commits — voir `CONTRIBUTING.md`).
- **TypeScript `strict`** ; passer par **ESLint + Prettier** (`npm run lint` /
  `format`). La CI vérifie `format:check → lint → typecheck → test`.
- **Stockage** : toujours via `lsGet/lsSet` (jamais `localStorage` directement,
  sauf accès bruts dédiés dans `src/core/storage.ts`).
- **Séparation** logique (`src/core/`, testable sans DOM) / rendu (`src/ui/`).
  Lancer `npm test` après toute modif de logique.
- **Commits : aucune attribution Claude** (`Co-Authored-By` / « Generated with
  Claude Code »).

Tenir `docs/ARCHITECTURE.md` à jour quand l'architecture évolue (et garder ce
fichier court).
