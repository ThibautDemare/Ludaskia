# Design — Orthographe & accessibilité « dys »

> Document de conception **cible** (rien n'est encore implémenté). Il consolide les
> décisions prises lors de l'exploration « intégrer une aide à la lecture façon
> LireCouleur + un mode d'apprentissage de l'orthographe ». L'implémentation
> réelle peut s'en écarter ; `ARCHITECTURE.md` sera mis à jour une fois les issues
> mergées. S'articule avec `docs/design-multi-subject.md` (hiérarchie
> Matière → Catégorie → Leçon, type `Exercise`, `ExerciseType`).

## Objectif

Deux fonctionnalités liées, issues de la même réflexion :

1. **Accessibilité (« confort de lecture » / dys)** — transverse à toutes les
   matières : police plus lisible et coloration optionnelle des consignes.
2. **Mode Orthographe** — une nouvelle catégorie du français pour **apprendre
   l'orthographe de mots**, conçue autour du **vécu réel** : un enfant a, chaque
   semaine, une **liste de mots** donnée par l'école, avec une échéance courte
   (le contrôle), et on veut aussi entretenir ces mots sur l'année.

Le **mode Révision espacée** qui en découle est traité en fin de document comme
un chantier **séparé** (issue à part).

---

## Décisions transverses (les deux fonctionnalités)

### Licence : permissif uniquement, pas de GPL
Le projet pourrait devenir commercial. On **exclut** donc LireCouleur 6 et son
portage WebAssembly (`@dyscolor/syllabify-fr-wasm`), tous deux en **GPL v3**
(copyleft fort : héberger l'app = distribuer le code → contamine tout le projet).
On reste sur des briques **MIT / Apache / BSD / ISC** ou du code maison.

### Coloration : jamais les « pièges » en automatique
Principe pédagogique acté : on ne colorie **jamais automatiquement** les lettres
muettes ni les graphèmes difficiles d'un mot. C'est **le travail d'analyse de
l'enfant** (voir « Atelier du mot ») ; l'automatiser détruit la valeur
pédagogique. Seule la **segmentation syllabique** (mécanique, peu porteuse de
mémorisation) peut être automatisée — et seulement comme aide optionnelle.

### Syllabation automatique : `syllabify-fr` (MIT), à vendoriser — si besoin
Pour colorer en bicolore les syllabes d'un **texte arbitraire** (cas des
consignes), la meilleure option permissive est **`syllabify-fr`** (UrielCh,
**MIT**, 0 dépendance, ~19 Ko, vraie syllabation par règles). Défauts connus à
corriger : consonnes doublées (`carrefour`) et **e muet final** isolé en
« syllabe ». Reco : **vendoriser** (copier les ~7 Ko, corriger, tester sur notre
vocabulaire) plutôt que dépendre d'un paquet peu maintenu — ou écrire des
**règles maison** (~50-80 lignes) pour un vocabulaire CE2 ciblé. **Ne pas**
utiliser de lib de césure (`hyphen`/`hypher`) : coupures typographiques ≠
syllabes pédagogiques.

> Note : le **mode Orthographe ne dépend pas** de cette brique (dans l'atelier,
> c'est l'enfant qui découpe). Elle ne sert vraiment qu'à la **coloration des
> consignes**. On n'introduit donc aucune dépendance tant que cette dernière
> n'est pas développée.

---

## 1. Accessibilité / Confort de lecture (transverse)

> Décidé sur la base d'un avis pédagogique. Probablement une **issue dédiée**,
> indépendante de l'orthographe.

### Police : Nunito + espacement, pas OpenDyslexic
L'état des preuves est clair : les polices « spécial dys » n'apportent pas de gain
mesurable ; c'est **l'espacement** qui aide (Zorzi et al. 2012, PNAS). On **garde
Nunito** (déjà auto-hébergée) et, sous le mode confort, on augmente
`letter-spacing`, `word-spacing`, `line-height` et la **taille de base** ; texte
**aligné à gauche, non justifié**. Bénéfices : zéro police à embarquer, pas de
stigmatisation.

### Coloration des consignes
Aide au **décodage** : **syllabique bicolore** alternée (pas de phonèmes, trop
lourd pour une simple consigne). Optionnelle.

> **Réserve, preuves à l'appui.** L'efficacité de la *coloration* syllabique en
> propre est **faible et contrastée** (un mémoire d'orthophonie 2021 sur 65 enfants
> dys : **précision améliorée, mais pas la vitesse** ; pas d'essai contrôlé). Ce
> qui est solidement étayé, c'est l'**espacement/segmentation** (Zorzi 2012), pas
> la couleur. Recommandation officielle FR (Éduscol, Canopé) : **usage toléré et
> personnalisé**, jamais « prouvé ». **Conséquence** : pour des *consignes* (≠ texte
> de lecture suivie), prioriser l'**espacement** ; faire de la coloration syllabique
> une **option réservée** au profil « aide à la lecture », et privilégier un
> **bouton « lire la consigne » (TTS)** — meilleur rapport preuve/effort pour les
> dys, **et qui réutilise le module TTS de la dictée** (cf. §2). → renforce l'idée
> d'une **issue à part, basse priorité**.

### Réglages : deux interrupteurs séparés
Dans le **profil**, deux préférences indépendantes (certains enfants veulent
l'une sans l'autre) :
- **Confort de lecture** (police + espacement + taille) ;
- **Coloration des consignes** (on/off).

Un bouton-preset « Aménagements » peut activer les deux d'un coup, mais chacun
reste décochable. **Nom neutre** (« Confort de lecture »), pas « Mode dyslexie ».

### Couleurs & accessibilité (vaut aussi pour l'orthographe)
- Teintes **pastel**, **jamais rouge/vert** opposés (daltonisme ~8 % des garçons).
- L'information bon/faux **jamais portée par la couleur seule** (doubler par
  trait, gras, position, icône).
