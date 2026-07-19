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

Découpé par responsabilité (#234, découpage #354) en un **orchestrateur** + six
modules de section, en graphe **étoile** : chaque section n'importe que
`encadrant-commun` (+ le core), sauf `encadrant-profils` qui dépend aussi de
`encadrant-pin` (referme son sous-panneau au changement de profil consulté) —
seule dépendance inter-sections. La logique de données (`core/encadrant-stats.ts`,
`core/encadrant-lock.ts`) est inchangée. Voix « vous », accent neutre (`encadrant.scss`).

- **`encadrant.ts`** — **orchestrateur** : point d'entrée `enterEncadrant`,
  câblage des listeners délégués posés une fois sur `#encadrantContent` (dispatch
  en chaîne vers les modules de section), `rerender` (aiguille porte / récupération
  / espace via `pinView()` du module pin) et `renderEspace` (compose l'espace à
  partir des modules ci-dessous).
- **`encadrant-commun.ts`** — module **feuille** (n'importe aucun autre module
  `encadrant-*`) : état de vue partagé (conteneur DOM, profil **consulté**) +
  registre des callbacks `rerender`/`renderEspace` (casse le cycle orchestrateur
  ↔ sections) + `telechargerBlob` (export, clé de récupération).
- **`encadrant-pin.ts`** — **verrou par code** : porte PIN + pavé numérique,
  écran de récupération, bloc « Code d'accès » des réglages ; possède l'état du
  verrou et la vue courante (`pinView()`, lue par l'orchestrateur).
- **`encadrant-progression.ts`** — **récap** par profil : chiffres-clés, graphe
  d'activité 7 jours (#319, bascule Total / Par type), maîtrise par catégorie (avec sa
  **frise d'évolution hebdomadaire par matière**, #397 — barres-capsules `--ok`, compteur
  de notions au-dessus des semaines non vides, semaine en cours distinguée, sans axe ni
  pourcentage), **historique des erreurs récentes** (#391, cf. `encadrant-erreurs.ts`
  ci-dessous), file « à revoir » ; handlers `activite-mode`/`epingler`/`imprimer`.
- **`encadrant-revision.ts`** (#423) — **récap du mode Révision espacée** par profil,
  affiché juste après le bloc ci-dessus : projette la file de répétition espacée (#45,
  lue par `core/encadrant-stats.ts:revisionProfil`) — palier courant + échéance relative
  par entrée, badge « acquis » pour les entrées sorties de rotation. Bascule **« Par
  catégorie »** (regroupement dépliable, même chrome que « Notions par catégorie ») /
  **« Par urgence »** (liste à plat, plus en retard d'abord) ; handler `revision-mode`.
- **`encadrant-reglages.ts`** — **réglages** sur le profil consulté : classe de
  référence + niveau par matière, aménagements « dys »/attention ; injecte le
  bloc PIN rendu par `encadrant-pin`.
- **`encadrant-profils.ts`** — sélecteur de profils en **consultation** (≠ bascule)
  + **gestion** réservée à l'adulte (renommer/avatar/réinitialiser/supprimer/créer),
  plus export/import de tous les profils.
- **`a-revoir-card.ts`** (#234) — carte d'accueil `#aRevoir` (modèle « leçon du jour »)
  affichant les leçons épinglées « à revoir » par l'encadrant, masquée si vide.

**Journal des erreurs (#391)** — deux modules distincts, hors des cinq de section
ci-dessus, plus `core/erreur-representation.ts` (logique pure, cf. [Logique
pure](core.md)) pour les formats composites :
- **`erreur-capture.ts`** — point d'entrée UNIQUE `capterErreur`, appelé par **tous les
  runners** à la correction d'une réponse fausse : met en forme l'énoncé lisible
  (`questionPourJournal` — `@` → « … », marqueur « exercice avec dessin ») et le libellé
  d'un choix QCM (`libelleChoix`, vue riche #200 si elle existe), puis délègue à
  `core/erreurs-journal.ts`. Ignore une erreur sans leçon rattachée ou sans énoncé
  affichable. Branché sur la fiche en saisie (`session.ts:verify`), le QCM
  (`lecon-qcm.ts`), le sprint (`sprint.ts`), les tuiles de numération
  (`lecon-tuiles.ts` — libellé de la tuile posée via `TuileController.reponse()`), le
  rangement (`lecon-ordre.ts` — `ordreErreur`), le tri par thème (`lecon-tri.ts` — une
  entrée par mot mal classé via `motsMalClasses`), la résolution de problèmes
  (`lecon-probleme.ts` — une entrée par sous-question ratée), « Clique sur le mot »
  (`lecon-clic-mot.ts` — une entrée par phrase ratée : mots choisis vs bon(s) mot(s)) et la dictée d'orthographe
  (`ortho-runner.ts` — le **premier essai raté** d'un mot ; libellé résolu via
  `labelLeconOrtho`, cf. `core/orthographe/lessons.ts`, l'id étant une **liste**
  d'orthographe et non une leçon du catalogue). Une opération posée (`session.ts`)
  est agrégée : les cellules-chiffres du RÉSULTAT (`Item.posedResult`) sont regroupées
  par grille et réduites à **une** entrée via `analyserResultatPosee`, jamais une par
  chiffre. **Détaché du seuil de 60 %** (`enough`, qui conditionne toujours l'XP) : les
  erreurs d'une fiche sont journalisées même sous ce seuil (c'est là que l'enfant
  décroche), via une garde dédiée `sessionErreursLoggees` (`ui/navigation.ts`),
  indépendante de `sessionRecorded`.
- **`encadrant-erreurs.ts`** — bloc « Ce qui a été difficile récemment » (`erreursHTML`),
  inséré par `encadrant-progression.ts` entre la maîtrise par catégorie et « à revoir » :
  groupé par leçon (`<details>` repliés, la plus récemment ratée en tête), dédoublonnage
  « vue N fois », bonne réponse mise en avant (jamais barrée). Le libellé du groupe résout
  d'abord une leçon du catalogue, sinon une liste d'orthographe (`labelLeconOrtho`), sinon
  l'id brut. Action « Épingler » (`data-act="epingler"`, même mécanique que « à revoir »)
  **masquée pour un groupe d'orthographe** : la file « à revoir » est catalogue-only.

## Modales & effets

- **`modal-a11y.ts`** — **mécanique a11y partagée des modales** (#235, extraite de
  `ui-modal.ts`) : `activateModal(overlay, opts) → release()` pose le **focus-trap**
  (Tab/Maj+Tab bouclent à l'intérieur), l'**arrière-plan `inert`** + scroll-lock, la
  **fermeture Échap** optionnelle (`onEscape` omis = **choix forcé**) et la
  **restauration du focus** au déclencheur. Le scroll-lock est **optionnel**
  (`lockScroll`, défaut `true`) : passer `false` garde focus-trap + `inert` mais laisse
  défiler la page — utilisé par le guide de première visite (#330, `ui/tour.ts`) pour
  amener chaque bloc surligné à l'écran (`scrollIntoView`). Source unique consommée par
  `ui-modal.ts` (uiAlert/Confirm/Prompt) **et** par toutes les modales statiques à contenu
  sur-mesure (`effects.ts`, `unlocks-view.ts`, `onboarding.ts`, `tour.ts`, voile de
  `version-check.ts`).
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
  gains). `announceRewards(niveauGagne, recompensesNiv, celeb)` factorise ce
  gate (niveau → sa modale, puis la générique ; sinon la générique seule) : il
  est la porte d'entrée commune des écrans de fin (leçon, bilan, sprint,
  parcours/révision ortho).
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
  `apparitionsSurprises()`. L'egg **« pluie de cookies »** (#336, famille `visible`) fait
  exception au reste : son rendu et son déclencheur vivent dans le module partagé `footer.ts`
  (ci-dessous), `eggs.ts` n'en expose que le versant ALBUM `recordCookieEgg` (range le souvenir
  au 1er clic, **côté app seulement** où l'album existe ; `main.ts` le passe comme callback à
  `initFooterCookie`). Styles dans `styles/eggs.scss`.
- **`footer.ts`** (#336) — **pied de page global**, module **PARTAGÉ** par l'app (`main.ts`)
  ET la vitrine (`vitrine.ts`). VOLONTAIREMENT sans dépendance à la couche stockage / profils /
  eggs (la vitrine est statique) : `fillFooterYear()` renseigne l'année du copyright dans les
  `[data-footer-year]` ; `initFooterCookie(onTrigger?)` câble l'emoji DISCRET `#footerCookie`
  (pas un bouton-CTA) et joue l'easter egg **« pluie de cookies »** `cookieRain()` (averse BORNÉE
  d'emojis 🍪 qui tombent, se posent en bas et **y restent** jusqu'à ce qu'on les croque — miettes
  projetées en gerbe ; idempotente tant qu'une averse est en cours, la couche est retirée quand le
  dernier cookie est croqué, ce qui réarme le déclencheur). `onTrigger` (optionnel) est appelé AVANT la pluie : l'app y passe
  `recordCookieEgg` (album), la vitrine ne passe rien. **Double garde mouvement réduit** lue
  **directement dans le DOM** (`html.anim-reduced` + `prefers-reduced-motion`, pour rester
  indépendant de la couche profils que la vitrine ne charge pas) → version posée sans chute, le
  clic restant récompensé. Couche `aria-hidden`, jamais bloquante (sous les modales). Styles dans
  `styles/footer.scss` (chrome `.site-footer` de l'app + emoji discret `.cookie-egg` partagé + pluie ;
  le `.v-footer` de la vitrine garde son chrome marketing dans `vitrine.scss`).
- **`unlocks-view.ts`** — vitrines de déblocages (issue #28) : barre de l'accueil
  (`renderRewardNav` : boutons « Récompenses » / « Trophées » avec compteurs),
  ouverture des **modales dédiées** `openRecompenses` (paliers de niveau : rangs,
  compagnon, avatars, thèmes — acquis ✓ / à venir 🔒) et `openTrophees` (collection,
  sortie de l'inline ; réutilise le rendu `.trophy`), et la **mascotte accompagnante**
  `mascotteBulleHTML(message, loop)` + `encouragementMascotte()` (bulle de BD).
- **`tour.ts`** (#330) — **guide de première visite** (couche UI ; contenu pur dans
  `core/tour.ts`). Trois pièces : `ouvrirMotParents(onClose)` — courte modale destinée à
  l'**adulte** qui installe (voix « vous », modale a11y standard) ; `lancerTour(opts)` —
  **tour enfant** guidé par la **mascotte** sur les 3 repères de l'accueil, chaque étape
  amenant le bloc à l'écran (`scrollIntoView`) et l'entourant d'un **halo lumineux**
  (`.tour-cible`) pendant que la mascotte parle dans un **encart fixe** en bas (région
  `aria-live`, TTS à la demande / auto si `lectureConsigneAuto`, bouton **« Passer »**
  visible à chaque étape) ; `maybeOnboarding()` — **orchestration du 1er lancement**. Le
  tour réutilise `activateModal` **sans verrou de défilement** (`lockScroll: false`) pour
  pouvoir faire défiler vers le bloc surligné, restaure le focus sur `#btnGuide`, et n'est
  **jamais réimposé** une fois vu/sauté (drapeau par profil). Styles dans
  `styles/tour.scss`. Rejeu à volonté par le bouton **« ? »** de l'accueil (`#btnGuide`),
  sans toucher au drapeau « déjà vu ».
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
  session. `setToolbar` porte un drapeau **`guide`** (#330) qui affiche le bouton
  **« ? »** (`#btnGuide`, rejeu du guide de 1re visite) — **accueil seulement**, comme
  `print` ne sort qu'en exercice. Il bascule aussi la classe **`body.session-active`**
  (#336 : vraie quand `currentMode !== null` ⇔ une session est en cours — exercice /
  sprint / révision), point de passage commun à tous les écrans ; le CSS masque alors le
  pied de page et une pluie de cookies résiduelle (« rien de distrayant en plein
  effort »). EXCEPTION : le runner d'orthographe (`showOrthoRunView`) est un écran
  d'effort qui **ne pose pas** `currentMode` → il ajoute la classe lui-même après
  `setToolbar`. **Écran de choix de mode** (#69) : `showModeChoice` (catalogue) /
  `showOrthoModeView` (ortho) — affiché quand une leçon expose plusieurs modes.

## Runners d'exercice

- **`lecon-runner-shared.ts`** (#344) — **squelette commun** des cinq runners
  ci-dessous : `leconProgressHTML(idx, total, libellé?)` (barre de progression, libellé
  surchargeable, ex. « Problème i / n »), `finishLeconRun(lessonId, ok, total)` (enregistre
  l'essai via `recordLessonRun` et renvoie l'issue) et `renderLeconResult(opts)` (écran de
  résultat commun — score, étoile, mascotte, récompenses de niveau via `announceRewards`).
  Chaque runner délègue sa fin de session à ce module au lieu de la dupliquer ;
  `lecon-probleme.ts` passe son lexique (`nom` / `nomPluriel`) via le paramètre optionnel
  `lexique`. `wireNext(actions, feedback, opts)` mutualise aussi la **fin de question**
  commune aux cinq runners : révèle le feedback, pose le bouton « Continuer ▶ » / « Voir
  mon résultat ▶ » (`opts.isLast`) et câble son clic (`opts.onNext`) + le focus. Le bouton
  n'a plus d'id propre (résolu via `actions.querySelector('button')`) — seuls les
  conteneurs `#…Actions` / `#…Feedback` de chaque runner restent des sélecteurs stables
  (repris par les specs e2e).
- **`tuile-interaction.ts`** (#345) — **widget « tuiles » mutualisé** pour les trois
  formats interactifs sans clavier. Point d'entrée unique :
  `bindTuileInteraction(root, spec, opts) → TuileController`. `spec` est un `TuileSpec`
  discriminé par `kind` :
  - `'tuile'` — amener **la** bonne tuile (signe `<`/`=`/`>` ou nombre) dans la case `@`
    de l'énoncé ;
  - `'ordre'` — ranger les tuiles-mots dans des **cases numérotées** (ordre alphabétique) ;
  - `'tri'` — trier les tuiles-mots dans **deux colonnes-thèmes** (champs lexicaux).
  Le binder remplace le placeholder `[data-tuile-mount]` dans `root` (insertion à plat,
  sans wrapper), câble TAP et glisser-déposer, et notifie la complétude via
  `opts.onState(complete)` pour que l'appelant active son bouton « Vérifier ». La méthode
  `verify()` du contrôleur renvoyé fige le widget, applique les marques ✓/✗ (couleur +
  icône, pour le daltonisme) et renvoie la justesse ; elle est **idempotente**. La méthode
  **`reponse()`** (#391) expose l'état final posé/proposé/placé (`TuileReponse`, discriminé
  par le même `kind`) — lue par le runner en cas d'échec pour journaliser une réponse
  lisible (cf. « Journal des erreurs » ci-dessous). La
  variante `opts.variant` (`'lecon'` | `'revision'`) adapte la classe de l'énoncé et
  l'enveloppe `.bignum` des grands nombres (#240). Ce module est **partagé** par les trois
  runners de leçon (`lecon-tuiles.ts`, `lecon-ordre.ts`, `lecon-tri.ts`) et par la
  révision (`revision.ts`), qui délèguent tous leur interaction au lieu d'en garder une
  copie locale — la révision affiche désormais les mêmes marques ✓/✗ que les runners
  (correction de la divergence antérieure à #345).
- **`appariement.ts`** (#392) — widget **« relier des paires »** par des LIGNES de
  liaison : deux colonnes de boutons-mots (mélangées **indépendamment**) + un calque
  SVG de courbes reliant les ancres, dessiné derrière les mots. `bindAppariement(root,
  spec, opts)` **ne passe pas par `tuile-interaction.ts`** (mécanique de tracé propre,
  incompatible avec les trois `kind` du binder mutualisé) — il **réutilise seulement**
  son contrat public `TuileController`/`TuileOptions` (mêmes `onState`/`verify()`) et
  la tuile `.tuile`, pour rester interchangeable côté runner. Interaction : **tap en
  deux temps** (taper un mot à gauche l'arme, taper un mot à droite trace le lien ;
  retaper un mot relié efface son lien) — fiable au doigt et **nativement clavier**
  (de vrais `<button>`, Entrée/Espace passent par `click`) — et **glisser-déposer en
  appoint** (souris, jamais l'unique voie, SC 2.5.7). `verify()` fige le widget et
  marque chaque lien ✓/✗ (couleur + pastille + trait plein/pointillé, jamais la
  couleur seule). Le SVG est `aria-hidden` (décoratif) : toute l'info de liaison est
  portée par les libellés des boutons + une live region ; les coordonnées sont
  mesurées **relativement au conteneur** (indépendantes du défilement) et un
  `ResizeObserver` les recalcule au redimensionnement/zoom (SC 1.4.4/1.4.10).
- **`lecon-qcm.ts`** — runner **QCM d'une leçon** (#69) : « une question à la
  fois », **feedback immédiat**, barre de progression, **sans chrono** ; enregistre
  via `recordLessonRun` (parité avec la saisie). Réutilise les composants `.sprint-*`.
  Affiche le champ optionnel **`explication`** de l'exercice QCM après la réponse
  (#110 : critère de substitution des homophones). Plusieurs **variantes de
  présentation** : consigne renforcée (#203, `consigne-renforcee.ts`), boutons-symboles
  de ponctuation (#204, `ponctuation-view.ts`), choix riches cliquables (#200,
  `choicesView`).
- **`lecon-qcm-multi.ts`** (#253) — runner **QCM multi-sélection** d'une leçon
  (« coche TOUTES les propriétés qui s'appliquent ») : une figure codée + **exactement 4**
  affirmations en **boutons-toggles** (`<button aria-pressed>`, case carrée ☐/☑ décorative,
  **toute la ligne** cliquable) empilés pleine largeur (`.sprint-choices--pile`). Bouton
  **« Valider »** désactivé tant que 0 case cochée ; **correction TOUT-OU-RIEN** (juste ⇔
  toutes les bonnes cochées ET aucune mauvaise) contre la liste **stockée** `correctes` de
  l'`Exercise` `type: 'qcmMulti'` (jamais recalculée). **Feedback 4 états** dédié
  (`.lqcm-multi-choice.is-hit`/`.is-missed`/`.is-false`, jamais recyclé de
  `.sprint-choice`) + badge global ambre/vert + synthèse ; ordre des propositions **stable**
  (a11y dyspraxie). Tour de **6 questions** (anti-empilement d'étoile). Routé par `runLecon`
  quand le mode produit un `qcmMulti` ; parité `recordLessonRun` ; TTS via
  `bindConsigneTts`/`bindItemTts`. Utilisé par la leçon `geo-cm1-figures-proprietes` en
  **mode non recommandé** (le mode recommandé reste un vrai/faux mono-réponse sur `lecon-qcm.ts`).
- **`lecon-tuiles.ts`** — runner **tuiles** d'une leçon de numération (#98) : même
  forme « une question à la fois » que le QCM, mais l'enfant **pose une tuile**
  (signe/nombre) dans l'emplacement par **tap ou glisser-déposer** ; parité
  `recordLessonRun`. Runner d'écran dédié (routé par `runLecon` quand le mode produit
  un `tuilesNombre`) — **n'altère pas** le moteur de tuiles de l'orthographe.
  Délègue l'interaction à `tuile-interaction.ts` (#345, `kind: 'tuile'`).
- **`lecon-ordre.ts`** — runner **« ranger une suite »** d'une leçon de vocabulaire
  (#108, ordre alphabétique). Même forme « une question à la fois » : l'enfant
  **tape** une tuile-mot du bac → elle se place dans la prochaine case **numérotée**
  de la rangée-réponse ; **taper** une tuile posée la renvoie au bac (les suivantes
  se re-tassent) ; glisser-déposer du bac vers la rangée en appoint. Feedback
  immédiat case par case (✓/✗) + bon ordre montré ; parité `recordLessonRun`. Routé
  par `runLecon` quand le mode produit un `tuilesOrdre`. Interaction validée côté
  UX enfant (tap fiable au doigt, drag en appoint). Délègue l'interaction à
  `tuile-interaction.ts` (#345, `kind: 'ordre'`).
- **`lecon-tri.ts`** — runner **« ranger par thème »** d'une leçon de vocabulaire
  (#114, champs lexicaux). « Une question à la fois » : l'enfant trie des
  tuiles-mots **fournies** dans **deux colonnes-thèmes** par **tap en deux temps**
  (taper une tuile la sélectionne, taper une colonne l'y dépose) ou glisser-déposer ;
  **taper** une tuile posée la renvoie au bac. Feedback immédiat tuile par tuile
  (✓/✗) + bon classement montré ; parité `recordLessonRun`. Routé par `runLecon`
  quand le mode produit un `tuilesTri`. Calqué sur `lecon-ordre.ts`. Délègue
  l'interaction à `tuile-interaction.ts` (#345, `kind: 'tri'`).
- **`lecon-tableau.ts`** — runner **« tableau de conversion »** d'une leçon de
  mesures (#394, 2ᵉ mode de longueurs/masses/contenances, jamais les durées) :
  « une question à la fois », l'enfant remplit **une case par chiffre** (colonnes
  `TableauColonne[]` de l'exercice, tête à 2 chiffres déployée en 2 cases) via un
  **pavé de chiffres externe** dédié (jamais de clavier natif ni de tap direct dans
  une case étroite) — case active surlignée, **avance automatique**, navigation
  clavier ← →, validation bloquée tant qu'une case est vide ; corrigé **case par
  case** (comme la grille posée). Colonnes de transit (unité non étudiée au
  niveau) signalées par un en-tête démoté + case en pointillés (jamais
  grisées/désactivées), et une virgule fixe insérée par l'app pour les paires
  décimales CM1 (`virguleApres`). Parité `recordLessonRun` (XP/étoiles) et aide
  contextuelle (`core/aide.ts`/`aide-exercice.ts`, type `tableau`) comme les
  autres runners dédiés. Routé par `runLecon` quand `generate(mode).type ===
  'tableauConversion'` ; n'a de sens qu'en complément du mode `saisie`
  (`ui/navigation.ts` propose les deux via `ModeOption`), jamais en remplacement.
- **`lecon-appariement.ts`** (#392) — runner **« appariement »** d'une leçon de
  vocabulaire, « une manche à la fois » (5 manches, **distinctes** — dédupliquées sur
  l'ensemble des mots de gauche). Délègue l'interaction au widget mutualisé
  `ui/appariement.ts` (tap en deux temps + glisser en appoint). **Feedback différé** :
  le bouton « Vérifier » fige chaque lien (✓/✗) et révèle les bonnes paires en TEXTE
  sous le widget en cas d'erreur ; parité `recordLessonRun`. Structure calquée sur
  `lecon-tri.ts`. **Exclu du sprint** (`isPairingLesson`, comme la posée/l'ordre/le
  tri/le problème), avec un **repli texte** en bilan/fiche/révision (`genLessonItem` :
  une paire tirée au sort → « quel mot va avec X ? »). Aide contextuelle dédiée
  (`monterBoutonAide`/`maybeAutoAide`, type `'appariement'` #272).
- **`lecon-probleme.ts`** — runner **« Résolution de problèmes »** (#199), un
  problème à la fois. L'énoncé (`Exercise` `type: 'probleme'` : `enonce`, `etapes[]`,
  `parle`, `figure?` #95) reste visible avec **son bouton « Écouter »** (#42, `data-tts` = `parle`) ;
  **une** sous-question (problème simple) ou **deux** (problème à deux étapes —
  l'item multi-`@` arbitré par l'issue : sous-questions affichées d'emblée, étape 1 =
  intermédiaire, étape 2 = réponse finale). Chaque étape a sa réponse numérique
  (`data-answer`), corrigée indépendamment ; problème réussi si **toutes** ses étapes
  le sont. Parité `recordLessonRun`. Routé par `runLecon` via `generate(mode).type ===
  'probleme'` — **aiguillage sensible au mode** (#95) : un type mono-mode passe `mode`
  `undefined` et garde son comportement d'origine. Réponse **révélée** en cas d'erreur
  en **écriture à virgule française** (#255 : quatre leçons ouvrent des réponses
  décimales au CM1 — un entier reste inchangé). **Réutilisé en multi-mode** par la
  leçon de **division avec reste** `math-div-reste` (#95) : mode `saisie` = `probleme` à
  deux sous-questions (quotient + reste), mode `qcm` via `lecon-qcm.ts` ;
  `runLeconProbleme(id, mode?)` transmet le mode à la génération, et le runner adapte ses
  libellés via **`ExerciseType.probLexique`** (« Calcul » au lieu de « Problème », badge
  « Étape » masqué) — le lexique par défaut préserve les libellés #199. Même charpente
  (deux sous-questions, `probLexique`) pour la sœur **CM1** « division euclidienne »
  `math-division-euclidienne` (#251) et pour la **durée écoulée CM1** `mes-duree-ecoulee`
  (#252) : les trois leçons partagent la fabrique `deuxSousQuestionsType(...)`, désormais
  dans le module **`data/maths/_probleme-deux-sous-questions.ts`** ; seuls le libellé de
  saisie, les générateurs et le niveau diffèrent. Le runner rend aussi le champ optionnel
  **`probleme.explication`** après la réponse (stratégie du « pont » de la durée écoulée,
  #252 ; absent = feedback inchangé, comme pour la division).
  Les énoncés sont **générés par gabarits** (structures de Vergnaud) dans
  `data/maths/problemes.ts` : positions d'inconnue variées, pièges « mots-clés »
  loyaux et minoritaires, calibrage CE2 (additifs ≤ 1000, multiplicatifs dans les
  tables, division exacte). **Catégorie `math-problemes`**, **exclue du sprint**
  (`isProblemeLesson`, comme la posée). Repli texte (énoncé + question finale) via
  `genLessonItem` pour le bilan / la révision. La **question finale en gras** passe
  par la convention `**…**` rendue par `enonceTexte` (`core/items.ts`).
- **`lecon-clic-mot.ts`** (#259) — runner **« Clique sur le mot »**, une phrase à la
  fois. L'`Exercise` `type: 'clicMot'` (`data/francais/grammaire-clic-mot.ts`) porte
  `tokens[]` (la phrase mot à mot), `cibleIndices[]` (l'ensemble EXACT des indices du
  verbe conjugué, **stocké** à la génération), `consigne`, `explication`, `parle`. Chaque
  MOT est un `<button>` cliquable, la **ponctuation** un `<span>` inerte (`estPonctuation`).
  **Sélection multiple réversible** (`.is-selected`, aucune correction au 1er tap) ;
  « Vérifier » (désactivé tant qu'aucun mot n'est choisi) compare l'ensemble sélectionné à
  `cibleIndices` par **égalité d'ensembles exacte** (au **passé composé** CM1 le verbe fait
  **2 mots** : auxiliaire + participe). Feedback différé : mots marqués `.correct`/`.wrong`
  + pastille ✓/✗, **bon(s) mot(s) révélé(s)** dans la phrase (`.is-cible`, vert doux) même
  en cas d'erreur, `explication` sous la phrase ; chaque mot marqué `.correct` reçoit un
  flash `reussite-flash` (par mot, pas conditionné à un sans-faute global).
  Consigne **persistante** + **TTS** (`bindConsigneTts`) sur la consigne ET la phrase entière,
  journal via `capterErreur`. **Level-agnostic** : `generate({level})` tire dans la banque
  CE2 (temps simples) ou CM1 (+ passé composé, inversion nominale, CC en tête). **Exclu du
  sprint** (`isClicMotLesson`), **repli texte** en bilan/fiche/révision (`genLessonItem` :
  phrase → « quel est le verbe conjugué ? »). Structure calquée sur `lecon-appariement.ts`/
  `lecon-probleme.ts` (état de module + `lecon-runner-shared.ts`). Aide contextuelle dédiée
  (`monterBoutonAide`/`maybeAutoAide`, type `'clicMot'` #272).
- **`sprint.ts`** — mode sprint 5 min (compte à rebours, questions une par une),
  **filtrable** (toutes matières / une matière / une catégorie / **une sélection
  précise de leçons** via `startCustomSprint`, #64) via un écran de
  configuration ; correction par `checkItemAnswer` (numérique ou texte).
  **Exclusions du sprint** (`lessonsForFilter`) : par TYPE d'item (posée, tuiles
  ordre/tri, problème, appariement, clic-mot — détecté via l'étiquette déclarative
  **`ExerciseType.exerciseKind`**, #348, via les helpers `isPosedLesson`/
  `isOrderingLesson`/`isTriLesson`/`isProblemeLesson`/`isPairingLesson`/`isClicMotLesson` de
  `core/catalog.ts`) **et** par le flag déclaratif **`LessonDef.excludeFromSprint`** (#104) pour une leçon qui produit un
  item `text` ordinaire mais ne convient pas au chrono (figure de découverte,
  lecture d'énoncé — ex. « Je partage »). L'écran de config ne compte que les
  leçons **éligibles** (une catégorie entièrement exclue n'est pas proposée). Le
  réglage de profil **« sans pression temporelle »** (#223) masque le minuteur et le
  score ici et bascule la fin en mode doux — détaillé dans la section Accessibilité.
- **`session.ts`** (#349) — session d'exercice grille : vérification, saisie clavier,
  impression contextuelle (#40). Trois exports :
  - **`verify()`** — lit les champs `.ans` du DOM (dont la fusion « H h MM » des saisies
    d'heure, #88), construit une liste de `ScoredInput` (données pures, sans référence DOM),
    délègue le **calcul du score à `core/scoring.ts`** (`scoreItems`), puis marque les champs
    selon les `statuses` renvoyés (✓/✗ + révélation de la réponse) et rend le bandeau de
    résultats et les récompenses.
  - **`printAll()`** / **`printScope(scope)`** — impression contextuelle (#40) : chemin A
    imprime l'écran courant vierge (le CSS print met `.ans` en transparent) ; chemin B pose
    un périmètre que `beforeprint` rend via `buildPrintableDOM(scope)`. Le 🖨 de la barre
    n'apparaît qu'en exercice (drapeau `print` de `setToolbar`).
  - **`initSession()`** — câble les cinq écouteurs délégués globaux (effacement du marquage
    sur `input`, navigation clavier `keydown` ×2, impression `beforeprint`/`afterprint`).
    **Appelée une fois par `main.ts/wireDOM()`** (comme `installVisiblePasswordReveal`,
    `installGroupedNumberEcho`, `initEggs`…) : importer `session.ts` ne produit aucun effet
    de bord.
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
- **`pave-signes.ts`** (#380) — deux écouteurs **délégués** posés une fois
  (`installPaveSignes()`, appelé dans `wireDOM`, même modèle que `grand-nombre-echo.ts`)
  pour le **pavé de boutons-signes** `< = >` (rendu dans `core/signes.ts`/`core/items.ts`,
  champ `.ans-signe`) : un clic sur `.pave-signe` pose le signe dans le champ associé
  (`data-for`) puis émet un `input` (bulle) pour rejouer le chemin normal d'effacement du
  marquage de `session.ts` ; un second écouteur `input` synchronise `aria-pressed` des
  trois boutons du pavé, y compris à la frappe au clavier physique. Le focus **reste sur
  le bouton tapé** (pas de saut de vue ni d'ouverture de clavier virtuel). Styles dans
  `styles/pave-signes.scss`.
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
