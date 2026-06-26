[← Architecture Ludaskia](../ARCHITECTURE.md)

# Rendu & interactions (`src/ui/`)

Modules de **rendu et d'interactions DOM**. Regroupés ici par thème.

## Reprise & chrono

- **`chrono.ts`** — chronomètre croissant de la barre (sessions). `startChrono`
  accepte un temps initial + un drapeau de visibilité (reprise : on continue de
  mesurer **sans afficher** un compteur déjà avancé), `getElapsed()` expose le
  temps actif courant (capture d'une reprise).
- **`resume.ts`** — **couche UI de la reprise** (#63) : `captureResume` (lit
  `#sheets` + chrono et sauvegarde l'exercice en cours quand on le quitte),
  `restoreResume` (réinjecte l'instantané **sans régénérer** les calculs, chrono
  repris masqué), `renderReprises` (section **« À continuer »** : barre de
  progression visuelle, **« Continuer »** mis en avant, **« Effacer »** discret
  + confirmation), `maybeRelaunch` (à la relance d'un exercice déjà commencé :
  modale **« Continuer / Recommencer »**), et le **contexte de reprise** posé au
  lancement (`setResumeCtx`) / nettoyé à la fin (`finishResume`).

## Espace encadrant (rendu)

- **`encadrant.ts`** (#234) — rendu de l'**espace encadrant** (`enterEncadrant`) :
  porte PIN (pavé numérique), sélecteur de profils en **consultation** (≠ bascule),
  réglages (classe par UUID + code), et **récap** par profil. Listeners délégués posés
  une fois sur `#encadrantContent` ; voix « vous », accent neutre (`encadrant.scss`).
- **`a-revoir-card.ts`** (#234) — carte d'accueil `#aRevoir` (modèle « leçon du jour »)
  affichant les leçons épinglées « à revoir » par l'encadrant, masquée si vide.

## Modales & effets

- **`modal-a11y.ts`** — **mécanique a11y partagée des modales** (#235, extraite de
  `ui-modal.ts`) : `activateModal(overlay, opts) → release()` pose le **focus-trap**
  (Tab/Maj+Tab bouclent à l'intérieur), l'**arrière-plan `inert`** + scroll-lock, la
  **fermeture Échap** optionnelle (`onEscape` omis = **choix forcé**) et la
  **restauration du focus** au déclencheur. Source unique consommée par `ui-modal.ts`
  (uiAlert/Confirm/Prompt) **et** par toutes les modales statiques à contenu sur-mesure
  (`effects.ts`, `unlocks-view.ts`, `onboarding.ts`, voile de `version-check.ts`).
- **`ui-modal.ts`** (#230) — modales **custom accessibles** qui remplacent les dialogues
  natifs du navigateur : `uiAlert` → `Promise<void>`, `uiConfirm` → `Promise<boolean>`,
  `uiPrompt` → `Promise<string|null>` (remplacent **1:1** les appels bloquants
  `alert/confirm/prompt`), plus `toast(message)` (notification non bloquante). Centralise
  toute l'a11y (role `dialog`/`alertdialog`, focus-trap, Échap = Annuler **consommé**,
  clic extérieur = Annuler, `inert` + scroll-lock, TTS, confort de lecture) ; jamais
  « OK » en avant sur une action destructive.
- **`effects.ts`** — `sparkline` (SVG), `confetti`, modale `showCelebration`, et
  modale dédiée **passage de niveau** `showLevelUp`/`hideLevelUp` (médaillon doré
  animé ; un `then` optionnel enchaîne sur `showCelebration` s'il y a d'autres
  gains).
- **`aide-exercice.ts`** (#272) — couche **UI de l'aide contextuelle** (contenu dans
  `core/aide.ts`) des runners à mécanique non intuitive : `monterBoutonAide(conteneur,
  type)` pose un bouton « ampoule » persistant, `maybeAutoAide(type)` ouvre l'aide **au
  1er lancement** (une fois par profil, **jamais** en mode chronométré). Mini-modale a11y
  (`activateModal`) avec **animation faite-main** du geste (rejouable, figée sous
  `prefers-reduced-motion`) et TTS à la demande.

## Accueil, navigation & catalogue

- **`render.ts`** — rendus accueil/sélecteur/profils (`renderHomeStats` — qui
  appelle aussi `renderLeconDuJour` (#208) — et favoris, badge **niveau + barre**
  dans `renderToolbarProfile`, carte de progression `renderProgression` (sa bulle de
  mascotte porte le **défi du jour** : invitation, puis félicitations une fois
  accompli), `renderObjectives`, `renderLessons` + `lessonCardHTML` réutilisable,
  `renderProfileMenu`, `renderProfiles`, `boardHTML`/`sprintBoardHTML`,
  `pctColor`, config `REGULARITY`).
- **`lecon-du-jour.ts`** — carte **« leçon du jour »** de l'accueil (#208) : `#leconDuJour`
  est la **1re carte** de la rangée `.cards`, sur le **même modèle visuel** que les cartes
  de mode (pastille `.ico`, titre, descriptif, CTA), au contenu **dynamique**.
  `renderLeconDuJour` peint la carte du prochain pas (`core/lecon-du-jour.ts`) — pastille à
  la couleur de la matière, libellé de leçon, « matière · catégorie », « C'est parti → » —
  avec un bouton **« Voir une autre leçon »** (contournement `leconSuivante`, jamais de mur)
  et, tout acquis, une **félicitation + passerelle vers la révision**. La carte est cliquable
  (→ `startLecon`/`startRevisionEspacee`) via un listener posé **une seule fois** sur l'élément
  persistant ; l'état (leçon courante, mode) vit dans ses `data-*`, le contournement est
  **éphémère** (revenir sur l'accueil ré-affiche la vraie leçon du jour).
- **`eggs.ts`** (#331) — **rendu et déclencheurs** des easter eggs (logique pure dans
  `core/eggs.ts`). Tous ancrés sur l'**accueil**, jamais pendant un exercice / sprint /
  saisie : egg A « chatouiller la mascotte » (`initEggs` pose un listener délégué sur
  `#progression`, 3 taps rapprochés → cabriole `egg-giggle` + plumes), egg B « animal de
  la forêt » (`mountForestEgg` superpose un **hotspot tactile** au SVG décoratif `#homeForet`,
  appelé **après** l'injection du SVG dans `main.ts`, sans dépendre de sa structure), egg C
  « luciole » (`maybeShowAmbient`, apparition ambiante via `decideAmbient`, compteur **éphémère
  en mémoire** pour ne pas bumper la récence du profil). **Album** (`renderEggAlbumNav` peint
  l'accès `#eggAlbumNav` — **masqué tant que rien n'a été trouvé** —, `openEggAlbum`/`hideEggAlbum`
  modale a11y `activateModal`, n'affiche que les trouvailles, rejouables au tap). `onHomeShown`
  (appelé par `renderHomeStats`) rafraîchit l'accès à l'album et tente une apparition ambiante.
  **Garde-fous** : strictement gratuit (aucune XP/étoile/graine) ; visuels `aria-hidden`, jamais
  de vol de focus ; **double garde mouvement réduit** (`anim-reduced` OU `prefers-reduced-motion`,
  `mouvementReduit`) qui dégrade les eggs d'exploration en simple **changement d'état** (pas de
  particules) et **coupe l'ambiant** ; l'ambiant est aussi coupé par l'aménagement encadrant
  `apparitionsSurprises()`. Styles dans `styles/eggs.scss`.
- **`unlocks-view.ts`** — vitrines de déblocages (issue #28) : barre de l'accueil
  (`renderRewardNav` : boutons « Récompenses » / « Trophées » avec compteurs),
  ouverture des **modales dédiées** `openRecompenses` (paliers de niveau : rangs,
  compagnon, avatars, thèmes — acquis ✓ / à venir 🔒) et `openTrophees` (collection,
  sortie de l'inline ; réutilise le rendu `.trophy`), et la **mascotte accompagnante**
  `mascotteBulleHTML(message, loop)` + `encouragementMascotte()` (bulle de BD).
- **`cat-visuals.ts`** — visuels (icône + teinte de pastille) des matières et
  catégories, **source partagée** par `catalog-nav.ts` et `bilan.ts` (mêmes
  couleurs d'une catégorie d'un écran à l'autre).
- **`icon.ts`** — **icônes Phosphor** (graisse « bold » unique) intégrées en **SVG
  inline** : `icon(name)` renvoie le markup, la couleur suit `currentColor` (tokens
  `--ink`/`--ok`/`--ko`/`--accent`…), seules les icônes utilisées entrent au bundle
  (import `?raw`). Frontière d'usage : remplacent les emojis à **rôle fonctionnel**
  (boutons, navigation, états, pictos) ; le décor expressif (mascotte, avatars, rangs,
  médailles) **reste en emoji**. Noms typés dans `core/icon-names.ts`.
- **`catalog-nav.ts`** — navigation **Matière → Catégorie → Leçons**
  (`renderSubjects`, `renderCategories`, `renderCategorie`) ; l'écran d'une
  catégorie donne accès au bilan express (borné) / complet, au sprint, et à
  « Je choisis mes leçons » (bilan sur mesure scopé à la catégorie). `renderCategorie`
  **regroupe les leçons par `rubrique`** (#109 : titres de section, ordre
  d'apparition ; sans rubrique = rendu à plat). L'écran **sur-mesure** de
  l'orthographe (`renderOrthoCategorie`) **regroupe ses leçons `LessonDef` par
  rubrique** — **« Les accords »** (transformation #109), **« Les homophones »**
  (QCM #110) et **« Les règles »** (m/b/p, QCM #111), lancées par le parcours
  standard saisie/QCM — au-dessus de **« Les dictées de mots »** (mots de base
  prédéfinis + listes du parent, jouées par le runner ortho dédié).
- **`bilan.ts`** — **bilan personnalisé** : `renderBilanConfigScreen(el, categoryId?)`.
  En **global**, les leçons sont organisées **Matière → Catégorie → Rubrique** (#195) :
  matières en **volets repliables** (`<details>`), catégories à pastille/gouttière
  colorée, rubriques reprenant le registre de l'écran de catégorie ; chaque niveau
  porte une **case parent à 3 états** (`.bc-group-check`, cochée/partielle/décochée)
  qui (dé)coche tout son périmètre, et un **compteur « x/y »** (`.bc-group-count`).
  En **scopé** à une catégorie (via `#bilan-cat-<id>`), même regroupement par
  rubrique sans les volets matière. Choix **bilan / sprint** (#64 : `BilanConfig.mode`,
  défaut `bilan`), choix du nombre de questions par intention (cartes verticales
  `.bc-nbq-item`, icône agrandie ; masqué en sprint),
  favoris (`renderFavoris(el, categoryId?)`), exécution (`runBilanConfig`). Le
  mode sprint délègue à `startCustomSprint` (la sélection alimente le tirage).
  Un favori est **rattaché à une catégorie** (#65 : `BilanConfig.categoryId`,
  déduit des leçons cochées via `commonCategoryId` — mono-catégorie, même
  composé depuis l'accueil) : il s'affiche alors aussi sur l'écran de cette
  catégorie (`renderFavoris` filtré), en complément de l'accueil. Multi-catégories
  → accueil seul. Les favoris antérieurs à #65 sont **rattachés par backfill**
  (`bilans.ts:loadBilans` déduit `categoryId` de leurs leçons à la lecture, sans
  réécrire le stockage).
- **`navigation.ts`** — routing par hash (`route`), vues (`showHomeView`,
  `showMatieresView`/`showMatiereView`/`showCategorieView`,
  `showSprintConfigView`, `showBilanCustomView`, `showProfilesView`,
  `runComplet/Express/Lecon/Revision`), `setToolbar`, `afterStart`, état de
  session. **Écran de choix de mode** (#69) : `showModeChoice` (catalogue) /
  `showOrthoModeView` (ortho) — affiché quand une leçon expose plusieurs modes.

## Runners d'exercice

- **`lecon-qcm.ts`** — runner **QCM d'une leçon** (#69) : « une question à la
  fois », **feedback immédiat**, barre de progression, **sans chrono** ; enregistre
  via `recordLessonRun` (parité avec la saisie). Réutilise les composants `.sprint-*`.
  Affiche le champ optionnel **`explication`** de l'exercice QCM après la réponse
  (#110 : critère de substitution des homophones). Plusieurs **variantes de
  présentation** : consigne renforcée (#203, `consigne-renforcee.ts`), boutons-symboles
  de ponctuation (#204, `ponctuation-view.ts`), choix riches cliquables (#200,
  `choicesView`).
- **`lecon-tuiles.ts`** — runner **tuiles** d'une leçon de numération (#98) : même
  forme « une question à la fois » que le QCM, mais l'enfant **pose une tuile**
  (signe/nombre) dans l'emplacement par **tap ou glisser-déposer** ; parité
  `recordLessonRun`. Runner d'écran dédié (routé par `runLecon` quand le mode produit
  un `tuilesNombre`) — **n'altère pas** le moteur de tuiles de l'orthographe.
- **`lecon-ordre.ts`** — runner **« ranger une suite »** d'une leçon de vocabulaire
  (#108, ordre alphabétique). Même forme « une question à la fois » : l'enfant
  **tape** une tuile-mot du bac → elle se place dans la prochaine case **numérotée**
  de la rangée-réponse ; **taper** une tuile posée la renvoie au bac (les suivantes
  se re-tassent) ; glisser-déposer du bac vers la rangée en appoint. Feedback
  immédiat case par case (✓/✗) + bon ordre montré ; parité `recordLessonRun`. Routé
  par `runLecon` quand le mode produit un `tuilesOrdre`. Interaction validée côté
  UX enfant (tap fiable au doigt, drag en appoint).
- **`lecon-tri.ts`** — runner **« ranger par thème »** d'une leçon de vocabulaire
  (#114, champs lexicaux). « Une question à la fois » : l'enfant trie des
  tuiles-mots **fournies** dans **deux colonnes-thèmes** par **tap en deux temps**
  (taper une tuile la sélectionne, taper une colonne l'y dépose) ou glisser-déposer ;
  **taper** une tuile posée la renvoie au bac. Feedback immédiat tuile par tuile
  (✓/✗) + bon classement montré ; parité `recordLessonRun`. Routé par `runLecon`
  quand le mode produit un `tuilesTri`. Calqué sur `lecon-ordre.ts`.
- **`lecon-probleme.ts`** — runner **« Résolution de problèmes »** (#199), un
  problème à la fois. L'énoncé (`Exercise` `type: 'probleme'` : `enonce`, `etapes[]`,
  `parle`, `figure?` #95) reste visible avec **son bouton « Écouter »** (#42, `data-tts` = `parle`) ;
  **une** sous-question (problème simple) ou **deux** (problème à deux étapes —
  l'item multi-`@` arbitré par l'issue : sous-questions affichées d'emblée, étape 1 =
  intermédiaire, étape 2 = réponse finale). Chaque étape a sa réponse numérique
  (`data-answer`), corrigée indépendamment ; problème réussi si **toutes** ses étapes
  le sont. Parité `recordLessonRun`. Routé par `runLecon` via `generate(mode).type ===
  'probleme'` — **aiguillage sensible au mode** (#95) : un type mono-mode passe `mode`
  `undefined` et garde son comportement d'origine. **Réutilisé en multi-mode** par la
  leçon de **division avec reste** `math-div-reste` (#95) : mode `saisie` = `probleme` à
  deux sous-questions (quotient + reste), mode `qcm` via `lecon-qcm.ts` ;
  `runLeconProbleme(id, mode?)` transmet le mode à la génération, et le runner adapte ses
  libellés via **`ExerciseType.probLexique`** (« Calcul » au lieu de « Problème », badge
  « Étape » masqué) — le lexique par défaut préserve les libellés #199.
  Les énoncés sont **générés par gabarits** (structures de Vergnaud) dans
  `data/maths/problemes.ts` : positions d'inconnue variées, pièges « mots-clés »
  loyaux et minoritaires, calibrage CE2 (additifs ≤ 1000, multiplicatifs dans les
  tables, division exacte). **Catégorie `math-problemes`**, **exclue du sprint**
  (`isProblemeLesson`, comme la posée). Repli texte (énoncé + question finale) via
  `genLessonItem` pour le bilan / la révision. La **question finale en gras** passe
  par la convention `**…**` rendue par `enonceTexte` (`core/items.ts`).
- **`sprint.ts`** — mode sprint 5 min (compte à rebours, questions une par une),
  **filtrable** (toutes matières / une matière / une catégorie / **une sélection
  précise de leçons** via `startCustomSprint`, #64) via un écran de
  configuration ; correction par `checkItemAnswer` (numérique ou texte).
  **Exclusions du sprint** (`lessonsForFilter`) : par TYPE d'item (posée, tuiles
  ordre/tri, problème — détecté via `generate().type`) **et** par le flag
  déclaratif **`LessonDef.excludeFromSprint`** (#104) pour une leçon qui produit un
  item `text` ordinaire mais ne convient pas au chrono (figure de découverte,
  lecture d'énoncé — ex. « Je partage »). L'écran de config ne compte que les
  leçons **éligibles** (une catégorie entièrement exclue n'est pas proposée). Le
  réglage de profil **« sans pression temporelle »** (#223) masque le minuteur et le
  score ici et bascule la fin en mode doux — détaillé dans la section Accessibilité.
- **`session.ts`** — `verify` (correction + enregistrement), saisie clavier,
  impression contextuelle (#40) : **chemin A** `printAll()` imprime l'écran courant
  vierge (le CSS print met `.ans` en transparent) ; **chemin B** `printScope(scope)`
  pose un périmètre que `beforeprint` rend via `buildPrintableDOM(scope)`. Le 🖨 de
  la barre n'apparaît qu'en exercice (drapeau `print` de `setToolbar`).
- **`consigne-renforcee.ts`** (#203) — markup partagé d'une **consigne renforcée** (ligne
  en gras + picto décoratif `aria-hidden`, double codage) au-dessus de l'énoncé ; source
  unique réutilisée par `lecon-qcm.ts` **et** la révision (#265), portant la lecture TTS
  globale (consigne + phrase).
- **`ponctuation-view.ts`** (#204) — présentation partagée des signes de ponctuation
  finale : mapping glyphe → mot (`PONCT_MOTS`), vue riche `ponctView` (gros glyphe + mot,
  libellé accessible) pour les **boutons-symboles** de « Quel point à la fin ? » et les
  libellés lisibles en révision.
- **`brouillon.ts`** (#199) — **ardoise de dessin tactile** repliable (« J'ai besoin d'un
  brouillon ») pour poser un calcul (canvas au doigt/stylet, `touch-action: none`, mise à
  l'échelle `devicePixelRatio`) ; jetable, recréée vierge à chaque problème.
- **`anti-suggestion.ts`** (#67/#123/#139) — coupe la **barre de suggestions** prédictives
  des claviers mobiles (qui « souffle » la réponse) : les champs réponse naissent en
  `type="password"` (cf. `TEXT_ANSWER_INPUT_ATTRS`, `core/items.ts`) puis sont **démasqués**
  (`data-unmask`, « mot de passe visible » Android) avant focus par un observateur DOM global.
- **`grand-nombre-echo.ts`** (#327) — **écho groupé des grands nombres à la frappe** sur les
  champs **`.ans-grand`** (réponses numériques ≥ 10 000 des leçons « millions » CM1, #240).
  `installGroupedNumberEcho()` (appelé une fois dans `wireDOM`, modèle de
  `installVisiblePasswordReveal`) pose **deux écouteurs délégués** : `input` regroupe la valeur
  par classes de 3 (U+202F, via `grouperChiffresSaisis` de `core/nombres.ts`), **curseur préservé**
  (position raisonnée en *nombre de chiffres à gauche*, stable au reformatage) ; `beforeinput`
  intercepte Retour arrière / Suppr quand ils tombent sur un séparateur pour effacer le **chiffre
  voisin** (sinon la touche paraît morte). N'agit que sur des entiers (laisse passer une virgule/un
  point). La **correction est inchangée** : `nettoyerSaisieNombre` neutralise déjà les séparateurs.
- Les runners d'**orthographe** (`ui/ortho-atelier.ts`, `ortho-liste.ts`, `ortho-revoir.ts`,
  `ortho-runner.ts`) et leur moteur (`core/orthographe/`) sont décrits dans
  `docs/design-orthographe.md`.

## Menu, préférences, thèmes & accessibilité

- **`menu.ts`** — liste déroulante de profils (`open/close/toggleProfileMenu`),
  extrait pour éviter un cycle `main ↔ navigation`.
- **`preferences.ts`** — préférences cosmétiques **par profil** (issue #28) : thème
  d'affichage/couleur (`getTheme`/`setTheme`, gating par niveau) et réduction des animations
  (`animationsReduites`/`setAnimationsReduites`). `applyPreferences()` pose
  `<html data-theme>` + les classes `anim-reduced` / `confort-lecture` (appelé dans
  `route()` → couvre bootstrap et bascules de profil) ; `renderPreferences()` rend le
  bloc de l'écran Profils (thème, animations, **accessibilité**).

### Thèmes d'affichage (#224)

**Thèmes d'affichage (#224)** — un seul attribut `data-theme` porte deux familles
(cf. `core/unlocks.ts` `THEMES`) : les thèmes de **confort** (`confort: true`, `niveau: 1`,
jamais gatés ni récompensés) — **Forêt** (`defaut`, clair), **Nuit** (`nuit`, sombre fixe),
**Clair-obscur** (`auto`, suit le système) — et les thèmes de **couleur** débloqués par palier.
Étant à `niveau: 1`, les confort passent le garde-fou de `getTheme`/`setTheme` sans cas
particulier et `recompensesNiveau` (filtre `niveau > 1`) les ignore. `renderPreferences`
scinde le sélecteur en deux sections (« Apparence » sans cadenas | « Thèmes à débloquer »).
Le **mode sombre** (`styles/themes.scss`, mixins `nuit-palette`/`nuit-overrides`) **réécrit
les tokens de base** (`--paper`, `--ink`, `--ok`/`--ko`…) — assumé, contrairement aux thèmes
de couleur clairs — palette validée **WCAG AA**. Nouveaux tokens sémantiques dans `base.scss`
(`--on-accent`, `--line`, `--track`, `--ok-soft`, `--ko-soft`) pour que les composants suivent
le thème (fonds de cartes en `var(--paper)`, etc.). **Clair-obscur** n'est pas résolu en JS :
`@media (prefers-color-scheme: dark)` applique la palette sombre à `[data-theme='auto']`,
d'où une bascule **en direct** sans rechargement.

### Accessibilité (#42)

**Accessibilité (#42)** — deux aides transverses, réglées **dans la méta de profil**
(`Profile.prefs`, cf. `core/profiles.ts`) pour **survivre à « Réinitialiser »** (qui
n'efface que les clés de données) ; câblées dans `exportProfiles`/`importProfiles` et
bumpent `updatedAt` (`setPref`). (1) **Confort de lecture** (`confortLecture`) — classe
`<html class="confort-lecture">` ; le SCSS (`styles/accessibility.scss`) garde Nunito
mais augmente espacement + taille (figures SVG exclues). (2) **Bouton « Écouter la
consigne »** (TTS) — `ui/consigne-tts.ts` greffe un bouton après chaque consigne portant
un attribut `data-tts` ; le texte parlé est normalisé par `core/tts-text.ts`
(`texteParle`/`ttsAttr` : retire le `@`, traduit `+ − × ÷ =` en mots, strip HTML).
Lecture via `dicterConsigne` (`ui/tts.ts`, débit 0,92). **À la demande** ; **aucun bouton
si pas de voix FR** (`dicteeDisponible`) ; lecture **auto** opt-in (`lectureConsigneAuto`,
1re consigne seulement). Branché dans tous les runners d'exercice **sauf le sprint**
(QCM, tuiles, ordre, tri, révision, et la fiche/bilan via `afterStart`).

- **Dissociation affiché / lu** : un énoncé télégraphique (« pouvoir · présent — je @ »)
  est illisible tel quel à l'oral. Les générateurs peuvent donc poser un champ
  optionnel **`parle`** (sur `Exercise`, propagé à `Item` et lu en priorité par le bouton ;
  fallback `texteParle`). **Règle d'or** : `parle` ne contient **jamais** la réponse ni un
  indice — homophones et m/b/p y lisent **la consigne seule** (l'intonation/la nasale
  trahiraient la solution) ; comparaison, conjugaison, pronom sujet, accord sujet-verbe,
  classe, article reçoivent une **phrase reconstruite** qui nomme la tâche. Les options de
  QCM ne sont jamais lues (le `data-tts` ne porte que l'énoncé).
- **Consigne de la fiche** : `ExerciseType.consigne` (optionnel) nomme la tâche
  (« Conjugue chaque verbe au présent. ») et remplace le générique « Écris la forme
  correcte. » (`core/build.ts`).

### Sprint sans pression temporelle (#223)

**Sprint sans pression temporelle (#223)** — 3ᵉ préférence de profil
(`ProfilePrefs.sansPressionTemporelle`, accesseur `sansPressionTemporelle()`, toggle
`#prefSansChrono` « Masquer le minuteur » dans le bloc Accessibilité), pour les profils
dys/TDAH chez qui le décompte visible est anxiogène. Vit dans la méta (survit à
« Réinitialiser », exporté/fusionné avec le reste de `prefs`). Quand actif, `runSprint`
**n'affiche ni `#sprintTime` ni `#sprintScore`** (révélés seulement au bilan), recentre
le HUD (`.sprint-hud--calme`, ou pas de HUD du tout sans badge de filtre) et **ne pose
jamais `.low`** (pas de signal d'urgence). Le **temps continue d'être mesuré** : `sprintTick`,
les records/médailles/XP/objectif et `recordRun(…, SPRINT_MS)` sont **inchangés et communs**
(pas de classement séparé ; le temps ne départage jamais, `ms` constant). **Fin douce** :
à l'épuisement des 5 min, `sprintTick` pose `sprintTimeUp` et stoppe le ticker au lieu de
couper net ; la finalisation attend la **fin de la question en cours** (`sprintAnswer` /
`sprintContinue`). Réglage **non transverse** (propre au sprint), d'où un point distinct du
trio #42 ci-dessus.