- Contraste visé **WCAG AA**. Option **fond crème** envisageable (réduit
  l'éblouissement).

### Stockage du réglage (profil)
Les préférences vivent dans la **méta de profil** (`Profile`), pas dans les
données de progression : un réglage d'accessibilité doit **survivre à
« Réinitialiser »** (qui n'efface que les clés de données). Prévoir un objet
extensible, p. ex. `prefs?: { confortLecture?: boolean; colorationConsignes?:
boolean; /* futur: level?: SchoolLevel */ }`. À câbler dans `exportProfiles` /
`importProfiles` + bumper `updatedAt` au changement (comme `renameProfile`).
Application : une classe sur `<body>` posée dans `applyActive()`, le SCSS fait le
reste (surcharge des variables `--ui` / `--serif` et de l'espacement).

---

## 2. Mode Orthographe

### Place dans la hiérarchie
Matière **Français** → catégorie **Orthographe** → **leçons**. Deux origines de
leçons cohabitent dans cette catégorie :

- **Leçons prédéfinies** (statiques, fournies par l'app) : **mots invariables**
  et **mots irréguliers**, **découpées en plusieurs leçons numérotées**
  (Invariables 1, 2, … Irréguliers 1, 2, …) pour éviter les listes-fleuves.
  Priorité pédagogique : **mots invariables** d'abord (très fréquents,
  irréguliers, mémorisation pure), puis irréguliers fréquents. **Éviter** les
  homophones grammaticaux (a/à, et/est…) en mot-à-mot (relèvent de la grammaire
  en contexte). Liste de mots à fournir par le mainteneur.
- **Listes du parent** (dynamiques, par profil) : créées/éditées/supprimées
  depuis l'app, affichées **à côté** des leçons prédéfinies, avec une **carte
  « + Ajouter une liste »**. Une liste = une leçon (mais avec les modes
  d'entraînement orthographe). Elles **s'accumulent** au fil de l'année (banque
  de mots, réutilisable).

> Conséquence d'architecture : la catégorie Orthographe doit **fusionner** des
> leçons **statiques** (`as const`) et des leçons **dynamiques** lues depuis le
> profil. Le catalogue (`src/core/catalog.ts`) devra accepter une source de
> leçons dynamique, pas seulement des données figées.

### Modèle de données — mots à ID, listes par références
**Chaque mot a un ID stable** ; les **listes référencent des ID de mots**. Ainsi
un mot présent dans plusieurs listes hebdo **partage tout son historique**
(entourage, « comme dans », validation, révision). La **banque de l'année** =
**tous les mots uniques** des listes **+** les mots **« en dur »** des leçons
prédéfinies — c'est le dictionnaire de mots lui-même, **pas un store séparé**.

Esquisse TypeScript (à affiner) — état d'un profil, `src/core/orthographe/types.ts` :
```ts
type ModeOrtho = 'regardeCacheEcris' | 'tuiles' | 'dictee';

/** Entourage tracé par l'enfant dans l'atelier : plage de lettres + couleur. */
interface Entourage {
  debut: number;   // index de la 1re lettre (sur le mot normalisé)
  fin: number;     // index de la dernière lettre (incluse)
  couleur: number; // index dans la palette colorblind-safe
}

/** État de répétition espacée (escalier d'intervalles, voir §3). */
interface EtatRevision {
  palier: number;                    // 0 = neuf … 4 = acquis
  prochaineRevision: number | null;  // timestamp ms ; null tant que pas en banque
  reussites: number;
  dernierTest: number | null;        // timestamp ms
}

/** Un mot de la banque du profil. */
interface MotOrtho {
  id: string;                        // stable ; dédup par forme normalisée
  mot: string;                       // forme correcte exacte (NFC) = référence de vérif
  commeDans?: string;                // phrase d'exemple (dictée)
  homophone?: boolean;               // exige « commeDans » en dictée
  entourage: Entourage[];            // marquage de l'enfant (sauvegardé)
  atelierFait: boolean;              // l'atelier de découverte a-t-il été fait ?
  validation: Record<ModeOrtho, boolean>;  // pour l'étoile de liste
  revision: EtatRevision;
  origine: 'liste' | 'predefini';
}

/** Une liste = une leçon dynamique, créée par le parent. */
interface ListeOrtho {
  id: string;                        // uuid
  label: string;
  dateControle?: string;             // ISO court, repère doux optionnel
  motIds: string[];                  // références vers la banque
  createdAt: number;
  updatedAt: number;
}

/** Tout l'état orthographe d'un profil — 1 clé localStorage préfixée `ludaskia_ortho`. */
interface OrthoState {
  banque: Record<string, MotOrtho>;       // id → mot (listes + leçons prédéfinies jouées)
  listes: ListeOrtho[];                    // listes du parent
  motIdParForme: Record<string, string>;  // index dédup : forme normalisée → id
}
```

Données **statiques** des leçons prédéfinies — `src/data/francais/orthographe.ts` :
```ts
interface MotPredef { mot: string; commeDans?: string; homophone?: boolean }
interface LeconOrthoPredef {
  id: string;          // ex. 'fr-ortho-invariables-1'
  label: string;       // 'Mots invariables (1)'
  niveau: SchoolLevel; // 'ce2'
  mots: MotPredef[];
}
declare const ORTHO_PREDEF: LeconOrthoPredef[]; // fourni par le mainteneur
```

- **Dédup / identité** : à l'ajout d'un mot (saisie parent **ou** 1er jeu d'une
  leçon prédéfinie), on cherche sa **forme normalisée** dans `motIdParForme` ;
  trouvée → on **réutilise l'ID** (historique partagé) ; sinon on crée le
  `MotOrtho`. Les mots d'une leçon prédéfinie sont donc **matérialisés dans la
  banque** au 1er usage (pour porter entourage/validation/révision par profil).
- **Banque de l'année** = `OrthoState.banque` (tous les mots uniques) ; pas de
  store séparé.
- **Vérification stricte** (cf. `design-multi-subject.md`) : `trim` + NFC ;
  **accents et apostrophes exigés**. La forme correcte = `mot`.
- **Catalogue** : la catégorie Orthographe liste `ORTHO_PREDEF` + `listes` du
  profil + carte « + Ajouter une liste ».
- **Moteur : étendre, pas mettre à part** (on évite un moteur parallèle) :
  1. **Élargir l'union `Exercise`** avec les **3 interactions** des modes
     validants — toutes **réutilisables** hors orthographe (ex. vocabulaire
     anglais) et toutes vérifiées **comme du texte** par `checkAnswer`
     (saisie/assemblage vs `answer`, `trim`+NFC) :
     - `motCache` (`{ answer }`) — *affiche/masque* : on montre le mot, on le
       cache, l'enfant le tape ;
     - `tuiles` (`{ answer; lettres[] }`) — lettres mélangées à ordonner ;
     - `dictee` (`{ answer; commeDans? }`) — rien d'affiché, lu en TTS.
     Les trois sont des **exercices pairs** (générés par `generate(mode)`, même
     `check`). Seul l'**atelier** reste hors `Exercise` (pas de `check`).
  2. **Génération *mode-aware*** : `ExerciseType` gagne un `generate(mode?)` (+
     liste optionnelle de `modes`), **rétro-compatible** (math/conjugaison
     ignorent `mode`). Un même mot produit ainsi N activités.
  3. **Orchestration dans un *runner* de session** (séquence atelier → tuiles →
     affiche/masque → dictée, déblocage, étoile, sélection par répétition espacée,
     boucle **faute → atelier**) : c'est **stateful et par mot** (lit/écrit
     `OrthoState`), donc **hors** `generate()/check()`. L'**atelier** y vit aussi
     car il **n'a pas de `check()`** (activité sans bonne/mauvaise réponse).

### Verbes dans les listes (#261)

Une liste mélange **mots classiques** et **verbes**. À la saisie d'un mot, l'app
**détecte** (au repos : debounce + `blur`) s'il s'agit d'un verbe via le lexique
**LEFFF** et propose, sans rien imposer, un panneau de paramétrage : multi-sélection
des **pronoms** (`je tu il nous vous ils` — pas de `elle/elles`, accords de genre) ×
des **temps** (présent en v1, UI prête pour d'autres), + un **complément** facultatif.

- **Stockage** : la liste porte `verbes: VerbeConfig[]` (`{ infinitif, pronoms[],
  temps[], complement? }`), à côté de `motIds`. Les mots classiques sont inchangés.
- **Jeu** : au lancement du parcours (frontière **async** dans le runner UI), chaque
  verbe est **résolu** via LEFFF puis **matérialisé** en une cible `MotOrtho` par
  couple (pronom × temps) — id namespacé `v:<clé>#<temps>#<personne>`, **jamais**
  indexé par forme (les homophones *je/il* « mange » restent distincts ; pas de
  collision avec la banque de mots). La cible porte un `contexte { avant, apres }`
  (« il … une pomme ») affiché en **phrase à trou** dans les 4 activités ; le TTS lit
  la **phrase complète** (lève l'ambiguïté phonétique /mɑ̃ʒe/). La cible se rejoue
  comme un mot (atelier → tuiles → mot caché → dictée), et persiste sa progression.
- **Réponse** = la forme conjuguée seule (`mange`) ; le contexte n'est jamais comparé.
- **Limites connues** : complément **fixe** à travers les personnes (peut sonner
  étrange avec *nous/vous*) ; un verbe à N couples compte pour N cibles (relecture,
  `nbMots`). Hors v1 : autres temps, phase de découverte du paradigme.

#### Bibliothèque LEFFF (build-only + lookup paresseux)

`src/data/francais/verbs-lookup.ts` (`lookupConjugatedForms`, `estVerbe`) lit des
**shards JSON** pré-générés (`src/data/francais/verbs/`) par
`tools/verbs/generate-verbs.mjs` (`npm run verbs:gen`) à partir des devDependencies
`french-verbs` + `french-verbs-lefff`. Un **manifeste** de clés-frontières localise le
shard par **dichotomie**, puis `import.meta.glob('./verbs/verbs-*.json')` charge **un
seul** shard à la demande (chunk Vite séparé, ~34 Ko, mis en cache).

- **Normalisation jumelée** (critique) : `normVerbKey`/`stripPronominal` et le **tri
  par comparaison de chaînes NFC brute** (jamais `localeCompare`) sont identiques côté
  script et côté runtime (test de cohérence sur l'ordre du manifeste).
- **Licences** : le **code** `french-verbs(-lefff)` est Apache-2.0 ; les **données** de
  conjugaison (et donc les shards dérivés livrés) restent **LGPLLR**. Le dataset brut
  (`conjugations.json`, ~6,3 Mo) **n'est jamais embarqué** — seules les formes du
  présent, dérivées et shardées, partent au client (cf. `verbs/ATTRIBUTION.md`).

### Les 4 activités (dont 3 « validantes »)

| Activité | Rôle | Notée ? |
|---|---|---|
| **Atelier du mot** | Découverte : l'enfant *travaille* le mot (entoure les pièges) | **Non** (exploration) |
| **Regarde-cache-écris** | Encodage : on montre, on cache, l'enfant saisit | **Oui** |
| **Tuiles** | Orthographe sans le coût moteur du clavier (lettres à ordonner) | **Oui** |
| **Dictée TTS** | Ancrage : rappel sans indice visuel, mot dicté | **Oui** (si TTS dispo) |

**Parcours depuis une carte d'orthographe — ordonné, puis aléatoire.** Les modes
ne se lancent pas au hasard au début : il faut d'abord faire l'**Atelier**, puis
les **Tuiles**, puis **Affiche/masque** (Regarde-cache-écris), puis éventuellement
la **Dictée** (si TTS dispo). Une fois **tout débloqué**, les modes s'enchaînent
**aléatoirement** parmi tous **sauf l'atelier**.

**L'atelier revient à la correction.** À chaque correction — réponse **bonne ou
fausse** — on **réaffiche le mot façon atelier** : l'enfant revoit son entourage
et peut le **modifier** ; si c'était faux, le **diff** (saisie ↔ bonne
orthographe) lui montre où corriger (voir *Atelier du mot*). Orchestration
complète au **§ Runner — orchestration de session**.

### Atelier du mot
Méthode orthophonique : l'enfant **manipule** le mot lui-même (repérer/marquer
les pièges). C'est l'idée la plus forte du mode, et **le geste retenu est
« entourer »** (avis pédagogique : pointage **actif** — décider *où* est le
danger ancre le mot ; **surligner** englobe au lieu de pointer et reste passif →
ce n'est **pas** un outil de l'enfant).

**Écoute du mot (à la demande).** Comme les autres activités du parcours, l'atelier
affiche un bouton **« Écouter le mot »** (ou « Écouter la phrase » pour une cible
verbe) dès que l'appareil dispose d'une **voix FR** — en **découverte** comme à la
**correction**. Le mot étant affiché, l'entendre ne révèle rien : c'est un appui
**multimodal** (lien son ↔ graphie) qui aide à ancrer l'orthographe, et cela garantit
que l'enfant peut **(ré)écouter partout** dans le parcours, plus seulement sur les
écrans qui saisissent. Aucune voix → aucun bouton (pas de bouton mort). Rendu par
`renderAtelier` via l'option `ecoute` que lui passe le runner (`ecouteAtelier`).

**Présentation & consigne.** Le mot s'affiche **en gros**, au centre, **d'emblée
légèrement aéré** (espacement des lettres). Consigne incarnée (« étudie » est un
verbe d'adulte) :
> **« Regarde bien ce mot. Entoure les pièges : les endroits où on pourrait se
> tromper en l'écrivant. »**
- On dit **« les pièges du mot » / « pièges d'orthographe »**, **pas** « pièges
  d'écriture » (ambigu = calligraphie pour un enfant). Ne **jamais** employer
  « graphème » avec l'enfant (→ « des lettres qui vont ensemble pour faire un
  seul son »).
- **Amorçage par l'exemple** : **un seul** exemple **fixe et constant** (toujours
  le même, indépendant du mot du jour), type « Dans **renard**, on entoure le
  **d** qu'on n'entend pas. » Il illustre **le mécanisme**, pas la réponse — donc
  un éventuel recoupement de type de piège avec le mot du jour est **sans
  gravité**. (On **n'essaie pas** de choisir un exemple « sans piège commun » :
  indétectable de façon fiable sur des mots saisis par le parent.)
- **Mini-galerie optionnelle** « ce qui peut être un piège » (derrière un « ? »
  dépliable), un type par mot très banal : **lettre muette finale** (*d* de
  *renard*), **double consonne** (les deux *l* de *belle*), **groupe de lettres
  pour un seul son** (*eau* de *bateau*, *ph* d'*éléphant*, *ill* de *fille*),
  **accent** (*é* de *bébé*), **son piégeux** (*g* devant *e* dans *plage*).

Choix de conception :
- **Plusieurs entourages, autant que l'enfant veut, mais sans chevauchement** :
  un mot a souvent plusieurs pièges (*femme* = double *m* + le *e* qui sonne
  *a*) — **pas de limite rigide** sur leur nombre. En revanche un geste (tap ou
  glissé) dont la plage recouvre un ou plusieurs entourages existants les
  **retire** au lieu d'en ajouter un par-dessus (bascule) : deux entourages ne
  se superposent donc jamais. Garde-fous **doux** contre l'entourage
  « décoratif » : le geste a un **petit coût** (sélection lettre par lettre =
  frein naturel) ; une **relance verbale optionnelle** si l'enfant entoure
  beaucoup (> ~⅔ des lettres) — « Tu es sûr que tout est un piège ? » — **une
  fois, jamais bloquante** ; et surtout le **« on regarde ensemble ? »** qui
  régule par autocorrection.
- **Couleurs attribuées automatiquement par l'outil** (l'enfant ne choisit
  **pas** : éviter qu'il se focalise sur la couleur ou en prenne de trop proches
  qui se confondent). **Sans aucune sémantique** : une **couleur différente par
  entourage**, juste pour les **distinguer visuellement** — l'enfant n'a **rien à
  comprendre** du code couleur (donner un sens aux couleurs = une grammaire de
  plus à mémoriser ; et l'outil ne sait pas *pourquoi* l'enfant entoure). On **ne
  regroupe pas par type**. En pratique : un **pool de 5-6 pastels** assignés **en
  rotation** (un mot a rarement beaucoup de pièges → on en voit peu à la fois ; un
  pool plus large évite surtout que deux entourages voisins tombent sur la même
  teinte), pris dans une base **colorblind-safe** (Okabe-Ito offre ~7 teintes
  distinctes), bien **contrastés entre eux** ; chaque entourage = fond translucide
  **+ trait fin** (reste visible quand les fonds se mélangent → jamais la teinte
  seule).
- **Pas de code « un trait / deux traits / ondulé »** (arbitraire et confus à
  8 ans ; le double-soulignement relève de la grammaire, plus tard). Le
  **soulignement simple** reste en réserve pour une v2.
- **Pas de « modèle expert » auto sur les mots du parent.** Sans LireCouleur ni
  source de vérité, on ne sait pas quelles lettres sont « les pièges » d'un mot
  saisi librement → **pas de corrigé automatique** de l'entourage. À la place,
  **c'est la faute réelle de l'enfant qui corrige son entourage** :
  - **On sauvegarde l'entourage** de l'enfant (par mot).
  - Quand il **se trompe** en écrivant le mot (Regarde-cache-écris / Tuiles /
    Dictée), on lui montre **où** il a divergé de la bonne orthographe (**diff
    caractère par caractère** saisie ↔ réponse, façon git — la réponse est connue,
    fournie par le parent ; **lib MIT** type `fast-diff` : un diff naïf
    position-par-position se casse dès qu'il y a une insertion/suppression qui
    décale tout → on veut un vrai **alignement** (Myers)) **à côté de son
    entourage sauvegardé**. Il peut alors **corriger/compléter
    son entourage** : « tu avais repéré ce piège ✓ » ou « ajoute-le ». **L'erreur
    devient le professeur**, pas un modèle imposé.
  - **Pas de note, pas de rouge** ; l'entourage de l'enfant ne **disparaît
    jamais** (ce serait une correction déguisée).
  - Pour les **leçons prédéfinies** qu'on rédige (invariables/irréguliers), on
    *pourrait* fournir un **marquage de référence optionnel** (là on maîtrise les
    mots) — pas indispensable.

Piste technique :
- **Texte réel en spans DOM** (une lettre = un `<span>`) → accessible,
  responsive. **Pas de canvas raster** (non accessible, hit-testing manuel).
- **Sélection lettre par lettre, mais qui doit pouvoir attraper un GROUPE de
  lettres** (*eau*, *ill*, *ph*) — sinon tout un pan de pièges (un son écrit avec
  plusieurs lettres) devient inaccessible. Pas de tracé libre (cercle propre trop
  dur à la souris/au doigt pour un CE2).
- **« Défaire » ultra-simple, par bascule** : un geste dont la plage recouvre un
  entourage (ou plusieurs) le retire au lieu d'en ajouter un nouveau — pas de
  bouton « annuler » séparé (la sélection va rater à 8 ans → sans annulation
  facile, frustration immédiate). Pendant le geste, l'entourage visé par le
  retrait s'aperçoit en pointillé (jamais la seule couleur comme indice).
- **Espacement des lettres constant, pas réactif** : le mot s'affiche aéré
  **dès le départ** (place pour l'ellipse) et **ne bouge plus** (un mot qui
  « bouge » sous le geste déstabilise). Espacement **< un vrai blanc-mot** (sinon
  l'enfant lit *re nard*). L'aération aide plutôt la lecture à 8 ans (et les dys).
- **Couche SVG en surimpression** : chaque entourage = un **rectangle arrondi**
  (la **boîte englobante** des lettres sélectionnées → géométrie triviale et
  propre pour les groupes ; préféré à l'ellipse) ; fond translucide + trait fin ;
  **plusieurs rectangles indépendants**, mais **sans chevauchement possible**
  (la bascule retire un rectangle recouvert plutôt que d'en superposer un
  second). Texte gardé en DOM (hybride DOM + SVG).
- **Pré-coloration syllabique automatique** en **décor pastel** (toile de fond,
  pas un outil de l'enfant) ; ne **jamais** pré-marquer les pièges.

Valeur & finalité : c'est **d'abord l'attention** (décider où est le piège) qui
ancre le mot ; le **geste ajoute une trace motrice**, mais seulement s'il suit la
décision (d'où « jamais de coloriage auto des pièges », « validation après
l'essai »). **L'atelier est une préparation, pas une fin** : l'enchaînement
**« j'entoure → j'écris le mot → (si faute) je corrige mon entourage »** doit
rester lisible, sinon la trace ne se transfère pas à l'écriture.

### Dictée TTS — best-effort
- **Web Speech API `SpeechSynthesis`** (gratuit, côté client). **Non garanti** :
  Firefox Android n'a pas de synthèse, Chrome/Linux 0 voix, iOS Safari fragile,
  appareils sans pack FR.
- **Détecter une voix FR locale** (`localService === true`, `lang` `fr-*`) au
  chargement (`getVoices()` + `voiceschanged` + timeout ; liste vide = cas
  normal). Sinon **désactiver proprement** le mode (bouton grisé + message).
- **Vie privée / hors-ligne** : préférer les voix **locales** ; les voix « Google
  français » sont **distantes** (texte envoyé à un tiers, réseau requis) → à
  filtrer.
- **Format « mot… comme dans : {phrase} »** : le parent saisit le mot et un champ
  **« comme dans… »** ; la dictée lit p. ex. « vers… comme dans : je vais vers la
  maison ». Bonne pratique reconnue **et** ça lève l'ambiguïté des **homophones**
  + compense la mauvaise prononciation d'un mot isolé.
- **Drapeau `homophone`** : déterminé via une **bibliothèque interne** d'homophones
  fréquents (CE2) ; si le mot en fait partie, le **« comme dans » est exigé** pour
  activer sa dictée (sinon elle serait ambiguë).
- Pièges à coder : `speak()` **dans un geste utilisateur** (sinon muet, iOS),
  `cancel()` avant chaque réécoute, **phrases courtes** (troncature ~200 car /
  15 s), `rate` réduit pour une diction lente, **réécoute illimitée**.
- **Pas de fallback TTS embarqué** : les options légères (eSpeak/meSpeak) sont
  GPL + robotiques ; la seule MIT correcte (Piper) pèse ~75 Mo. On **dégrade**,
  on n'embarque rien.
- **Module réutilisable** : cette brique TTS sert aussi au futur bouton **« lire
  la consigne »** (accessibilité) — à concevoir **générique** dès le départ.

### Étoile d'une liste / récompenses
- **Récompense par mot correctement orthographié**, comme les autres leçons
  (XP / compteurs existants). Mesurer la **réussite orthographique**, **jamais**
  la vitesse de frappe ; pas de chrono.
- **Étoile d'une liste** = avoir validé, **sur tous les mots**, les **2 modes
  fiables** (*Regarde-cache-écris* + *Tuiles*) — **plus la dictée** quand
  l'appareil dispose d'une **voix FR (TTS)**. Ainsi l'étoile reste atteignable
  partout (la dictée best-effort ne crée pas de cul-de-sac), tout en exigeant les
  3 modes là où c'est possible. La validation est stockée **par profil** (donc
  portable).

**Trophées (démarrer petit, étendre plus tard).** Via le mécanisme `tiers()`
existant, **cumulatifs et jamais perdus**, récompensant **effort + régularité**
(pas la perf brute) :
- **Collectionneur de mots** — mots « acquis » dans la banque (10 / 50 / 100 / 200).
- **Listes maîtrisées** — listes étoilées (1 / 5 / 10 / 20).
- **Chasseur de pièges** — mots travaillés à l'atelier (10 / 50 / 100).

Métriques à ajouter à `gSnapshot` : `motsAcquis`, `listesEtoilees`, `motsAtelier`.
On **évite** un trophée basé sur la **dictée** (dépendante de l'appareil).

### Saisie & ergonomie (point de vue de l'enfant)
- **La saisie clavier à 8 ans est le vrai goulot.** Une **faute de frappe ≠
  faute d'orthographe** : prévoir un **clavier d'accents à l'écran** (é è ê à â ç
  ô î ï û ù œ + apostrophe) et **distinguer dans le feedback** « accent manquant »
  d'une « lettre fausse ». La variante **Tuiles** existe justement pour tester
  l'orthographe **sans** le coût moteur : à la **1re tentative**, **lettres
  exactes** du mot (accents portés) ; **ensuite**, on ajoute **un ou plusieurs
  distracteurs** (lettres intruses) pour durcir progressivement.
- **Une tâche par écran** (ne pas empiler atelier + dictée + accents).
- **Erreur safe** : réexposition + 2e essai, jamais de mur ni de rouge.

### Désamorcer l'échéance scolaire
La liste vient de l'école et a une **date de contrôle** → source d'angoisse n°1.
- **Pas de compte à rebours anxiogène** ; au mieux un repère doux optionnel saisi
  par le parent (« contrôle prévu vendredi »).
- Formuler en **progression positive** (« 7 mots sur 10 déjà dans la tête »).
- Bilan « prêt pour le contrôle ? » **privé et bienveillant**.

### Ergonomie de saisie pour le parent (critique)
La saisie des listes est **hebdomadaire** : si c'est pénible, la fonctionnalité
meurt. Prévoir : **coller un bloc** (un mot par ligne), champ « comme dans… »
optionnel par mot, **réutiliser** une liste passée comme modèle, signaler quand
un mot homophone **nécessite** un « comme dans » pour la dictée.

### Runner — orchestration de session
La **logique de session** qui enchaîne les activités sur une liste (hors
`generate()/check()`). Elle lit/écrit l'`OrthoState`.

**Statut dérivé d'un mot** (depuis `atelierFait` + `validation`) :
- **nouveau** — atelier pas fait ;
- **en cours** — atelier fait, mais ≥ 1 mode validant non validé ;
- **maîtrisé** — tous les modes **requis** validés (`motCache` + `tuiles`, **+**
  `dictee` si TTS dispo).

**Deux écrans seulement** :
- **Atelier** — le mot en gros + entourages éditables. Deux usages : *découverte*
  (1re fois, sans diff) et *correction* (après un mode, **avec le diff** si faux).
- **Mode** — l'interaction `motCache` / `tuiles` / `dictee` + saisie + clavier
  d'accents.

**Choix de l'activité (par mot)** :
- nouveau → **Atelier (découverte)**, puis on enchaîne sur le 1er mode du mot ;
- en cours → **prochain mode non validé**, ordre **tuiles → motCache → dictee**
  (dictée **sautée** si TTS indispo) ;
- maîtrisé → mode **aléatoire** parmi les modes validants dispo (entretien).

**Choix du mot (session d'une liste = cram hebdo)** : priorité aux mots **non
maîtrisés** de la liste (ordre de la liste), puis aux **maîtrisés** en entretien.
(La **répétition espacée** — issue 4 — réutilise le même tour mais sélectionne les
mots **dus** dans toute la banque, sans cram.)

**Phase de découverte (#69)** : tant qu'**au moins un mot** de la liste n'a pas eu
son atelier (`decouverteEnCours`), le parcours ne propose **que des ateliers** —
toute la liste est découverte **avant** le moindre entraînement (l'enfant doit
voir tous ses mots vite : la 1re dictée tombe dès le lendemain). La pause de
séance (`SEANCE_MAX = 8`) propose **Continuer / Revenir**, donc un enfant motivé
peut finir la découverte d'une longue liste d'une traite.

**Choix du mode depuis la liste (#69)** : une fois la liste **découverte**, taper
la liste ouvre un **écran de choix** : le **parcours complet** (conseillé, **seul à
valider les modes → l'étoile**) ou un **mode ciblé** (`tuiles` / `motCache` /
`dictee`) pour s'entraîner librement. Le mode ciblé donne de l'**XP** mais
**ne valide pas** (`validation` inchangée) : l'étoile reste liée à la **suite
ordonnée**. Tant que la découverte n'est pas finie, on lance directement le
parcours (pas de choix).

**Déroulé d'un tour** :
1. **Activité** : Atelier (édition d'entourage) **ou** `generate(mode)` →
   `Exercise` → saisie (clavier d'accents) → `check`.
2. Sur un mode raté : **2e essai** après réexposition ; on **distingue** « accent
   manquant »/« faute de frappe » d'une vraie faute (via le diff).
3. **Correction = écran Atelier** (bon ou faux) : le mot s'affiche, l'enfant
   **revoit/ajuste son entourage** ; si faux, le **diff** (saisie ↔ `mot`) montre
   où corriger.
4. **Mises à jour `OrthoState`** : `validation[mode]` (si réussi), `revision`
   (palier/date), **XP +1** (une fois par mot correct), `atelierFait`.
5. Mot/activité suivant, jusqu'à la fin de session.

**Fin de session** :
- **Étoile de la liste** dès que **tous** les mots ont les modes **requis** validés.
- **Bilan « prêt pour le contrôle ? »** positif et **privé** (« 8 mots sur 10 bien
  dans la tête »), **sans** compte à rebours.

**À fixer** (cf. Points ouverts) : le critère de réussite qui valide un mode
(1 réussite ? 2 ?). v1 envisagée : **1 réussite valide le mode**, l'**entretien**
(répétition espacée) assurant le renforcement.

### Relecture — « Je relis mes mots » (#80, implémenté)
Une page d'**étude passive**, **distincte des modes d'entraînement** et de la
révision espacée : elle affiche **tous les mots d'une liste sur une seule page**,
chacun avec **les entourages tracés par l'enfant** (mêmes couleurs / même rendu
SVG que l'atelier). Sa valeur pédagogique est la **mémoire visuelle** des pièges,
en **complément** (jamais en remplacement) des modes qui *testent* l'orthographe.

- **Pas un exercice** : aucune saisie, aucune vérification, **aucun XP, aucune
  étoile**, pas de chrono ni de confettis. La relecture seule **ne persiste rien**
  (`motsDeLecon` matérialise les prédéfinis en mémoire mais on **ne sauvegarde
  pas** au simple affichage).
- **Accès** depuis l'écran de choix de mode d'une liste (#69), via une entrée
  **« 📖 Relire mes mots »** posée **à part** des boutons de mode (identité
  « étude », sobre, *jamais* « conseillée ») — route `#ortho-revoir-<id>`.
- **Correction libre, optionnelle** : un **crayon discret par mot** rouvre
  l'atelier (`renderAtelier`, qui sait charger/sauver `mot.entourage`) ; au
  « Continuer », on **sauvegarde** et on revient à la relecture, recentrée sur le
  mot modifié. Un mot **sans entourage** s'affiche normalement (crayon
  « Entourer les pièges », mention douce « Pas encore de pièges marqués »).
- **Réutilisation, pas duplication** : `lettresMotHTML` (spans `.atelier-lettre`)
  et `dessinerEntourages` (tracé SVG lecture seule) sont **extraits de l'atelier**
  et partagés. Mise en page : grille mobile-first **1 → 2 → 3 colonnes**, mot à
  `1.8rem` (mobile) / `2.2rem` (tablette), défilement vertical assumé.

---

## 3. Révision espacée (chantier séparé — issue à part)

Distinction clé : la **répétition espacée** est une **stratégie de sélection**
(« quels mots sont dus aujourd'hui »), pas un format de session. Le **sprint**
est un format (5 min, chronométré). On **ne fond pas** l'un dans l'autre : la
révision sera un **mode à part**, en plus des bilans et du sprint.

Deux horizons à ne pas confondre :
- **Court terme — la liste de la semaine** (échéance = contrôle) : entraînement
  **resserré, quotidien**, vers le contrôle. **Pas** de répétition espacée ici.
  « Prêt » ≈ 2 réussites en dictée.
- **Long terme — la banque de l'année** : **répétition espacée** simple, escalier
  d'intervalles adapté CE2 (pas de SM-2 sophistiqué) :

  | Étape | Délai avant re-test |
  |---|---|
  | Mot rangé dans la banque | ~1 semaine |
  | Réussi | ~2-3 semaines |
  | Réussi | ~1 mois |
  | Réussi | ~2-3 mois → **acquis** |
  | **Échec** | recule d'**un** cran (pas à zéro) |

  Plafond **~10-15 mots de révision/jour** par-dessus la liste de la semaine ;
  si la banque déborde, on **étale**. Un mot « acquis » sort de la rotation active
  (gardé consultable, pour la fierté).

Généralisation possible (plus tard) : la même brique « éléments à réviser »
pourrait servir aux **maths** (tables). Hors scope du premier jet.

---

## Points encore ouverts

Les grands choix sont tranchés (ci-dessus). Restent des détails et une issue à part.

### Modèle & stockage — détails
- Forme exacte d'`Entourage` (plage `[début, fin]` + index de couleur) et
  d'`ÉtatRévision` (palier, prochaine date, compteurs).
- Clés `localStorage` par profil (dictionnaire de mots + listes) et **stockage des
  dates** (attention à `Date` côté tests Vitest).

### Catalogue dynamique
- Rendre la catégorie Orthographe capable de **mélanger** leçons prédéfinies +
  listes du profil → `catalog.ts` **const → fonction** lisant le storage ; uuid
  des leçons-listes.

### Enchaînement — détail
- Critère exact de **déblocage** du mode suivant (une réussite ? par mot ?) dans la
  séquence Atelier → Tuiles → Affiche/masque → Dictée.

### Atelier — interactions
- **Sélection multi-lettres** : tap pour composer puis valider, ou glisser sur une
  plage ? Espacement exact des lettres ; recalcul de la géométrie au
  redimensionnement.

### Tuiles & gamification
- **Tuiles** : doser les **distracteurs** (combien après la 1re tentative ? à
  partir de quand ?).
- **Premiers trophées** (proposition § *Étoile / récompenses*) + **métriques** à
  ajouter à `gSnapshot` ; **XP** compté **une fois par mot** (anti-farming).

### Coloration des consignes — issue séparée, basse priorité
- Transverse (accessibilité), **distincte** du module orthographe. Preuves
  **faibles** (cf. encadré § *Coloration des consignes*) → prioriser l'espacement
  et un **« lire la consigne » (TTS)** ; coloration syllabique en option réservée.
  Qualité de `syllabify-fr` à vérifier **seulement si** on la développe.

## Hors-scope / écarté
- **OpenDyslexic** (preuves insuffisantes ; espacement préféré).
- **Moteur LireCouleur 6 / portage WASM** (GPL v3, incompatible commercial).
- **TTS embarqué** (GPL+robotique ou trop lourd) ; **audio pré-enregistré**
  (mots arbitraires saisis par le parent).
- **Fusion révision ↔ sprint** ; **généralisation répétition espacée aux maths**
  (plus tard).

## Découpage pressenti en issues (pour mémoire, à ne pas créer tout de suite)
1. **Confort de lecture + TTS « lire la consigne »** (priorité normale) — police +
   espacement/taille (réglage profil) + bouton TTS de lecture de consigne
   (réutilise le module de dictée).
2. **Coloration des consignes** (basse priorité) — coloration syllabique
   optionnelle (`syllabify-fr` à vendoriser) ; preuves faibles.
3. **Mode Orthographe** — catalogue dynamique + listes parent + leçons prédéfinies
   (invariables/irréguliers) + atelier du mot + 3 modes validants + dictée TTS
   best-effort + saisie/clavier d'accents.
4. **Révision espacée** — mode dédié, banque + escalier d'intervalles.
