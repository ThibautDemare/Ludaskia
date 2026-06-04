# Contribuer à Ludaskia

Merci de contribuer ! Ce document décrit le **process de développement** du
projet. (Pour l'architecture technique, voir `CLAUDE.md` — et à terme
`docs/ARCHITECTURE.md`.)

## En bref

Issue → branche → Pull Request → CI verte → **rebase-merge**.

`main` est **protégée** : aucun push direct, tout passe par une PR.

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
5. **CI** — les checks doivent être **verts** pour fusionner *(intégration
   continue à venir avec la migration outillage, voir issue #1)*.
6. **Merge** — **rebase uniquement** (squash et merge-commit sont désactivés au
   niveau du dépôt). La branche est supprimée automatiquement après le merge.

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

> ⚠️ Ces commandes évolueront avec la migration vers Vite / TypeScript / SCSS
> (voir issue #1).

- **Lancer l'app** : ouvrir `index.html` (double-clic) ou via un serveur statique.
- **Tests** : `node tests/run.js` (aucune dépendance ; code de sortie `1` si un
  test échoue). À lancer après toute modification de logique.

## Langues

- **Code, UI, commentaires, docs et issues** : en français.
- **Messages de commit et de PR** : en anglais.
