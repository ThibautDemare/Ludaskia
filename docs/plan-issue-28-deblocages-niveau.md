# Plan d'implémentation — Issue #28

> **Déblocages par niveau : rangs, mascotte évolutive et cosmétiques (thème Nature)**
>
> Document de travail (à supprimer ou archiver une fois l'issue close). Objectif :
> lever les points de blocage **avant** de coder, et figer le découpage en 3 PR.

## 0. Démarrage (pour une session neuve)
- **Brancher depuis `origin/main` à jour** (ne pas partir d'un arbre en cours d'édition
  par une autre session). **Dépendances levées** : niveaux (#27) et **picker d'avatars**
  sont déjà sur `main`.
- **Ordre** : phases 1 → 2 → 3 (§5). Les 3 sont débloquées ; 1 et 2 sont indépendantes du
  picker, la 3 le réutilise.
- **Repérer le code par symbole, pas par n° de ligne** : les lignes citées au §2 sont
  indicatives et dérivent (le dépôt évolue en parallèle).
- Workflow : branche + PR liée à #28, CI verte, **rebase-merge** (cf. `CONTRIBUTING.md`) ;
  le rebase **réécrit les SHA** (ne pas pister une dépendance par son SHA d'origine).

## 1. Objectif et garde-fous

Prolonger le système de niveaux (XP → niveau 1→100, déjà en place) pour que
**monter de niveau débloque des récompenses cosmétiques** à la manière d'un RPG.

**Garde-fou pédagogique (intangible) :** on ne verrouille **jamais** de contenu
d'apprentissage derrière le niveau. Aucune leçon, aucun mode n'est bloqué. On
débloque du **plaisir / de la fierté / de la personnalisation**, jamais du savoir.

**Principe transverse :** pas une récompense par niveau (sur 100, ce serait de
l'inflation). Des **paliers-récompense espacés** + teasers (« Débloqué au niveau X »).
Complémentaire des trophées (exploits précis) : les niveaux récompensent la
**régularité**.

Thème retenu : **Nature / forêt** (noms épicènes → pas de casse-tête de genre),
pilote à la fois les rangs et la mascotte.

## 2. État des lieux du code (points d'ancrage)

Ce qui existe déjà et sur quoi on s'appuie :

| Brique | Fichier | Détail utile |
|---|---|---|
| Niveau dérivé de l'XP | [src/core/progress.ts:197](../src/core/progress.ts#L197) | `niveauDepuisXP(xp)`, `NIVEAU_MAX=100`, `progressionNiveau(xp)`. Fonctions **pures**, déjà testées. |
| Gain d'XP + détection de level-up | [src/ui/session.ts:105-108](../src/ui/session.ts#L105-L108) | Calcule `niveauAvant` → `addXP(ok)` → `niveauGagne`. |
| Déclenchement modale de niveau | [src/ui/session.ts:196-197](../src/ui/session.ts#L196-L197) | `showLevelUp(niveauGagne, then?)`. |
| Modale de niveau | [src/ui/effects.ts:64](../src/ui/effects.ts#L64) | `showLevelUp` ; sous-titre = « Plus que N XP… ». Médaillon + `then` enchaîné. DOM dans [index.html:187-201](../index.html#L187-L201). |
| Badge niveau (barre) | [src/ui/render.ts:31](../src/ui/render.ts#L31) | `renderToolbarProfile()` : `⭐ Niveau N` + barre. |
| Avatars (palette) | [src/core/profiles.ts:32](../src/core/profiles.ts#L32) | `PROFILE_EMOJIS` (12). `setProfileEmoji(uuid, emoji)` valide contre cette liste ([profiles.ts:138](../src/core/profiles.ts#L138)). |
| Picker d'avatar (UI) | [src/ui/render.ts:75-83](../src/ui/render.ts#L75-L83) | `emojiPaletteHTML(current)` — **tout juste introduit** (commit `a96aac2`). |
| Câblage `set-emoji` | [src/main.ts:153-156](../src/main.ts#L153-L156) | Action déléguée sur la grille de la palette. |
| Grille trophées (modèle d'écran ✓/🔒) | [src/ui/render.ts:243](../src/ui/render.ts#L243) | `renderTrophies()` : pattern `on/off` + `🔒`, à réutiliser pour « Récompenses ». |
| Variables CSS de thème | [src/styles/base.scss:13-29](../src/styles/base.scss#L13-L29) | `:root { --blue, --ink, --paper, … }`. Point d'accroche des palettes. |
| Tests fonctions pures | [tests/logic.test.ts:493](../tests/logic.test.ts#L493) | Bloc « XP & gamification » — modèle pour `unlocks`. |

**Dépendances — toutes levées.** L'issue dépend de #25/PR #27 (niveaux) → **fait**. La
phase 3 s'appuie sur le **picker d'avatars** (`emojiPaletteHTML` / `setProfileEmoji`) →
**déjà sur `main`** (vérifié par le contenu ; le rebase-merge a réécrit le SHA d'origine
`a96aac2`, donc ne pas le chercher par SHA). Rien ne bloque les 3 phases.

## 3. Architecture cible

### 3.1 Nouveau module pur `src/core/unlocks.ts`

Aucun accès DOM, entièrement testable comme `niveauDepuisXP`. C'est le **cœur**
de l'issue. API proposée :

```ts
// Données (constantes typées, lisibles)
export interface Rang { seuil: number; titre: string; icone: string; }
export const RANGS: Rang[];            // 7 paliers : Graine → Légende de la forêt
export const MASCOTTE: { seuil: number; emoji: string }[];   // formes croissantes (voir barèmes ci-dessous)
export interface AvatarDeblocable { emoji: string; niveau: number; }
export const AVATARS_FORET: AvatarDeblocable[];              // animaux gated (voir barèmes ci-dessous)
export const THEMES: { id: string; label: string; icone: string; niveau: number }[];

// Fonctions pures (dérivent tout du niveau)
export function titreDuNiveau(n: number): Rang;              // rang courant
export function mascotteDuNiveau(n: number): string;         // forme courante
export function avatarsDebloques(n: number): string[];       // base (12) + forêt débloqués
export function avatarEstDebloque(emoji: string, n: number): boolean;
export function themesDebloques(n: number): string[];        // ids débloqués (défaut inclus)
export function recompensesNiveau(n: number): Recompense[];  // ce qui se débloque PILE à n
// + helper de plage pour la modale (voir §4.1) :
export function recompensesEntre(avant: number, apres: number): Recompense[];
```

`Recompense` = `{ type: 'rang'|'mascotte'|'avatar'|'theme'; icone: string; texte: string }`.

**Barèmes — validés et ajustés par l'avis pédagogique CE2** (agent `pedagogue-primaire`).
Deux corrections retenues : **densifier le tout début** (1re récompense vécue dès la
1re-2e session) et **casser le tunnel 90→100** (≈ 6 875 XP réels sans rien). Repères
d'XP cumulée vérifiés sur la courbe `round(12·L^0,89)` : niv 3 = 34 XP (~3-4 leçons),
niv 5 = 107, niv 50 = 10 125, niv 90 = 31 019, niv 95 = 34 375, niv 100 = 37 894.

- **Rangs** *(inchangés, bien découpés)* : 1–9 🌱 Graine · 10–24 🌿 Pousse · 25–44
  🪴 Arbuste · 45–64 🌳 Jeune arbre · 65–84 🌲 Grand chêne · 85–99 🌲🌲 Forêt ·
  100 🧝 Légende de la forêt *(forme de base `🧝`, sans modificateur de genre)*.
- **Mascotte** *(éclosion avancée au niv 3 ; moitié haute densifiée pour casser le
  « désert » 50→100)* : 1 🥚 · 3 🐣 · 10 🐥 · 25 🐤 · 50 🦉 · 65 🦜 · 80 🦢 · 90 🦚 ·
  100 🦅. Hibou conservé au niv 50 (palier validé) ; perroquet/cygne/paon ajoutés dans
  la moitié haute (variété + montée en majesté vers l'aigle). 9 formes au total.
- **Avatars forêt** *(1er au niv 5 conservé comme 2e récompense)* : 5 🐿️ · 15 🦔 ·
  30 🦌 · 45 🦫 · 60 🐗 · 75 🐺 · 90 🐻 · 100 🦅.
- **Thèmes** *(5 paliers, tous clairs ; pas de sombre en v1)* : Défaut · 🌲 Forêt (20) ·
  🍂 Automne (40) · 🌊 Lagon (70) · 🍓 Fruit rouge (95). Palettes hex en §3.5.
- **Niveau 100 = événement spécial** : rang « 🧝 Légende de la forêt » + écran/modale
  de félicitations dédié (la longue dernière ligne droite mérite une arrivée marquante).
- À **tester sur le terrain** (2-3 enfants CE2, ~2 semaines) : moment réel du 1er
  déblocage vécu et lisibilité des teasers « Débloqué au niveau X ».

### 3.2 Stockage

- **Avatar** : déjà dans `Profile.emoji` (méta `ludaskia_profiles`, **non préfixée**).
  Rien à migrer.
- **Thème choisi** : nouvelle clé **par profil** `ludaskia_theme` via `lsGet/lsSet`
  (cohérent avec le reste ; voyage à l'export/import sans effort). Défaut = `'defaut'`.
- **Rang / mascotte** : **rien à stocker** — dérivés du niveau, lui-même dérivé de
  l'XP. Source de vérité unique = `ludaskia_xp`. Pas de migration (principe du projet).

### 3.3 Emplacements d'affichage du rang et de la mascotte
**Décision mainteneur :** rang **et** mascotte doivent être **visibles** (sinon la
récompense n'a aucun intérêt), sans surcharger la barre d'outils.

- **Rang** :
  - **Badge de la barre** : remplacer l'icône générique `⭐` du badge par l'**icône
    du rang** → « 🌿 Niveau 12 » ([render.ts:40](../src/ui/render.ts#L40)), infobulle
    = titre du rang (« Pousse »). Le rang devient visible **partout** où le badge
    l'est, sans ajouter d'élément (zéro surcharge mobile).
  - **Accueil** : une **carte « progression »** (colonne gauche) regroupant rang
    (icône + titre) + niveau + barre + mascotte courante — le point d'ancrage central
    de la fierté.
- **Mascotte** (cadre pédagogique strict, validé par l'agent — voir §3.1) :
  - **Modale de niveau** (phase 2) : forme courante, mise en avant quand elle évolue.
  - **Accueil** : dans la carte « progression ».
  - **Autour des exercices, hors temps chronométré uniquement** : au **démarrage**
    d'une session (accueil/encouragement, avant le chrono) et sur l'**écran de
    résultats** (félicite l'**effort**, pas que le score).
  - **Interdits (garde-fou)** : jamais visible/animée **pendant** qu'un calcul est
    chronométré (charge cognitive + effet « public » anxiogène) ; **jamais de
    réaction sur une erreur** (l'erreur reste dédramatisée, feedback neutre).

### 3.4 Animations de la mascotte (CSS) — validé par l'agent UX enfant
Principe directeur (cible CE2, tablette/smartphone) : **deux registres** par mascotte
— une **entrée jouée une fois** à l'apparition, puis une **boucle de repos lente et de
faible amplitude** (le « souffle »). Le risque n'est pas le « trop bébé » (un œuf qui
frémit reste charmant à 8-9 ans) mais le **mouvement permanent qui parasite la lecture**.

**Réglages retenus (v1, must-have) :**
- **Entrée** (modale niveau, carte accueil, démarrage de session, résultats) : fondu +
  léger scale/rebond, **250-400 ms**, **une seule fois**.
- **Boucle de repos — sur la carte « progression » de l'accueil UNIQUEMENT** (écran de
  contemplation, pas de tâche urgente) :
  - 🥚 œuf : balancement gauche-droite ±5-7°, cycle **~2,5-3 s** ;
  - 🐣🐥🐤 oisillons : sautillement (translateY ~-10 %) **avec pause** dans le cycle (~1,8-2,2 s) ;
  - 🦉🦅 oiseaux : respiration/flottement très subtil (scale 1→1,03), ~3 s.
- **Démarrage de session & écran de résultats** : **entrée seule, pas de boucle permanente**
  (transitions où l'enfant est en mouvement → un compagnon qui gigote y devient du bruit).
- **Évolution de forme** dans la modale de niveau (ancienne → nouvelle forme, petit éclat
  < 1 s) : nice-to-have très valorisant.

**Contraintes techniques (perf & a11y), non négociables :**
- **N'animer que `transform` et `opacity`** (composés GPU). **Bannir** l'animation de
  `top/left/width/height/margin` (reflow), de `box-shadow`/`filter` en boucle.
- **CSS pur** (`@keyframes` + `animation`) ; le JS se limite à **poser/retirer une classe**
  (`.mascotte--repos`, `.mascotte--vol`). Pas de `requestAnimationFrame`, pas de timer.
  Pas de `will-change` permanent.
- **`@media (prefers-reduced-motion: reduce) { animation: none }`** sur toutes les boucles
  (règle globale dans [base.scss](../src/styles/base.scss)) : mascotte **visible et fixe**,
  pas supprimée. Enfants TDAH / sensibles au mouvement surreprésentés en classe.
- Pas d'animation sur `:hover` seul (tactile = pas de hover) : prévoir `:active`/`:focus-visible`.

**« Voler & se poser sur d'autres éléments » (idée mainteneur) → hors v1.** Un objet
mobile capte l'attention, peut chevaucher des zones tactiles, et « se poser sur une carte »
dépend du layout (taille/orientation) → robuste seulement avec du JS de positionnement
(dette de couplage) pour un effet cosmétique. Si repris un jour : déclenché **au tap**,
réservé 🦉/🦅, **arc autour de la position propre** (transform relatif), jamais sur un
élément cliquable.

Fichiers visés : [base.scss](../src/styles/base.scss) (reduced-motion), [modal.scss](../src/styles/modal.scss)
(modale niveau), [home.scss](../src/styles/home.scss) (carte progression), [effects.ts](../src/ui/effects.ts)
+ [render.ts](../src/ui/render.ts) (pose/retrait des classes).

### 3.5 Palettes des thèmes (hex à vérifier sur appareil)
**5 thèmes, tous CLAIRS** (avis UX + pédagogue). Avantage : `--paper` reste `#fff` et
`--ink` foncé **partout** → **pas besoin** du refactor de tokens chrome/feuille
(`--sheet-*`, `--on-accent`, `--card-shadow`, cf. §4.4) ; un thème ne réécrit que accent
+ soft + fond + encre. `--ok`/`--ko`/`--warn` **jamais** réécrits. Ratios estimés (à
confirmer au vérificateur réel + sur tablette ; accent toujours assez foncé pour porter
du texte blanc).

| Thème (niv) | `--blue` (accent) | `--blue-dark` | `--blue-soft` | fond `body` | `--ink` |
|---|---|---|---|---|---|
| Défaut | `#336cbf` | `#2a5aa0` | `#e9eff8` | `#eef1f5` | `#1a1a1a` |
| 🌲 Forêt (20) | `#2f7d52` | `#225c3c` | `#e4f0e8` | `#eef3ee` | `#1a1a1a` |
| 🍂 Automne (40) | `#b5532a` | `#8f3e1d` | `#f6e7db` | `#f4ede4` | `#2a1d16` |
| 🌊 Lagon (70) | `#0a8a8f` | `#066b6f` | `#def2f2` | `#eef6f6` | `#142020` |
| 🍓 Fruit rouge (95) | `#d7395a` | `#b02945` | `#fbe2e7` | `#fdeff1` | `#1f1417` |

Gamme répartie sur la roue (bleu / vert / orange / sarcelle / rouge), équilibre
chaud-froid, **aucune teinte gender-codée** : le violet/rose est volontairement évité —
à 8-9 ans (pic de conformité de genre) les garçons fuient rose **et** violet, d'où un
risque de rejet/moqueries, surtout sur un palier prestigieux.

Notes d'implémentation :
- **🌊 Lagon** : sarcelle vif (~186°), distinct du bleu Défaut (~210°) et du vert Forêt
  (~145°). Contraste blanc/accent ≈ 4,6:1 (juste) → si le texte blanc est petit,
  assombrir l'accent à `#098285` (~5:1). Émoji 🌊 parfois bleuté selon l'appareil → la
  **pastille de couleur** est le repère, pas l'émoji (alternatives : 🐢, 🪼).
- **🍓 Fruit rouge** : corail-rouge (~348°), perçu non-genré. Nom **générique** (l'émoji
  🍓 varie fraise/framboise selon l'appareil → éviter « Framboise/Fraise »).
- **À tester en priorité sur tablette** : discriminabilité des 3 pastilles froides
  Défaut / Forêt / Lagon côte à côte.

**Principes de conception de la gamme (anti-cliché) :** ancrer chaque thème dans un
**univers/objet épicène** (pas une couleur abstraite) ; variété chaud/froid ; jamais de
teinte clivante à un palier prestigieux ; jamais d'attribution genrée par défaut.

## 4. Points de blocage identifiés (à trancher avant de coder)

### 4.1 Saut de plusieurs niveaux en une session ⚠️
Un gros bilan peut faire passer `niveauAvant=4` → `niveauGagne=7` d'un coup. Si la
modale n'annonce que les déblocages du niveau **final**, on rate ceux des niveaux
intermédiaires. **Résolution :** `recompensesEntre(avant, apres)` qui agrège tous les
paliers de `]avant, apres]`. La modale liste **tous** les déblocages de la plage.
`session.ts` connaît déjà `niveauAvant` ([session.ts:105](../src/ui/session.ts#L105)).

### 4.2 Picker d'avatar et XP du profil édité ⚠️ (impacte phase 3) — **tranché : option (b)**
L'écran « Profils » permet d'éditer **n'importe quel** profil, mais `getXP()` lit
l'XP du **profil actif**. Or l'unlock d'un avatar dépend de l'XP **du profil édité**.
Si on grise les avatars selon `getXP()`, un profil non actif serait jugé avec la
mauvaise XP. **Décision mainteneur : option (b)** — exposer une lecture d'XP **par
profil** `getXPFor(uuid)` (lit la clé préfixée `<uuid>/ludaskia_xp` sans changer le
profil actif), de sorte que le picker reste universel (édition de tout profil) tout
en gérant le bon niveau pour le gating.

### 4.3 `setProfileEmoji` doit accepter les avatars forêt
Aujourd'hui il valide contre `PROFILE_EMOJIS` uniquement ([profiles.ts:138](../src/core/profiles.ts#L138)).
**Résolution :** valider contre `avatarsDebloques(niveauDuProfil)` (base + forêt
débloqués). Refuse un avatar verrouillé (sécurité : pas de contournement via DOM).
Garder `PROFILE_EMOJIS` **séparé** de `AVATARS_FORET` pour que `addProfile` /
fallback d'import ne pioche **que** dans les 12 de base (jamais un avatar gated par défaut).

### 4.4 Application et persistance du thème
Un thème = bascule de variables CSS. **Résolution :** définir les palettes en SCSS
sous des sélecteurs `:root[data-theme="foret"] { --blue: …; … }`, et poser
`document.documentElement.dataset.theme` au chargement **et** à chaque changement de
profil (le thème est par profil). Penser à réappliquer dans `setActiveProfile` /
au bootstrap `main.ts`. Garde-fou : si le thème stocké n'est plus débloqué, retomber
sur `'defaut'` (cf. §4.7).

**Architecture des tokens — simplifiée par la décision « 100 % clair ».** Tous les
thèmes restant clairs (`--paper`=#fff, `--ink` foncé partout), un thème ne réécrit que
`--blue`/`--blue-dark`/`--blue-soft`/fond `body`/`--ink`. **On n'a donc PAS besoin** du
refactor chrome/feuille (`--sheet-bg`/`--sheet-ink`, `--on-accent`, `--card-shadow`) :
il n'existait que pour protéger les feuilles et les boutons sous un **chrome sombre**.
Restent valables quel que soit le thème :
- **Ne JAMAIS réécrire `--ok`/`--ko`/`--warn`** : couleurs porteuses de sens
  (réussite/erreur, doublé d'icônes), apprises par l'enfant.
- **Impression** : les fiches s'impriment toujours noir sur blanc — déjà le cas
  (`print.scss` force `#fff`/encre sombre et masque le chrome) ; comme aucun thème
  n'assombrit `--paper`/`--ink`, aucun filet supplémentaire n'est requis.
- **Pastille mascotte** : un rond `--blue-soft` (dérivé par thème) + liseré `--blue`
  derrière l'emoji, pour le détourer quel que soit son rendu natif (Android/iOS).
  Statique (pas d'animation de `box-shadow`, cf. §3.4).

> **Si un thème sombre est réintroduit plus tard** (post-v1), il faudra alors faire le
> refactor de tokens décrit plus haut (dédoubler `--sheet-*`, ajouter `--on-accent` et
> `--card-shadow`, filet print explicite). C'est précisément le coût qu'on s'épargne en
> v1 en restant clair.

### 4.7 Réinitialisation de profil : aligner l'avatar sur les autres récompenses ⚠️
**Export/import : pas de problème.** L'XP est stockée sous `<uuid>/ludaskia_xp`
(clé **préfixée par profil**) et `profileDataRelative` ([profiles.ts:176](../src/core/profiles.ts#L176))
embarque toutes les clés du préfixe → **l'XP est exportée et réimportée avec le
profil**. Avatar (méta) et thème (donnée préfixée) restent donc cohérents avec l'XP.

**Comportement attendu du reset.** `resetProfile` ([profiles.ts:153](../src/core/profiles.ts#L153))
efface **toutes** les clés préfixées → trophées, étoiles, XP, thème… **toutes les
récompenses gagnées repartent à zéro**. Par cohérence, les déblocages de niveau
doivent suivre. Heureusement, l'essentiel se réinitialise **tout seul** :
- **Mascotte & rang** : dérivés du niveau (donc de l'XP) → XP=0 ramène
  automatiquement à 🥚 / 🌱 Graine. **Rien à coder.**
- **Thème** : clé préfixée `ludaskia_theme` → **effacée** par le reset → retour au
  défaut. Automatique.
- **Avatar** : **seul cas qui survit**, car il vit dans la méta `ludaskia_profiles`
  (non préfixée) → un avatar forêt (ex. 🐺) resterait sur un profil à XP 0.

**Résolution :** `resetProfile` doit, en plus, **réinitialiser l'avatar uniquement
s'il s'agit d'un avatar « forêt » gated** — c.-à-d. s'il n'appartient pas à
`PROFILE_EMOJIS` (les 12 de base, dispo dès le niveau 1, qui relèvent de l'identité
choisie et non d'une récompense). Dans ce cas, retomber sur un avatar de base (ex.
`PROFILE_EMOJIS[0]`). Si l'avatar courant est déjà un avatar de base, **on le garde**
(on ne punit pas un choix d'identité gratuit). Le gating au **moment du choix**
(`setProfileEmoji`, §4.3) empêchera de le re-sélectionner tant que le niveau requis
n'est pas re-atteint.

### 4.5 Émoji partagé entre mascotte et avatar (🦅 niv 100)
🦅 est à la fois la mascotte finale et un avatar niveau 100 : pas un bug, mais éviter
la confusion dans la modale (« mascotte » vs « nouvel avatar »). Texte distinct par
`type` de récompense. Sans gravité.

### 4.6 Rendu de la modale pour les déblocages
La modale `showLevelUp` actuelle affiche un seul sous-titre. **Décision :** enrichir
`showLevelUp` (signature `showLevelUp(niveau, recompenses[], then?)`) pour y injecter la
**liste** des déblocages (style `modal-li` de `showCelebration`) — un seul point
d'entrée, pas de 2e modale.

## 5. Découpage en PR

Chaque PR = une branche + une PR liée à #28, CI verte, rebase-merge. Tests Vitest
des fonctions pures à chaque PR touchant `core/`. Mettre à jour `docs/ARCHITECTURE.md`
(section Gamification + liste `src/core/`).

**Avancement** : Phase 1 ✅ (PR #71) · Phase 2 ✅ (PR #72) · Phase 3a ✅ (PR #73) ·
Phase 3b ✅ (PR #74) · Phase 3c ✅ · **Phase 4** (mascotte autour des exercices) à venir.
La phase 3 s'est révélée trop grosse pour une seule PR → découpée en **3a avatars**,
**3b thèmes (+ réglage animations)**, **3c modales**.

### Phase 1 — Rangs / titres (léger, gros effet) ✅ fait (PR #71)
**But :** afficher le rang textuel du niveau.
- `core/unlocks.ts` : `RANGS` + `titreDuNiveau(n)` (+ `recompensesNiveau` minimal, type `rang`).
- Affichage (cf. §3.3, décidé) : **icône du rang dans le badge de la barre** (« 🌿
  Niveau 12 », infobulle = titre) + **carte « progression » sur l'accueil** (rang +
  niveau + barre, prête à accueillir la mascotte en phase 2).
- Annonce du nouveau rang dans la modale de niveau (via §4.1/§4.6, version réduite).
- Tests : `titreDuNiveau` aux bornes (9/10, 24/25, 99/100…), monotonicité.
- **Aucune dépendance** au picker d'avatars → faisable tout de suite.

### Phase 2 — Mascotte évolutive ✅ fait (PR #72)
**But :** un compagnon qui grandit aux paliers marquants.
- `core/unlocks.ts` : `MASCOTTE` + `mascotteDuNiveau(n)` + détection d'évolution
  (via `recompensesEntre`, §4.1).
- Affichage (cf. §3.3, cadre pédagogique strict) : modale de niveau (forme courante
  + mise en avant si évolution) ; carte « progression » de l'accueil. *(Les apparitions
  au démarrage de session / écran de résultats ont été **reportées en phase 4** pour
  garder la PR focalisée.)*
- **Animations CSS (cf. §3.4)** : entrée jouée une fois (fondu + léger rebond) ; boucle
  de repos douce **sur la carte accueil seulement** (balancement/sautillement/respiration
  selon la forme) ; `prefers-reduced-motion` → `animation: none` ; transform/opacity only.
  La version « vol & pose » est **hors v1**.
- Tests : `mascotteDuNiveau` aux seuils, détection d'évolution sur saut multi-niveaux.
- Dépend de la phase 1 (module + plomberie modale + carte progression).

### Phase 3 — Cosmétiques (découpée en 3 PR)
**But :** personnalisation débloquée. Prérequis (picker d'avatars) déjà sur `main`.

#### Phase 3a — Avatars « forêt » gated (en cours)
- `core/unlocks.ts` : `AVATARS_FORET` + `niveauRequisAvatar` + `avatarsForetDebloques`
  (gamme forêt seule — la combinaison base + forêt vit dans `profiles.ts` pour éviter un
  cycle) ; l'avatar entre aussi dans `recompensesNiveau` (annonce « Nouvel avatar »).
- `core/profiles.ts` : `getXPFor(uuid)` (§4.2 b) ; `avatarAutorise` / `setProfileEmoji`
  refusent un avatar verrouillé ; `resetProfile` rend un avatar forêt si l'XP repart à 0
  (garde un avatar de base) — §4.7.
- `ui/render.ts` : `emojiPaletteHTML` montre base + forêt, verrouillés grisés « 🔒 Niv X »,
  jaugé au niveau du **profil édité**.
- Tests : `niveauRequisAvatar`/`avatarsForetDebloques` ; refus d'un avatar verrouillé ;
  reset qui rend l'avatar forêt mais garde un avatar de base.

#### Phase 3b — Thèmes de couleur (+ réglage « Animations réduites ») ✅ fait
- `core/unlocks.ts` : `THEMES` + `themesDebloques`.
- **Thèmes** (cf. §3.5 palettes, §4.4) — **tous clairs, pas de refactor de tokens** :
  palettes sous `:root[data-theme="foret|automne|lagon|fruit-rouge"]` (nouveau
  `themes.scss`) ; appliquer `data-theme` au bootstrap et au changement de profil ;
  stocker le thème par profil (`ludaskia_theme`, défaut si non débloqué) ; sélecteur de
  thèmes (verrouillés grisés).
- **Réglage « Animations réduites » par profil** (décidé v1, §3.4) : drapeau
  `ludaskia_anim` (`lsGet/lsSet`), posé en classe sur `<html>`, en plus de
  `prefers-reduced-motion`. Toggle dans l'écran Profils.
- Tests : `themesDebloques` aux seuils ; thème stocké non débloqué → défaut.

#### Phase 3c — Modales « Récompenses » et « Trophées » ✅ fait
- **Modale « Récompenses »** (§3.3/§6) : modale dédiée (pas une vue routée) listant les
  paliers — acquis ✓ et à venir 🔒 « Débloqué au niveau X » — pour rangs, mascotte,
  avatars et thèmes. Calquée sur `renderTrophies` ; overlay dans `index.html` (modèle
  `levelup`/`celebrate`). **Deux entrées** : accueil **et** écran Profils.
- **Modale « Trophées » dédiée** : même mécanisme, depuis l'inline `renderTrophies`
  actuel → un bouton ouvre la modale. Composant d'overlay mutualisé.

### Phase 4 — Apparitions de la mascotte autour des exercices
**But :** rendre la mascotte présente comme **accompagnant**, hors temps chronométré
(reporté des phases 2-3 pour les isoler ; cf. cadre pédagogique §3.3).
- **Démarrage de session** : la mascotte accueille/encourage **avant** le chrono
  (point d'accroche dans `afterStart`, [navigation.ts](../src/ui/navigation.ts) ; veiller
  à ne pas voler le focus du 1er champ).
- **Écran de résultats** : la mascotte félicite l'**effort** (pas que le score) dans le
  bandeau de résultat ([session.ts](../src/ui/session.ts)) et l'équivalent sprint/ortho.
- **Garde-fous (intangibles)** : jamais visible/animée **pendant** qu'un calcul est
  chronométré ; **jamais de réaction sur une erreur** ; animations `transform`/`opacity`
  + `prefers-reduced-motion` (réutiliser les classes de §3.4).
- À valider sur le terrain (dosage : encourageant sans distraire).

## 6. Décisions actées & points encore ouverts

### Décisions actées (mainteneur)
1. **§4.2 — picker d'avatar : option (b)** `getXPFor(uuid)` (picker universel, gating
   sur le niveau du profil édité).
2. **Rang & mascotte visibles** (§3.3) : icône du rang dans le badge de la barre +
   carte « progression » sur l'accueil ; mascotte en modale de niveau, accueil, et
   autour des exercices **hors chrono** (jamais pendant un calcul, jamais sur erreur).
3. **Récompenses & trophées = modales dédiées**, ouvertes depuis **l'accueil et
   l'écran Profils**, listant acquis ✓ / à obtenir 🔒 (+ niveau requis).
4. **Barèmes validés par l'agent pédagogue** et ajustés (§3.1) : éclosion mascotte au
   niv 3, 4e thème au niv 95, niveau 100 spécial. Seuils d'XP revérifiés sur la courbe.
   **Mascotte finalisée à 9 formes** : 1 🥚 · 3 🐣 · 10 🐥 · 25 🐤 · 50 🦉 · 65 🦜 ·
   80 🦢 · 90 🦚 · 100 🦅 (perroquet/cygne/paon ajoutés dans la moitié haute).
5. **Thèmes : 5 paliers, tous clairs** (avis UX + pédagogue, §3.5/§4.4) — Défaut · 🌲 Forêt
   (20) · 🍂 Automne (40) · 🌊 Lagon (70) · 🍓 Fruit rouge (95). Magenta « girly » écarté
   (rejet des garçons) → corail-rouge ; 4e thème en teinte froide neutre (Lagon). **Aucun
   refactor de tokens** (pas de chrome sombre) ; `--ok`/`--ko`/`--warn` jamais réécrits ;
   impression inchangée. **Thème sombre rajoutable plus tard** (coût : refactor de tokens).
6. **Réglage « Animations réduites » par profil : intégré en v1** (`ludaskia_anim`),
   en plus de `prefers-reduced-motion` (les tablettes familiales n'ont souvent pas le
   réglage système activé). Coût faible, aucun blocage technique.

### Animations de la mascotte (décidé, §3.4)
Avis UX enfant intégré : **must-have v1** = entrée jouée une fois + boucle de repos
douce sur l'accueil + `prefers-reduced-motion` + transform/opacity only. **« Vol &
pose » repoussé post-v1** (dette de couplage layout/JS pour un effet cosmétique) ;
si réintroduit, version sûre au tap, arc autour de la position propre, jamais sur un
élément cliquable.

### À vérifier à l'implémentation / sur le terrain
- **Vérification visuelle réelle** (une fois les thèmes codés, sur **tablette d'entrée
  de gamme**) : ratios de contraste confirmés au vérificateur, **discriminabilité des 5
  pastilles** (surtout les froides Défaut / Forêt / Lagon), et **rendu des emojis natifs
  Android/iOS** (un 🐤 quasi-blanc, un 🦅 sombre, le 🌊 bleuté) en petite taille.
- **Test terrain** (2-3 enfants CE2, ~2 semaines) : moment du 1er déblocage vécu,
  lisibilité des teasers, et **dosage des animations** (charme vs agacement de la boucle
  de repos) — à observer avec l'avis `pedagogue-primaire`.
