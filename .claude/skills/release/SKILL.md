---
name: release
description: >-
  Met Ludaskia en production de bout en bout : publie une release GitHub à tag
  calendaire (`vAAAA.MM.JJ`), ce qui déclenche le déploiement GitHub Pages
  (`pages.yml`). La skill vérifie que `main` est à jour et que la CI y est verte,
  calcule le nom du tag (suffixe `.2`/`.3` si ce n'est pas la 1re release du jour),
  délègue la rédaction des notes FR et la publication à l'agent
  `gestionnaire-github`, puis surveille le déploiement jusqu'au vert. À invoquer
  quand le mainteneur demande explicitement de « lancer une release » / « mettre
  en prod » / « déployer ».
---

# Lancer une release (mise en production)

Mettre en prod, c'est **publier une release GitHub** : le workflow `pages.yml`
écoute `release: published`, build le commit du tag et publie sur GitHub Pages.
**Merger sur `main` ne déploie rien** — `main` est la ligne d'intégration ;
publier une release est l'étape délibérée qui met en prod.

L'invocation de cette skill par le mainteneur **est** le feu vert (cf. garde-fou
« jamais de release de sa propre initiative »). La skill peut donc aller au bout
**sans redemander l'autorisation de publier**, mais elle **s'arrête et alerte**
si une pré-condition n'est pas remplie (CI non verte, `main` pas à jour, doute
sur le périmètre).

> Les règles de fond (nommage du tag, suffixe même-jour, garde-fous) sont dans
> `CONTRIBUTING.md` (§ « Mise en production ») et dans l'agent
> `.claude/agents/gestionnaire-github.md` (§ « Releases »). **Ne jamais demander
> au mainteneur une convention déjà écrite là** — la lire.

## Étapes

### 1. Pré-vol — vérifier l'état (fil principal, sans agent)
1. Synchroniser : `git fetch --tags --prune`.
2. **`main` à jour ?** Le tip qu'on publiera = `origin/main`. Vérifier qu'il n'y
   a rien d'oublié et que le working tree n'a pas de WIP non commité qui devrait
   partir en prod : `git status -sb`, `git log -1 --format='%h %s' origin/main`.
   - ⚠️ Si on est sur une branche divergente ou avec des modifs non commitées
     pertinentes → **arrêter** et clarifier avec le mainteneur.
3. **Périmètre** : dernière release et commits depuis :
   ```
   git tag --sort=-creatordate | head -3
   git log <derniere-release>..origin/main --oneline
   ```
   (Compter précisément — ne pas se fier à une liste de mémoire.) Cette liste
   sert de base aux notes.
4. **CI verte sur le tip** (impératif) : `gh run list --branch main --limit 1`.
   - Le dernier run `push` sur `main` doit être `completed` / `success` **et**
     porter le SHA de `origin/main` (`gh run view <id> --json status,conclusion,headSha`).
   - Si **en cours** → surveiller jusqu'au vert avant de continuer (relancer
     `gh run list` ; ne pas publier sur du rouge ou de l'inconnu).
   - Si **rouge** → **arrêter** et le signaler ; pas de mise en prod.

### 2. Calculer le tag (rappel — l'agent le refait/vérifie)
- Base calendaire : `Get-Date -Format 'yyyy.MM.dd'` → `v<date>`.
- **Déjà une release `v<date>` aujourd'hui ?** `gh release list` → suffixer
  `.2`, `.3`… (la **1re du jour reste sans suffixe**). Ex. : `v2026.06.23`, puis
  `v2026.06.23.2`.

### 3. Déléguer la publication à `gestionnaire-github`
Lancer l'agent `gestionnaire-github` avec un brief contenant :
- **le feu vert explicite** (le mainteneur a demandé la release) ;
- le **tip de `main`** à publier (SHA) et le rappel **CI verte** (n° de run) ;
- la **liste des commits** depuis la dernière release (issue de l'étape 1.3) ;
- la consigne : **calculer le tag** (calendaire + suffixe même-jour, vérifié via
  `gh release list`), **rédiger les notes en français avec accents** regroupées
  **par thème** (pas un dump de commits bruts), via un fichier `.md` UTF-8 écrit
  avec l'outil Write puis passé en **`--notes-file`** (jamais `--notes` inline),
  puis publier :
  `gh release create v<date> --target main --title "v<date>" --notes-file "<fichier>"` ;
- demander en retour : **URL de la release** + confirmation que `pages.yml` s'est
  déclenché.

### 4. Vérifier le déploiement (fil principal)
La release seule ne suffit pas — c'est le **déploiement Pages** qui met en prod.
Surveiller jusqu'au vert :
```
gh run list --workflow pages.yml --limit 3
gh run view <id> --json status,conclusion,event   # event doit être "release"
```
Attendre `completed` / `success`.

### 5. Restituer
Récapituler : **tag**, **cible** (SHA `main`), **CI** (verte), **URL** de la
release, **statut du déploiement Pages**, et le **contenu** mis en prod (les
thèmes des notes). Signaler tout point en suspens.

## Pièges à éviter
- Ne **pas** publier si la CI n'est pas verte sur le **bon** commit, ou si `main`
  n'est pas à jour / contient un WIP ambigu → arrêter et alerter.
- Ne **pas** rédiger les notes en `--notes` inline ni via here-string PowerShell
  (casse d'encodage des accents) → toujours fichier UTF-8 + `--notes-file`.
- Ne **pas** réutiliser ou déplacer un tag de release déjà publié → suffixer.
- Ne **pas** poser de question sur une convention déjà documentée (cf. note plus
  haut).
- Le déploiement est **vers la prod (sortant)** : l'invocation de la skill suffit
  comme autorisation, mais toute anomalie de pré-vol **bloque** la publication.