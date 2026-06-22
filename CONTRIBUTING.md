# Contribuer à Ludaskia

Merci de contribuer ! Ce document décrit le **process de développement** du
projet. (Pour l'architecture technique, voir `docs/ARCHITECTURE.md` ; pour les
consignes de contribution destinées aux sessions agent, `CLAUDE.md`.)

## En bref

Issue → branche → Pull Request → CI verte → **rebase-merge** sur `main`.

`main` est **protégée** : aucun push direct, tout passe par une PR. Merger sur
`main` **ne déploie pas** : `main` est la ligne d'intégration où l'on consolide
plusieurs PR. La **mise en production** est une étape distincte et délibérée —
publier une *release* (voir « Mise en production » plus bas).

## Étapes

1. **Issue** — décrire le besoin (bug, fonctionnalité, tâche).
2. **Branche** — depuis une `main` à jour :
   ```bash
   git switch main && git pull
   git switch -c <type>/<court-libellé>   # ex. feat/sprint-pause, fix/score-arrondi
   ```
3. **Commits** — format *Conventional Commits*, en anglais (voir plus bas).
4. **Pull Request** — ouvrir vers `main` et lier l'issue avec `Closes #N` dans la
   description (l'issue se ferme automatiquement au merge).
5. **CI** — le workflow `ci.yml` enchaîne `format:check → lint → typecheck →
   test` sur chaque PR ; tous les checks doivent être **verts** pour fusionner.
6. **Merge** — **rebase uniquement** (squash et merge-commit sont désactivés au
   niveau du dépôt). La branche est supprimée automatiquement après le merge.

## Mise en production (déploiement)

Le déploiement sur GitHub Pages est déclenché par la **publication d'une release
GitHub**, **pas** par le merge. On peut ainsi consolider plusieurs PR sur `main`,
les tester ensemble, puis publier quand on le décide.

1. S'assurer que `main` est à jour et contient bien tout ce qu'on veut publier.
2. **Publier une release** avec un tag **calendaire** `vAAAA.MM.JJ` (date du jour) :
   ```bash
   gh release create v2026.06.22 --target main --title "v2026.06.22" \
     --notes "Résumé en français de ce que la release met en prod"
   ```
   (ou via l'UI GitHub : *Releases → Draft a new release*).
3. Plusieurs releases le même jour → suffixer : `v2026.06.22.2`, `v2026.06.22.3`…
   (la première du jour reste sans suffixe).

La publication déclenche `pages.yml` (`npm ci → npm run build →` déploiement Pages)
sur le commit du tag ; `workflow_dispatch` reste un filet de secours manuel.

> Déléguer de préférence la création des releases à l'agent `gestionnaire-github`
> (il calcule le nom du tag et rédige les notes en français). La mise en prod ne se
> fait **jamais** sans le feu vert du mainteneur.

## Labels et milestones

### Labels

Toute issue porte **au moins un label de type**, **exactement une priorité** et
**exactement un effort**. Vérifier les labels réels du dépôt via
`gh label list`.

**Type** (un ou plusieurs) :

| Label | Usage |
|-------|-------|
| `bug` | Dysfonctionnement (« ça ne marche pas ») |
| `enhancement` | Nouvelle fonctionnalité |
| `polish` | Existant fonctionnel à peaufiner (sous-optimal, obsolète, à mettre à jour) |
| `refacto` | Restructuration sans nouveauté visible |
| `architecture` | Changement structurel fondateur |
| `content` | Ajout de données ou d'exercices |
| `gamification` | Trophées, XP, objectifs, récompenses |
| `documentation` | Documentation |

**Priorité** (un seul) : `priority: high` · `priority: medium` · `priority: low`.

**Effort** (un seul) : `effort: low` · `effort: medium` · `effort: high`.

Génériques GitHub au besoin : `duplicate`, `question`, `good first issue`,
`help wanted`, `invalid`, `wontfix`.

Appliquer le(s) label(s) le(s) plus précis à chaque issue et PR.

### Milestones

Un **milestone** regroupe les issues d'un même chantier et affiche la progression
(issues fermées / total). Il peut porter une date limite optionnelle.

Créer un milestone pour tout chantier qui implique ≥ 3 issues liées. Les petits
correctifs isolés n'en ont pas besoin.

## Convention de messages de commit

Format [Conventional Commits](https://www.conventionalcommits.org/) :
`type: résumé court à l'impératif` **en anglais**.

Types courants :

| Type | Usage |
|------|-------|
| `feat:` | nouvelle fonctionnalité |
| `fix:` | correction de bug |
| `docs:` | documentation |
| `refactor:` | refactorisation sans changement de comportement |
| `test:` | ajout / modification de tests |
| `chore:` | tâches diverses (config, dépendances) |
| `build:` / `ci:` | outillage de build / intégration continue |
| `perf:` | performance |
| `style:` | style / formatage |

Exemples :

```
feat: add pause button to sprint mode
fix: correct rounding on lesson average
docs: document profile export format
```

Les commits ne portent **aucune attribution automatique** (configuré dans
`.claude/settings.json`).

## Lancer le projet

Stack **TypeScript + Vite + SCSS**, tests **Vitest**. Prérequis : Node ≥ 20.

- **Installer** : `npm install`.
- **Lancer l'app** : `npm run dev` (serveur de dev + HMR).
- **Build de prod** : `npm run build` (→ `dist/`).
- **Tests** : `npm test` (Vitest). À lancer après toute modification de logique.
- **Avant de pousser** : `npm run typecheck`, `npm run lint`, `npm test` (la CI
  vérifie `format:check → lint → typecheck → test`).

## Langues

- **Code, UI, commentaires, docs et issues** : en français.
- **Messages de commit et de PR** : en anglais.
