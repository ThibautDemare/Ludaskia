[← Architecture Ludaskia](../ARCHITECTURE.md)

# Rendu & interactions (`src/ui/`)

Modules de **rendu et d'interactions DOM**. Regroupés ici par thème.

## Reprise & chrono

- **`chrono.ts`** — chronomètre croissant de la barre (sessions). `startChrono`
  accepte un temps initial + un drapeau de visibilité (reprise : on continue de
  mesurer **sans afficher** un compteur déjà avancé), `getElapsed()` expose le
  temps actif courant (capture d'une reprise).
- **`resume.ts`** — **couche UI de la reprise** (#63, étendue aux runners #498) :
  `captureResume` tente d'abord un instantané **runner** (`snapshotRunner`, cf.
  `runner-reprise.ts` ci-dessous) ; sans session de runner active, elle lit
  `#sheets` + chrono et sauvegarde une **grille**. `restoreResume` distingue les
  deux natures (`snap.kind`) : un runner se **re-rend lui-même**
  (`restaurerRunner` — instantané orphelin, runner disparu depuis → efface et
  revient à l'accueil), une grille réinjecte l'instantané **sans régénérer** les
  calculs, chrono repris masqué. `renderReprises` (section **« À continuer »** :
  barre de progression visuelle, **« Continuer »** mis en avant, **« Effacer »**
  discret + confirmation), `maybeRelaunch` (à la relance d'un exercice déjà
  commencé : modale **« Continuer / Recommencer »**), et le **contexte de
  reprise** d'une grille posé au lancement (`setResumeCtx`) / nettoyé à la fin
  (`finishResume`).
- **`runner-reprise.ts`** (#498) — **reprise des runners « une question à la
  fois »** : `declarerSessionRunner` (posé par chaque runner au démarrage, neuf
  ou repris, avec un accès paresseux à son état — questions/idx/score relus au
  moment de la photo, pas copiés) et `enregistrerRunner(nom, restaurer)` (le
  runner s'enregistre **au chargement de son module**) alimentent
  `snapshotRunner`/`restaurerRunner` consommés par `resume.ts`. `quitterSessionRunner`
  (appelé par `resetSessionUI`, **après** la capture) clôt la session en cours
  sans effacer l'instantané — sans ça, l'état de module du runner quitté
  survivait à la sortie d'écran et `captureResume` rephotographiait
  indéfiniment une session morte, empêchant l'exercice suivant d'être
  sauvegardé. `finirSessionRunner` (fin d'essai) clôt **et** efface l'instantané
  stocké : plus rien à continuer. **Module FEUILLE, à dessein** (n'importe
  uniquement du `core/` et `./cat-visuals`) : les dix runners s'y enregistrent au
  chargement de leur propre module, donc ce registre doit être prêt avant eux
  quel que soit le point d'entrée. L'avoir hébergé dans un module participant au
  cycle d'imports de l'UI (navigation ↔ runners ↔ resume) produisait un
  `ReferenceError` au démarrage (registre pas encore initialisé, écran blanc) —
  un test verrouille l'invariant (« il s'importe seul, sans qu'aucun autre
  module UI ait été chargé avant »).

## Hors-ligne, mise à jour & rappel de sauvegarde (#306)

- **`app-calme.ts`** — **observateur PARTAGÉ** de « l'application est-elle
  calme ? », la même question que doivent se poser trois mécanismes bien
  distincts : la mise à jour (`mise-a-jour.ts`, qui recharge la page), le
  réchauffement du cache hors-ligne (`pwa.ts`, qui télécharge en fond) et le
  rappel de sauvegarde (`rappel-sauvegarde.ts`, qui affiche un encart).
  `ecranCalme()` (un conteneur « menu » est affiché — pas un exercice),
  `occupe()` (sprint/révision en cours), `inactifDepuisMs()`/`visibleDepuisMs()`
  s'assemblent en `etatCalme(enAttente?, dejaFait?)`, l'état que
  `canReloadNow` (`core/version.ts`, cf. [Build & déploiement](build-et-deploiement.md))
  attend — chaque appelant y applique SES propres seuils. `initAppCalme()`
  (appelé depuis `main.ts`, **avant** ses trois consommateurs) pose les
  écouteurs d'interaction/visibilité ; `onRetourSurOnglet(fn)` abonne un
  callback au retour sur l'onglet (le moment où l'enfant revient jouer).
- **`pwa.ts`** — enregistrement du service worker (`src/sw.ts`, via
  `virtual:pwa-register`/`workbox-window`) et **réchauffement de fond** du
  cache hors-ligne. `initPwa()` enregistre le worker, relance
  `registration.update()` périodiquement et au retour sur l'onglet (pour qu'un
  onglet resté ouvert longtemps découvre un nouveau déploiement), et programme
  `tourDeRechauffement()` (toutes les 20 s, par tranches de 3 fichiers) tant
  que la couverture n'est pas complète — sous réserve d'un **engagement réel**
  (`core/engagement.ts`), d'une application **calme** (seuils
  `SEUILS_RECHAUFFE`, plus exigeants que ceux de la mise à jour : télécharger
  occupe le réseau, pas juste recharger) et hors `saveData`. `onNeedRefresh`
  (événement `waiting` de `workbox-window` : une nouvelle version est
  installée et attend) relaie à `ui/mise-a-jour.ts:signalerVersionEnAttente` —
  cf. [Build & déploiement](build-et-deploiement.md) pour le mécanisme complet
  de bascule. Demande aussi, best-effort, la persistance du stockage
  (`navigator.storage.persist`, sans effet sur Safari/iOS).
- **`rappel-sauvegarde.ts`** — l'encart **« Pour les parents »** de l'accueil
  (installer sur l'écran d'accueil / exporter une sauvegarde), en **premier
  enfant** de `#home` (prolongement de la barre d'outils, jamais dans la grille
  de cartes), réglé sur le registre visuel de l'espace encadrant — jamais les
  couleurs/icônes d'alerte des exercices, jamais la mascotte, aucun décompte de
  jours visible (ce que ces trois choix pourraient laisser lire par-dessus
  l'épaule d'un enfant est explicitement écarté, cf. commentaire d'en-tête du
  module). `initInstallationPWA()` capte `beforeinstallprompt` (Chromium) pour
  proposer une installation en un geste ; ailleurs (iOS notamment), le bouton
  renvoie vers `guide.html#installer`. `rafraichirRappelSauvegarde()` (appelée
  à chaque arrivée sur l'accueil, **seul** écran où l'encart a le droit
  d'apparaître — ce qui garantit à lui seul le « jamais pendant un exercice »)
  applique la cadence de `core/rappel-sauvegarde.ts` et rend les trois actions
  (`masquer`/`exporter`/`installer`). La fermeture ferme pour le reste de la
  **session** (`sessionStorage`, clé `ludaskia_rappel_ferme`) sans condition, et
  fait monter d'un cran le report **durable** (`localStorage`) — sauf si un
  export a eu lieu entre-temps dans un autre onglet, auquel cas fermer ne
  défait pas la remise à zéro que l'export vient d'obtenir.

## Espace encadrant (rendu)

Découpé par responsabilité (#234, découpage #354) en un **orchestrateur** + huit
modules de section, en graphe **étoile** : chaque section n'importe que
`encadrant-commun` (+ le core), sauf `encadrant-profils` qui dépend aussi de
`encadrant-pin` (referme son sous-panneau au changement de profil consulté) —
seule dépendance inter-sections. La logique de données (`core/encadrant-stats.ts`,
`core/encadrant-lock.ts`, `core/seance.ts`) est inchangée. Voix « vous », accent
neutre (`encadrant.scss`).

L'orchestrateur compose désormais l'espace en **4 onglets** (#459, cf. [Espace
encadrant](espace-encadrant.md) pour la répartition détaillée des blocs) plutôt
qu'en une page qui empile toutes les sections : `renderEspace` rend un en-tête
de contexte (profil consulté) + une barre d'onglets + le panneau de l'onglet
actif, en piochant dans les fonctions de rendu exportées par les modules
ci-dessous.

- **`encadrant.ts`** — **orchestrateur** : point d'entrée `enterEncadrant`,
  câblage des listeners délégués posés une fois sur `#encadrantContent` (dispatch
  en chaîne vers les modules de section), `rerender` (aiguille porte / récupération
  / espace via `pinView()` du module pin), `renderEspace` (en-tête de contexte +
  barre d'onglets + panneau de l'onglet actif, #459) et `tabPanelHTML` (répartit
  les fragments des modules ci-dessous par onglet).
- **`encadrant-commun.ts`** — module **feuille** (n'importe aucun autre module
  `encadrant-*`) : état de vue partagé (conteneur DOM, profil **consulté**,
  **onglet actif** `EncTab`/`ENC_TABS`, #459) + registre des callbacks
  `rerender`/`renderEspace` (casse le cycle orchestrateur ↔ sections) +
  `telechargerBlob` (export, clé de récupération). Porte aussi le **wording partagé de
  l'échelle d'acquisition** (`MOT_NIVEAU`, `ORDRE_NIVEAUX`/`ORDRE_NIVEAUX_ORTHO`) : depuis
  #496, deux sections distinctes (`encadrant-progression.ts` et `encadrant-banque.ts`)
  affichent la même échelle, d'où son déplacement ici plutôt que dans l'une des deux.
  **`badgeClasseOrigine(niveau, infobulle?)`** (#556, révisé #571) — badge « classe
  d'origine » dont l'infobulle est **optionnelle** : fournie, le badge passe en
  `role="img"` + `aria-label` (préfixe, classe ET phrase), `title` conservé pour la souris ;
  absente, il reste **nu** (préfixe `sr-only` seul) pour les sites qui rendent déjà la
  phrase en clair à côté (cf. `encadrant-seance.ts` ci-dessous) — l'annoncer deux fois
  serait redondant.
- **`encadrant-pin.ts`** — **verrou par code** : porte PIN + pavé numérique,
  écran de récupération, bloc « Code d'accès » des réglages ; possède l'état du
  verrou et la vue courante (`pinView()`, lue par l'orchestrateur).
- **`encadrant-progression.ts`** — **récap** par profil (onglet **Suivi**) :
  chiffres-clés, graphe d'activité 7 jours (#319, bascule Total / Par type —
  composant segment partagé, cf. `segment.ts` plus bas), le bloc **« Travaillé
  récemment »** (#520 — module dédié `encadrant-travail.ts` ci-dessous), maîtrise par
  catégorie (chaque leçon du détail dépliable portant désormais sa **frise d'états sur 12
  semaines**, #521 — un seul `role="img"` par ligne, puce d'état omise sur ces lignes,
  dépliage global par matière), **historique des erreurs récentes** (#391, filtrable par
  période #476, cf.
  `encadrant-erreurs.ts` ci-dessous), et le bloc **« Dictées »** (#424 — listes de
  dictée d'orthographe, échelle à 3 niveaux) qui porte depuis #496 une **bascule
  « Listes » / « Mots »** : le volet Listes reste ici (`listesOrthoProfil`), le volet
  Mots (la banque du profil, recherche + suppression) est délégué au module dédié
  `encadrant-banque.ts` ci-dessous ; handlers `activite-mode`/`epingler`/`imprimer`/
  `dictees-vue`/`deplier-matiere` (#521, dépliage global des catégories d'une matière — cf.
  [Espace encadrant](espace-encadrant.md)), plus `erreurs-periode` (délégué à `erreursClick`, exporté par
  `encadrant-erreurs.ts`), `travail-periode` (délégué à `travailClick`, exporté par
  `encadrant-travail.ts`) et les actions `banque-*` (délégué à `banqueClick`/`banqueInput`,
  exportées par `encadrant-banque.ts` — même raison : c'est cette section qui compose leur
  bloc). Depuis #545, chaque ligne de liste porte en plus une **frise de composition**
  (`compositionHTML` — barre segmentée + dénombrement du jour ; `friseCompositionHTML` — repli
  des 12 dernières semaines, récit en texte visible) qui **remplace** l'affichage de la frise
  d'états sur ces lignes (`friseNotionHTML` reste réservée aux leçons du catalogue ci-dessus) —
  cf. [Espace encadrant](espace-encadrant.md) pour ce que cette frise mesure et les décisions de
  rendu.
  Expose aussi `aRevoirHTML` (file « à revoir ensemble », épinglées + suggestions
  + **retirées automatiquement** #465, ré-épinglables d'un clic) et
  `dicteesProposeesHTML` (dictées prédéfinies épinglables à l'avance), toutes
  deux rendues par l'orchestrateur dans l'onglet **Programme** (#459) plutôt
  qu'ici. Depuis #518, les épinglées portent le même badge d'état d'acquisition
  (`ligneRevoir`, option `etat`) que les suggestions ; depuis #556, une cible d'une autre
  classe que celle suivie porte en plus le badge « classe d'origine » (`origine`, avant
  l'état) et, si elle vient d'une classe AU-DESSUS, un compte-rendu FACTUEL
  (`essai`) plutôt qu'un état d'acquisition — cf. [Espace encadrant](espace-encadrant.md)
  pour les trois régimes. Depuis #571, chaque ligne **retirée automatiquement** porte de
  même son propre motif (`quandRetrait`, `RetraitAuto.motif`) plutôt qu'une phrase d'en-tête
  unique annonçant une maîtrise pour toutes : « de nouveau maîtrisée » / « essai réussi » /
  rien (trace d'avant #571) — cf. [Espace encadrant](espace-encadrant.md). `aRevoirHTML`
  compose enfin le sous-bloc **« Épingler une
  leçon »** (`epinglerHTML`) : le sélecteur de leçon partagé (ci-dessus), même action que
  l'épinglage inline du récap, mais ouvrant TOUT le catalogue — y compris les classes que
  l'enfant ne suit pas.
- **`encadrant-travail.ts`** (#520) — bloc **« Travaillé récemment »** (onglet **Suivi**),
  composé par `encadrant-progression.ts` (ci-dessus) entre le graphe d'activité et
  « Notions par catégorie » : nomme directement les leçons et dictées travaillées sur une
  fenêtre courte, là où le graphe compte des séances sans les nommer — projection pure
  dans `core/encadrant-stats.ts:travailRecent`/`travailRecentProfil` (cf. [Logique
  pure](core.md)), ici l'état de la fenêtre (sélecteur **1 / 2 / 7 jours**, défaut 7, sans
  « Tout »), le rendu groupé par matière et les handlers exportés
  `travailHTML`/`travailClick`. Détail fonctionnel dans [Espace
  encadrant](espace-encadrant.md).
- **`encadrant-banque.ts`** (#496) — volet **« Mots »** du bloc Dictées (onglet **Suivi**),
  composé par `encadrant-progression.ts` (ci-dessus) : la banque d'orthographe du profil
  consulté, mot par mot — projections pures dans `core/orthographe/banque.ts` (cf. [Logique
  pure](core.md)), ici l'état de vue (recherche, filtre « plus dans aucune liste », pagination
  par 50), le rendu et les handlers exportés `banqueClick`/`banqueInput`. Le premier geste
  **irréversible** de l'onglet Suivi : suppression d'un mot confirmée (`uiConfirm` destructif)
  par un message qui **nomme** les listes amputées, jamais un tap unique ; un mot d'une leçon
  prédéfinie n'est pas supprimable (la rejouer le recréerait), une cible de verbe l'est mais
  avec l'avertissement qu'elle reviendra tant que le verbe reste dans sa liste. Écrit sur le
  profil **consulté** par UUID (`saveOrthoFor` + `touchProfile`, cf. [Données &
  profils](donnees-et-profils.md)), jamais de bascule du profil actif. Détail fonctionnel dans
  [Espace encadrant](espace-encadrant.md).
- **`encadrant-revision.ts`** (#423) — **récap du mode Révision espacée** par profil
  (onglet **Suivi**, #459), affiché juste après le bloc ci-dessus : projette la file de
  répétition espacée (#45, lue par `core/encadrant-stats.ts:revisionProfil`) — palier
  courant + échéance relative par entrée, badge « acquis » pour les entrées sorties de
  rotation. Bascule **« Par catégorie »** (regroupement dépliable, même chrome que
  « Notions par catégorie »), **« Par urgence »** (liste à plat, plus en retard
  d'abord, plafonnée à 20 lignes) et **« Par palier »** (#555 — étages de l'escalier
  de répétition espacée, du moins ancré au plus ancré, en-têtes de section `<h3>` NON
  repliables comptant toujours la liste complète, étages vides omis, chaque étage
  plafonné à 6 lignes) ; les deux vues à plat renvoient leur reliquat dans un repli
  dépliable. Handler `revision-mode` (composant segment partagé — variante `wrap`
  depuis cette 3e option, cf. `segment.ts` plus bas). Détail fonctionnel dans [Espace
  encadrant](espace-encadrant.md).
- **`encadrant-seance.ts`** (#440) — **compositeur** du « programme du jour » du
  profil consulté, en tête de l'onglet **Programme** (#459) : programmes (nom, étapes +
  `count`, récurrence date/hebdo — bascule `seance-rec-type`, composant segment
  partagé — avec garde-fou de conflit `recurrencesEnConflit`), estimation de durée, copie
  vers un autre profil. Une étape « dictée » se cible via une **liste à cocher**
  (`checkboxesDicteeHTML`, handler `seance-dictee-toggle`, #463, cibles filtrées au niveau
  du profil) plutôt qu'un menu mono-valeur : le pool coché (`ciblesEtape`) peut compter 0,
  1 ou plusieurs dictées ; une cible cochée devenue indisponible reste affichée à part
  (« Cible actuelle »), décochable sans être perdue en silence. Une étape **« une leçon
  précise » (#556)**, elle, cible TOUT le catalogue via le sélecteur de leçon partagé
  (`cibleLeconHTML`/`selecteurEtapeHTML`, cf. `ui/selecteur-lecon.ts` ci-dessus) plutôt
  qu'un menu filtré au niveau du profil : elle NAÎT sans cible (`etapeConfiguree`, cf.
  [Logique pure](core.md)) et affiche, une fois une cible retenue d'une autre classe que
  celle suivie, le badge « classe d'origine » **sans infobulle** (`badgeClasseOrigine`,
  `encadrant-commun.ts` ci-dessus) — ici le badge est seul sur sa ligne, donc la phrase qui
  l'explique est rendue **en clair juste en dessous** (`noteOrigineHTML`, #571) plutôt que
  réservée à une infobulle qu'une tablette n'ouvre pas au doigt. Une cible qui n'est plus au
  catalogue (leçon retirée d'une version à l'autre) reste
  signalée telle quelle plutôt que muette — seul motif restant de ce repli, une cible hors
  de la classe suivie étant désormais légale. Une étape **« à revoir » (#464)** ne se
  configure pas — sa cible est la file épinglée du profil (`epingleesProfil`) — mais
  affiche un repère (`hintARevoir`) pour que l'adulte sache si elle apparaîtra dans le
  programme (« rien n'est épinglé » / une seule → « ce sera celle-ci » / plusieurs →
  « une au hasard à chaque lancement »). Logique + stockage dans `core/seance.ts`
  (cf. [Logique pure](core.md)) : ce module ne fait que le rendu et l'aiguillage des
  interactions, persistance immédiate à chaque action.
- **`encadrant-reglages.ts`** — **réglages** sur le profil consulté (onglet
  **Réglages**, #459) : classe de référence + niveau par matière, longueur d'une
  séance de Révision (#439, menu à paliers fixes `REVISION_PLAFOND_CHOIX`),
  aménagements « dys »/attention, **« Leçons déjà vues en classe »** (#478 — cf.
  [Espace encadrant](espace-encadrant.md) et `core/vu-ailleurs.ts`) ; injecte le
  bloc PIN rendu par `encadrant-pin`. Expose `reglagesApresRendu` (hook post-rendu
  appelé par l'orchestrateur après avoir posé le HTML de l'onglet — pose l'état
  « indéterminé » des cases de catégorie, impossible en HTML seul) et
  `reglagesClick` (dépliage d'une catégorie, déclaration groupée) en plus de
  `reglagesChange`.
- **`encadrant-profils.ts`** — sélecteur de profils en **consultation** (≠ bascule)
  + **gestion** réservée à l'adulte (renommer/avatar/réinitialiser/supprimer/créer),
  plus export/import de tous les profils (onglet **Profils**, #459).
- **`a-revoir-card.ts`** (#234) — carte d'accueil `#aRevoir` (modèle « leçon du jour »)
  affichant les leçons épinglées « à revoir » par l'encadrant, masquée si vide. Chaque
  rendu déclenche aussi le **désépinglage automatique** (#465,
  `purgeRevoirSolides`, cf. [Logique pure](core.md)) : les entrées redevenues solides
  sont retirées de la file **persistée**, pas seulement filtrées à l'affichage.
  **Cède le pas à « Ta prochaine leçon » (#516)** : `renderARevoir` évite la tête de
  file quand elle est aussi la leçon du jour, tant qu'une autre entrée épinglée reste
  disponible (`core/accueil-propositions.ts:choisirARevoir`), et **renvoie l'id de la
  leçon retenue** (`null` si carte masquée ou entrée de dictée) pour que l'appelant
  (`render.ts`) le transmette à l'autre carte. Le défilement (« Voir une autre leçon »)
  n'est volontairement **pas** dédupliqué : la file épinglée est courte et entièrement
  voulue par l'encadrant, en faire le tour doit tout montrer.

**Composant segment partagé** — `segment.ts` (hors des sections ci-dessus, consommé par
cinq d'entre elles) : `segmentHTML(config)` rend un groupe de boutons **choix exclusif**
conforme au patron APG **« Radio Group »** (`role="radiogroup"` + `role="radio"`/
`aria-checked`, **tabindex mobile** — seule l'option cochée est dans l'ordre de
tabulation), en remplacement de l'ancien rendu à la main en `role="group"` +
`aria-pressed` (des bascules indépendantes, contrat inadapté à un choix exclusif).
`segmentKeydown(e)`, câblé une fois dans le `onKeydown` délégué de `encadrant.ts`, déplace
le focus aux flèches/Home/End ; la sélection **suit le focus** (le handler de la section
clique l'option visée, gère l'état et le re-rendu). Consommé par `activite-mode` et
`dictees-vue` (`encadrant-progression.ts`, ce dernier depuis #496), `revision-mode`
(`encadrant-revision.ts`), `seance-rec-type` (`encadrant-seance.ts`), `erreurs-periode`
(`encadrant-erreurs.ts`), `travail-periode` (`encadrant-travail.ts`, #520) et `sel-niveau`
(#556, ci-dessous, composé DANS les deux sections qui montent le sélecteur de leçon) — les
`data-act`/`data-mode`/`data-type`/`data-periode`/`data-vue`/`data-jours`/`data-niveau` de
chaque site restent inchangés (sélecteurs e2e stables).

**Composant sélecteur de leçon partagé** — `selecteur-lecon.ts` (#556, hors des sections
ci-dessus, consommé par DEUX d'entre elles) : `selecteurLeconHTML(opts)` rend l'arbre
`matière → catégorie` du catalogue (`core/catalogue-arbre.ts`, cf. [Logique
pure](core.md)) en `<details>` natifs repliés — même chrome que « Notions par catégorie »
(`.enc-cat-d`/`.enc-cat-sum`), aucun pattern ARIA maison à inventer — précédé d'une barre
de jetons de niveau (`segmentHTML`, ci-dessus) et d'un champ de recherche. Remplace le
`<select>` filtré au niveau du profil qui rendait une leçon d'une autre classe littéralement
inatteignable : ici le niveau est un jeton de FILTRE, l'arbre couvrant tout le catalogue.
Contrat **`ActionLigne`** (`{act, extra?, etat}`) : le consommateur définit ce que fait le
bouton en bout de ligne et son libellé/état pressé (« Choisir » pour la cible d'une étape de
programme, « Épingler »/« Retirer » pour « à revoir ») — le sélecteur ignore ce qu'on fait de
la leçon choisie. État de vue (jeton actif, recherche, plis) en **état de module par
instance** (`Map` clée par `id`), et non dans le DOM : l'espace encadrant recrée tout son DOM
à la moindre action, l'état y serait sinon remis à plat à chaque clic (même parti pris que
`categoriesOuvertes`). La recherche filtre À LA FRAPPE en ne remplaçant QUE le corps de
l'arbre (`rafraichirCorps`, région live `role="status"` mutée avec un délai, même motif que
la banque de mots #496/#527) et déplie d'office ce qui reste. `enregistrerSelecteur(id, f)`
déclare, à CHAQUE rendu du consommateur, comment re-rendre le corps du sélecteur (l'action
de ligne capture un état qui change d'un rendu à l'autre — étape visée, file épinglée) ;
`oublierSelecteur(id)` oublie l'état à la fermeture, et un changement de profil consulté
remet TOUS les sélecteurs à plat (`onChangementProfilConsulte`).

**Résultats de recherche plafonnés (#571)** : sous recherche seulement, le corps est
borné à `PAS_AFFICHAGE` (30) leçons (`core/catalogue-arbre.ts:tronquerArbre`, cf. [Logique
pure](core.md)) — une recherche déplie tout ce qu'elle retient, et un mot courant
alignerait sinon des dizaines de boutons à traverser avant la suite de l'écran (SC 2.4.1,
même motif que le plafond de la banque de mots). Un bouton « Afficher les N leçons
suivantes » (`data-act="sel-plus"`, `.enc-sel-plus`) lève la borne d'un pas, focus rendu au
bouton suivant qui apparaît (ou, à défaut, au dernier bouton de l'arbre, ou au champ de
recherche) ; la troncature est **annoncée** dans le résumé (région live déjà en place) et
remise à zéro à chaque frappe et à chaque changement de jeton de niveau. Hors recherche,
pas de borne : les groupes restent repliés, rien n'est focalisable à traverser.

Deux consommateurs :
la cible d'une étape « une leçon précise » du programme (`encadrant-seance.ts`) et
l'épinglage « à revoir » (`encadrant-progression.ts`, bloc « Épingler une leçon », cf.
[Espace encadrant](espace-encadrant.md) pour le détail fonctionnel des deux).

**Journal des erreurs (#391)** — deux modules distincts, hors des modules de section
ci-dessus, plus `core/erreur-representation.ts` (logique pure, cf. [Logique
pure](core.md)) pour les formats composites :
- **`erreur-capture.ts`** — point d'entrée UNIQUE `capterErreur`, appelé par **tous les
  runners** à la correction d'une réponse fausse (fait respecter par deux gates — un
  **statique** au niveau module, #580, et une **table de couverture par format**
  jouée en e2e, #581 ; cf. [Tests](tests.md)) : met en forme l'énoncé lisible
  (`questionPourJournal` — `@` → « … », marqueur « exercice avec dessin ») et le libellé
  d'un choix QCM (`libelleChoix`, vue riche #200 si elle existe), puis délègue à
  `core/erreurs-journal.ts`. Ignore une erreur sans leçon rattachée ou sans énoncé
  affichable. Option **`sansTentative`** (#467, booléen côté appelant, normalisé en
  marqueur `true` seulement s'il est vrai) : marque l'entrée « passée sans essayer » —
  « Je ne sais pas, montre-moi » ou validation à vide — avec `donnee: ''` (il n'y a pas
  de réponse à montrer côté encadrant). **Une tentative COMMENCÉE n'est pas un « pas
  d'essai »** : quand l'enfant a laissé une trace avant de demander la réponse, le journal
  retient ce qu'il avait proposé. Même règle en trois cas pour les trois formats concernés —
  rien de saisi → entrée `sansTentative` ; saisi et **faux** → **vraie** entrée d'erreur avec
  la réponse donnée ; saisi et **juste** → **aucune** entrée (on ne fabrique pas une erreur
  là où l'enfant avait bon). Elle est écrite **une seule fois**, en logique pure
  (`core/erreur-representation.ts: entreeTentativePassee`) ; les trois appelants ne
  fournissent que les faits, avec leur propre comparaison, et routent l'entrée obtenue :
  sous-questions d'un problème (`core/probleme-etapes.ts: entreesEtapesPassees`), repère déjà
  placé sur la droite graduée (`lecon-droite-graduee.ts:journaliserPasse`, faits lus par
  `tentativePosee`) et cases déjà cochées d'un QCM multi
  (`lecon-qcm-multi.ts:journaliserPasseMulti`, verdict tout-ou-rien via `selectionJuste`).
  Les helpers de ces deux runners reçoivent l'état coché / sélectionné **en paramètre** (et ne
  lisent plus une variable de module) : la même lecture sert à l'écran et au journal, et ne
  peut plus se dédoubler. **Exception assumée** : le tableau de conversion (`lecon-tableau.ts`)
  reste `sansTentative` inconditionnel — sa réponse est la **lecture de toutes les cases
  ensemble**, donc inexistante tant qu'il en manque une, et un nombre reconstruit sur des
  cases vides ferait croire à une conversion fausse jamais proposée. Branché sur la fiche en saisie (`session.ts:verify`), le QCM
  (`lecon-qcm.ts`), le QCM multi-sélection (`lecon-qcm-multi.ts` — une entrée par
  question, propositions cochées listées dans l'ordre d'affichage), le sprint
  (`sprint.ts`), les tuiles de numération (`lecon-tuiles.ts` — libellé de la tuile
  posée via `TuileController.reponse()`), le rangement (`lecon-ordre.ts` —
  `ordreErreur`), le tri par thème (`lecon-tri.ts` — une entrée par mot mal classé via
  `motsMalClasses`), l'appariement (`lecon-appariement.ts` — une entrée par manche
  ratée, restreinte aux paires fausses via `pairesErreur`), le tableau de conversion
  (`lecon-tableau.ts` — le nombre relu dans l'unité cible via `nombreTableauSaisi`), la
  résolution de problèmes (`lecon-probleme.ts` — une entrée par sous-question ratée),
  « Clique sur le mot » (`lecon-clic-mot.ts` — une entrée par phrase ratée : mots choisis
  vs bon(s) mot(s), joints par `libelleCible` pour qu'une cible non adjacente se lise
  « chien et pomme ») et la dictée d'orthographe (`ortho-runner.ts` — le **premier essai
  raté** d'un mot ; libellé résolu via `labelLeconOrtho`, cf.
  `core/orthographe/lessons.ts`, l'id étant une **liste** d'orthographe et non une leçon
  du catalogue). La **révision espacée** (`revision.ts`) capture elle aussi, sous un mode
  dédié `'revision'`, via un point d'entrée local `capterRev` qui délègue ici (cf.
  [Espace encadrant](espace-encadrant.md) pour le détail de ses 10 formes d'item et la
  limite propre aux mots d'orthographe sans liste). Une opération posée (`session.ts`)
  est agrégée : les cellules-chiffres du RÉSULTAT (`Item.posedResult`) sont regroupées
  par grille et réduites à **une** entrée via `analyserResultatPosee`, jamais une par
  chiffre. **Détaché du seuil de 60 %** (`enough`, qui conditionne toujours l'XP) : les
  erreurs d'une fiche sont journalisées même sous ce seuil (c'est là que l'enfant
  décroche), via une garde dédiée `sessionErreursLoggees` (`ui/navigation.ts`),
  indépendante de `sessionRecorded`.
- **`encadrant-erreurs.ts`** — bloc « Ce qui a été difficile récemment » (`erreursHTML`),
  inséré par `encadrant-progression.ts` après les listes de dictée (dernier bloc du récap de
  l'onglet Suivi, juste avant le récap de révision espacée) : groupé par leçon (`<details>`
  repliés), celle avec le **plus d'erreurs** en tête (#519 ; la récence de la dernière
  erreur ne sert qu'à départager une égalité de volume), dédoublonnage « vue N fois », **« Réponse
  attendue »** mise en avant (jamais barrée) — et non « La bonne réponse » (#446) : depuis
  l'intercalation, l'attendu peut être une bande (« un nombre entre 450 et 465 »), formulation
  neutre valable pour toutes les leçons. Une entrée **`sansTentative`** (#467) échange sa ligne
  « Réponse donnée » contre une phrase explicite (`.enc-err-passe`) et prend un liseré neutre
  (`.enc-err-item--passe`) : « passé sans essayer » ne se lit pas comme une faute. Au-delà des **5** erreurs les plus récentes d'une leçon, les
  suivantes rejoignent un second `<details class="enc-err-anciennes">` imbriqué (« N erreurs
  plus anciennes »), plutôt qu'un simple compteur non consultable. Le libellé du groupe résout d'abord une leçon du catalogue, sinon
  une liste d'orthographe (`labelLeconOrtho`), sinon l'id brut. Action « Épingler »
  (`data-act="epingler"`, même mécanique que « à revoir » — leçon du catalogue **ou** liste
  d'orthographe, préfixée `orthoRevoirId`, #424) **masquée** seulement pour un groupe dont
  l'id ne résout ni l'une ni l'autre (groupe orphelin).
  **Filtre de période** (#476, cf. [Espace encadrant](espace-encadrant.md) pour le détail) :
  sélecteur à quatre segments (`data-act="erreurs-periode"`, composant segment partagé —
  `segment.ts` ci-dessus) qui borne les erreurs AVANT le regroupement
  (`filtrerErreursParPeriode`, `core/erreurs-journal.ts`), défaut adaptatif
  (`periodeParDefaut`) ; handler exporté `erreursClick`, routé par `progressionClick`.

**Récap éphémère de fin de séance (#537)** — `recap-seance.ts` (hors des modules de
section/runner ci-dessus), consommé par `session.ts` (bilans express/complet/
personnalisé), `sprint.ts`, `revision.ts` et `seance.ts` (programme du jour, ci-dessus) :
une phrase qui NOMME les notions traversées, là où le seul retour existant était un
pourcentage ou une étoile. La décision (ce qui est nommé, avec quel gabarit) vit dans
`core/recap-notions.ts` (pure, cf. [Logique pure](core.md)) ; ce module-ci ne fait que la
résolution catalogue, la mémoire de page et le rendu :
- **`notionLecon`/`notionGroupe`/`notionsDepuisPerLesson`** résolvent un id de leçon ou un
  groupe de mots d'orthographe en `NotionRecap` (libellé résolu au niveau JOUÉ,
  `labelLecon`+`niveauLecon`, comme `leconTitreHTML`).
- **`noterNotions`/`notionsNotees`** gardent, en **mémoire de la page** (aucune clé de
  stockage — critère du cadrage), ce qu'un sprint/une révision vient de traverser, pour
  que le programme du jour puisse nommer une étape au titre générique sans relire le
  journal ; perdu au rechargement, l'étape retombe alors sur son titre seul (enrichi
  quand on peut, jamais faux). Rangée **par profil** (`notionsParProfil`, `Map<uuid,
  …>`) : changer de profil ne recharge pas la page (`setActiveProfile` puis `route()`,
  `main.ts`), donc une mémoire globale aurait accolé les notions du sprint d'un enfant à
  l'étape « Sprint » du programme de son frère. Préféré à un effacement déclenché par le
  changement de profil actif, qui a **quatre** points d'entrée (`initProfiles`,
  `setActiveProfile`, `addProfile`, `deleteProfile`) — il aurait suffi d'en oublier un.
- **`recapHTML`/`recapAutonomeHTML`** rendent la phrase (`''` si rien à nommer, jamais de
  bloc vide) ; la seconde s'efface quand un programme du jour actif et non complet
  contient déjà une étape du même type (`recapAutonomeMasque`), pour ne pas se
  contredire sur la forme à deux écrans d'écart. Chaque écran porteur passe sa propre
  classe (`rb-recap`, `sprint-recap`, `rev-recap`) : une prose continue, sans puce ni
  encadré — la structure en carte/ligne est ce qui fait « relevé pour les parents »,
  pas la couleur (avis `designer-ux-enfant`). Styles dans `styles/recap-seance.scss`,
  **fichier unique pour les trois classes** plutôt qu'un bloc recopié dans chacune des
  trois feuilles d'écran (`sheets.scss`/`sprint.scss`/`revision.scss`) : deux des trois
  copies étaient identiques au caractère près. Les noms de classe restent distincts par
  écran, seules les déclarations sont mutualisées.

**Second cycle d'imports TOLÉRÉ, `seance.ts` ↔ `recap-seance.ts`** (même critère que
`menu.ts` ci-dessous, dans « Menu, préférences, thèmes & accessibilité ») :
`recap-seance.ts` importe `vueProgramme` de `seance.ts` (dans `recapAutonomeHTML`), et
`seance.ts` importe `notionLecon`/`notionsNotees` de `recap-seance.ts` (dans
`notionsEtape`). Les deux imports ne sont utilisés **qu'à l'intérieur d'une fonction**,
jamais au chargement du module — contrairement au cycle `main ↔ navigation` qui avait
motivé l'extraction de `menu.ts`, où l'effet de bord était justement **au chargement**
(`wireDOM()`). Rien à extraire ici.

Deux non-décisions du cadrage, à ne pas re-proposer :
- **Aucun état persistant, aucun cumul consultable côté enfant.** Pas de tuile
  d'accueil, pas d'historique : le récap est un épilogue de séance, pas un carnet de
  devoirs. Un rechargement de page le perd (`tour`/`notionsParProfil` sont des variables
  de module, jamais écrites en `localStorage`), et c'est voulu.
- **`core/encadrant-stats.ts:travailRecent` / `ui/encadrant-travail.ts:travailHTML` ne
  sont PAS réutilisés**, alors qu'ils projettent déjà « ce qui a été travaillé » pour
  l'adulte (cf. [Espace encadrant](espace-encadrant.md)). Ils lisent des **fenêtres de
  plusieurs jours** pour un tableau de suivi ; ce récap-ci nomme une **seule séance**
  côté enfant, à la voix « tu ». Même contenu factuel, registre et fenêtre temporelle
  différents selon qui regarde — d'où deux modules plutôt qu'un partagé.

Deux remontées `relecteur-accessibilite` **écartées** sur ce lot, pour qu'un futur
passage ne les re-remonte pas :
- **Le point médian `·` en séparateur de prose** (ex. « ✓ Sprint 5 min · Numération et
  Calcul mental ») reste **sans marquage sémantique** (pas d'`aria-hidden`, pas de texte
  alternatif) : les lecteurs d'écran l'annoncent de façon inconstante selon le moteur
  vocal, mais la phrase reste juste une fois les deux segments lus bout à bout, et le
  dépôt en a déjà plusieurs occurrences non contestées (`.sprint-done-sub` dans
  `sprint.ts`, la liste de trophées dans `session.ts`). Le marquer ici romprait la
  cohérence avec l'existant sans rien corriger ailleurs.
- **Pas de bouton « Écouter » sur la phrase de récap.** `bindConsigneTts`
  (`consigne-tts.ts`) est scopé aux **consignes actionnables** (`[data-tts]` posé par un
  runner) ; le récap n'en est pas une, et les autres textes d'épilogue du même registre
  (`.rb-warn`, `.rb-goal`, `.rb-rank`, la bulle de mascotte) n'ont pas non plus de TTS.
  En équiper un seul casserait la cohérence sans base dans le cadrage. Étendre le TTS à
  *tous* les textes d'épilogue serait un arbitrage produit
  (`specialiste-troubles-apprentissage` / `pedagogue-primaire`), pas une exigence a11y de
  ce lot.

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
  `mise-a-jour.ts`).
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
  L'aide suit le **widget**, pas seulement le runner de leçon : la **révision espacée**
  (`revision.ts`), qui monte les mêmes widgets (#186/#345/#466), pose l'aide du geste de
  l'item courant (`typeAideItem` : `tuiles`, `ordre`/`ordreNombres`, `tri`, `appariement`,
  `clicMot` ; rien pour une saisie ou un QCM, qui n'ont pas de geste à apprendre). Le
  bouton est reposé à chaque item — `#revStage` est réécrit à chaque rendu, donc le bouton
  ne « colle » pas au type précédent — et la carte porte alors `.rev-stage--aide`, qui
  réserve le couloir latéral du bouton. Sans ce câblage, la révision servait des gestes
  appris des semaines plus tôt sans aucun moyen d'y retrouver **comment se rectifier**
  (retoucher un mot pour le désélectionner, reprendre une tuile posée), et une fausse
  manœuvre devenait une réponse fausse. L'atelier du mot, lui, était déjà couvert : c'est
  `renderAtelier` qui pose son aide, y compris quand la révision l'appelle.

## Accueil, navigation & catalogue

- **`render.ts`** — rendus accueil/sélecteur/profils (`renderHomeStats` — qui
  rend `renderARevoir` **avant** `renderLeconDuJour` (#208) et lui passe son résultat,
  pour que les deux cartes se dédupliquent (#516, cf.
  `core/accueil-propositions.ts` dans [Logique pure](core.md)) — appelle aussi
  `renderProgrammeCard` (carte « programme du jour », #440) — et favoris, badge **niveau + barre** dans
  `renderToolbarProfile`, carte de progression `renderProgression` (sa bulle de
  mascotte porte le **défi du jour** : invitation, puis félicitations une fois
  accompli), `renderObjectives`, `renderLessons` + `lessonCardHTML` réutilisable,
  `renderProfileMenu`, `renderProfiles`, `boardHTML`/`sprintBoardHTML`,
  `pctColor`, config `REGULARITY`). **Rejouée quand le jour change sous un accueil
  affiché (#517)** : l'écouteur `visibilitychange` de `main.ts` (qui porte déjà la
  sauvegarde de reprise en arrière-plan, #63) appelle au retour au premier plan
  `rafraichirAccueilSiJourChange`, qui vit ici avec le rendu. Tout ce que l'accueil dit
  « du jour » (programme, leçon du jour, révisions dues, objectifs) est daté de son
  rendu, et une tablette dort la nuit puis rouvre l'app le lendemain sans jamais
  recharger la page. Le déclencheur est le **changement de jour civil** (mémorisé au
  rendu via `todayStr`), pas la reprise : trois abstentions, jour inchangé, accueil
  masqué (un autre écran occupe la place, la prochaine navigation rendra du frais) et
  accueil `inert` (une modale est ouverte et ne masque pas `#home` : re-rendre dessous
  détruirait le déclencheur mémorisé pour la restauration du focus). **Limite assumée** :
  un onglet qui ne passe JAMAIS par `hidden` (écran qui ne s'éteint pas) ne déclenche
  aucun rafraîchissement, et l'accueil reste périmé jusqu'à la prochaine navigation ; le
  garde-fou du clic de la carte joue quand même, donc aucun clic ne meurt.
  **Activation clavier des cartes (#517)** : la carte entière reste cliquable pour le
  doigt et la souris, mais l'action focusable est sa pastille `.go`, un vrai `<button>`
  (dans `app.html` pour les quatre cartes statiques, dans `seance.ts` /
  `lecon-du-jour.ts` / `a-revoir-card.ts` pour les trois dynamiques). Chaque pastille
  porte un `aria-label` qui reprend son libellé visible ET nomme sa carte
  (« Sprint 5 min : c'est parti ») : « c'est parti » seul ne dit rien hors contexte.
  Pas de `role="button"` sur la carte : il aplatirait son `<h2>` et avalerait les
  boutons `.lj-autre` imbriqués. Corollaire gratuit : une carte `card-inactive` masque
  sa pastille en CSS, donc sort du parcours clavier sans réglage dynamique.
- **`seance.ts`** (#440) — écran `#seance` et carte d'accueil `#cardProgramme` du
  **programme du jour** composé par l'encadrant (cf. [Modes &
  navigation](modes-et-navigation.md)). `vueProgramme()` est la porte d'entrée UNIQUE
  de lecture de la séance côté UI (utilisée aussi par `ui/navigation.ts`) : elle
  construit le `ContexteSeance` via `contexteProgramme()` (#464, enrichi #498 —
  `{aRevoirLecons, aRevoirDictees}`, les ids **par nature** des entrées épinglées
  encore à travailler, tirés de `revoirActives(dicteeDisponible())` de
  `core/encadrant-stats.ts`) que le cœur ne peut pas lire seul, puis appelle
  `vueSeanceDuJour`. `renderProgrammeCard` (masquée hors programme applicable ce
  jour) et `renderSeance` (tuiles des étapes restantes en ordre libre, jauge de
  pastilles, bouton « Choisis pour moi », état terminé célébré) en découlent.
  **Récap nommé par étape (#537)** : les lignes « Déjà fait aujourd'hui » (programme en
  cours) et la liste finale (programme terminé) ne s'arrêtent plus au titre générique
  d'une étape (« Sprint 5 min », « Révision ») — `recapListeHTML`/`recapItemHTML` y
  ajoutent les notions réellement traversées, lues dans `notionsNotees` (sprint/révision,
  mémoire de page) ou dans `VueEtape.refs` (#537, `core/seance.ts` — cibles des
  complétions du jour, pour une étape à cible unique tirée au lancement) ; le titre n'est
  jamais répété. Cf. « Récap éphémère de fin de séance » plus bas pour le module partagé.
  **Programme terminé (#517)** : la carte porte alors `programme-card--fini` **et**
  `card-inactive` (même classe que la carte Révision sans rien de dû, posée par
  `render.ts`) — plus de pastille d'action ni de clic, et « Terminé, bravo ! 🎉 »
  (emoji inline `aria-hidden`) là où l'ancien CTA « Revoir → » restait invisible
  faute de contraste. Le listener de clic
  **recalcule** `vueProgramme()` avant de naviguer au lieu de poser `#seance`
  inconditionnellement : la carte peut avoir survécu au programme qui l'a produite
  (onglet resté ouvert, minuit passé, épinglée retirée depuis le dernier rendu) —
  sans ce garde-fou la route renvoyait aussitôt à l'accueil, clic sans effet visible.
  Une étape « à revoir » se présente comme une tuile « À revoir » (icône marque-page) ;
  si une seule entrée est épinglée, son libellé est **nommé** directement (comme la
  carte d'accueil), sinon le titre reste générique et la cible est tirée au
  lancement.

  `lancerEtapeProgramme` tire d'abord la cible d'une étape à pool (`tirageEtape` :
  dictée configurée #463 via `core/seance.ts:tirerCible`, ou file épinglée #464 via
  `tirerParmi` — sans effet pour les autres modes), pose le marqueur d'attribution
  (`marquerEtapeLancee`, avec cette cible) et délègue au déclencheur du mode existant
  (`startSprint`/`startRevisionEspacee`/`startLecon`/`startOrthoLecon`) — aucun
  runner n'est modifié. Une entrée épinglée porte sa nature dans son id de file
  (préfixe `ortho:`) : on la dépréfixe pour choisir le déclencheur, avec l'origine
  `'programme'` comme les autres lancements de leçon/dictée (#461, `retour-activite.ts`).
  Un pool de 2+ cibles (dictées ou épinglées) s'affiche sous un titre générique :
  l'enfant ne sait laquelle avant de lancer.
  `rafraichirProgramme` (appelée par la navigation avant l'accueil et l'écran `#seance`)
  délègue **entièrement** à `resoudreProgramme` (#498, remplace l'ancien
  `resoudrePending` + `consoliderCompletion` : un seul appel attribue les sessions
  nouvelles du journal d'activité **et** détecte la complétion, y compris celle
  survenue sans résolution de marqueur — cf. [Modes &
  navigation](modes-et-navigation.md)) ; célèbre (modale + confettis) la complétion
  du programme entier, sans XP.
- **`lecon-du-jour.ts`** — carte **« leçon du jour »** de l'accueil (#208) : `#leconDuJour`
  est la **1re carte** de la rangée `.cards`, sur le **même modèle visuel** que les cartes
  de mode (pastille `.ico`, titre, descriptif, CTA), au contenu **dynamique**.
  `renderLeconDuJour` peint la carte du prochain pas (`core/lecon-du-jour.ts`) — pastille à
  la couleur de la matière, libellé de leçon, « matière · catégorie », « C'est parti → » —
  avec un bouton **« Voir une autre leçon »** (contournement `leconSuivante`, jamais de mur)
  et, tout **franchi** (#485 — étoilé ou réussi à 70 % en mode leçon, y compris les
  leçons mises de côté rendues au fil), une **trace calme + passerelle vers la
  révision** — texte tiré de `core/carte-tour-fait.ts` (#276), en rotation sur le
  jour du mois pour ne pas répéter le même message pendant des mois ; la
  célébration elle-même (modale + confettis) a déjà eu lieu au moment où le tour
  s'est achevé, via le trophée `tour-<matière>-<niveau>` (cf.
  [Gamification](gamification.md)). La carte est cliquable
  (→ `startLecon`/`startRevisionEspacee`) via un listener posé **une seule fois** sur l'élément
  persistant ; l'état (leçon courante, mode) vit dans ses `data-*`, le contournement est
  **éphémère** (revenir sur l'accueil ré-affiche la vraie leçon du jour).
  **Cède à son tour (#516)** quand « À revoir » n'a pas pu éviter la leçon du jour (une
  seule entrée épinglée, et c'est elle) : `renderLeconDuJour` accepte un 3ᵉ paramètre
  `eviterId`, mémorisé sur l'élément en `data-eviter` (le défilement, lui, repasse par
  `cibleId` et perdrait sinon l'évitement), et avance d'un cran dans le fil
  (`core/accueil-propositions.ts:choisirProchaineLecon`) — jamais de carte vidée, repli
  sur la tête du fil si tout est à éviter. « Voir une autre leçon » saute à son tour la
  leçon déjà proposée par « À revoir » (le saut est abandonné s'il ne mène nulle part).
  Arbitrage complet dans `core/accueil-propositions.ts`, cf. [Logique pure](core.md).
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
  `mascotteBulleHTML(message, loop)` + `encouragementMascotte()` (bulle de BD). La
  grille de trophées se construit sur `trophiesVisibles()` (#276, `core/rewards.ts`)
  et non `TROPHIES` brut — un tour de matière d'un niveau non atteint y est masqué —, et
  le compteur « N/M » (`acquisVisibles`) intersecte les acquis avec les visibles :
  compter sur `TROPHIES.length` laissait un id acquis puis disparu du catalogue faire
  déborder l'affichage (« 45/44 trophées obtenus »).
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
  prédéfinis + listes du parent, jouées par le runner ortho dédié). L'aperçu au survol
  d'une carte de dictée (`.ortho-apercu`, décoratif) liste ses mots dans l'ordre rendu
  par `motsApercu` (`core/orthographe/lessons.ts`, #441) — **même règle** que celle
  consultée dans l'espace encadrant (cf. [Espace encadrant](espace-encadrant.md), bloc
  « Listes de dictée »), pour que les deux aperçus ne divergent jamais.
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
- **`retour-activite.ts`** (#461) — mémorise l'**origine** du lancement d'une activité
  (`'catalogue' | 'programme'`, état de module **non persisté** : un rechargement ou un
  accès direct à `#lecon-N` repart du catalogue), posée **avec la clé de l'activité visée**
  par chaque déclencheur (`startLecon`/`startOrthoLecon` dans `navigation.ts`, propagée par
  `showModeChoice`, remise à `'catalogue'` par `restoreResume` — une reprise est un
  lancement catalogue). L'écran qui démarre réellement l'activité l'annonce
  (`activiteDemarree(cle)` : `runLecon`, `startOrthoRun`, `renderOrthoRevoir`) ; une clé qui
  ne correspond pas au dernier lancement ⇒ on a été rejoué par le routeur et non par un
  déclencheur (Précédent/Suivant sur l'entrée d'historique d'une activité lancée plus tôt)
  ⇒ retour à la valeur sûre `'catalogue'`, jamais une fausse promesse « Retour au
  programme ». Idempotent : « Recommencer » la même activité garde son origine.
  `retourFinActivite(cible, labelProgramme?)` la relit et rend au bouton « Retour » d'un
  écran de fin d'activité soit la cible **catalogue** de l'appelant, soit une cible
  **« Retour au programme »** routée vers `#seance` quand l'activité vient du
  **programme du jour** (cf. [Modes & navigation](modes-et-navigation.md)). Consommé par
  les écrans de fin — `session.ts` (fiche/saisie, `#btnBackCategorie`),
  `lecon-runner-shared.ts` (runners « une question à la fois », `#leconBack`),
  `ortho-runner.ts` (bilan, révision terminée, pause) et `ortho-revoir.ts` (« Je relis mes
  mots »). INCHANGÉ : le bouton « Quitter » (accueil) et les fins de sprint / révision
  espacée, qui ramènent à l'accueil (lequel re-rend déjà la carte du programme).

## Runners d'exercice

- **`lecon-runner-shared.ts`** (#344) — **squelette commun** des cinq runners
  ci-dessous : `leconProgressHTML(idx, total, libellé?)` (barre de progression, libellé
  surchargeable, ex. « Problème i / n »), **`leconTitreHTML(lesson)`** (#436 — bandeau
  `.sprint-theme` / `.sprint-lesson` du titre de leçon, **libellé résolu au niveau joué**
  via `labelLecon`+`niveauLecon` ; les dix runners rendaient ce markup chacun chez eux, donc
  chacun aurait dû penser à résoudre le niveau), `finishLeconRun(lessonId, ok, total)` (enregistre
  l'essai via `recordLessonRun` et renvoie l'issue) et `renderLeconResult(opts)` (écran de
  résultat commun — score, étoile, mascotte, récompenses de niveau via `announceRewards`).
  Chaque runner délègue sa fin de session à ce module au lieu de la dupliquer ;
  `lecon-probleme.ts` passe son lexique (`nom` / `nomPluriel`) via le paramètre optionnel
  `lexique`. `wireNext(actions, feedback, opts)` mutualise aussi la **fin de question**
  commune aux cinq runners : révèle le feedback, pose le bouton « Continuer ▶ » / « Voir
  mon résultat ▶ » (`opts.isLast`) et câble son clic (`opts.onNext`) + le focus. Le bouton
  n'a plus d'id propre (résolu via `actions.querySelector('button')`) — seuls les
  conteneurs `#…Actions` / `#…Feedback` de chaque runner restent des sélecteurs stables
  (repris par les specs e2e). Pose aussi, pour la leçon en cours, les deux points
  d'entrée AUTOMATIQUE/persistant de l'étayage de la notion (#490) —
  `monterBoutonEtayage` (bouton de l'en-tête) et `maybeEtayageAvantSerie` (exemple au
  retour d'une mise de côté), tous deux no-op sans contenu d'étayage pour la leçon ;
  cf. « Étayage de la notion » plus bas.
- **`revelation-neutre.ts`** (#467) — **fond commun de « Je ne sais pas, montre-moi »**,
  partagé par le mode leçon (`lecon-passer.ts`) et le mode Révision (`revision.ts`) : le
  libellé du lien (`PASSER_LABEL`, `lienPasserHTML(classe, id)` — un `<button>`, jamais un
  `<a>`), le ton du verdict (`REVEAL_LAB`, `ligneRevelation(libelle, solutionHTML?)`,
  `REVELATION_EN_PLACE`), un **3ᵉ état de verdict NEUTRE** — ni ✓ ni ✗, aucune animation,
  l'enfant n'a pas échoué, il a demandé à voir (`.lecon-reveal` côté leçon,
  `.rev-feedback.reveal` côté révision) —, l'entrée de journal marquée « n'a pas essayé »
  (`capterPasse({…, mode})`), le désarmement du widget sans jamais appeler `verify()`
  (`neutraliserScene({scene, classeFige, apres})`) et l'**annonce non visuelle**
  (`annoncerRevelation({scope, message, repli?})`). Ne varient que des **sélecteurs DOM** et
  le **mode** du journal, passés en paramètres — les deux écrans sont deux habillages, pas
  deux implémentations. Le choix de la région live vit dans **`annoncerStatut({scope, message,
  repli?})`**, dont `annoncerRevelation` n'est que l'habillage (il préfixe `REVEAL_LAB`) :
  d'abord la live region **du widget** monté (`#ltriStatus`, `#lappStatus`, `#lclicStatus`,
  `#probStatus` — contenu plus riche, et pas de doublon avec ce qu'elle dit déjà), sinon la
  région **fixe** de l'écran (`repli`, exclu de la première recherche pour ne pas dépendre de
  l'ordre du markup). C'est le seul canal d'un lecteur d'écran sur une question révélée (le
  focus part sur « Continuer ▶ ») : les deux copies indépendantes d'origine avaient laissé six
  formats de révision **muets** alors que les runners de leçon étaient déjà corrigés. La même
  fonction porte désormais les verdicts **ORDINAIRES** de la révision (cf.
  `revision.ts: annoncerVerdict` plus bas) — une seule règle de repli, quelle que soit l'issue
  de la question.
- **`lecon-passer.ts`** (#467) — habillage **mode leçon** du module ci-dessus, partagé par
  les neuf runners d'écran dédié (cinq à widget, quatre à saisie contrainte) : bloc de
  décision `decisionHTML(verifId, opts?)` (« Vérifier » + le lien `#leconPasser` en dessous,
  toujours actif même quand « Vérifier » est `disabled`), `wirePasser`, `masquerDecision`
  (#153), `capterPasse` (mode `'lecon'`) et `revelerSolution(opts)` (verdict NEUTRE, widget
  figé mais visible via `.lecon-fige`, annonce, puis `wireNext`). Une question révélée compte
  au **dénominateur** sans compter au score (0 XP, étoile perdue comme après une erreur) et
  n'est pas rejouée. Côté révision, l'équivalent vit dans `revision.ts` (`decideHTML`,
  `passerItem`, région fixe `#revStatus` posée **hors** de `#revStage`, que le verdict d'une
  saisie ou d'un QCM remplace en entier). Le figeage y a une contrainte propre : la classe
  `rev-stage--fige` est posée sur **`#revStage`**, qui **survit** d'une question à l'autre
  (seul son contenu est remplacé — c'est ce qui permet de câbler Entrée une seule fois).
  `renderCurrent` doit donc **dégeler** la carte (`degelerStage`) à chaque question ; sans
  quoi le `pointer-events: none` du figeage déteint sur **toute la suite de la séance** :
  plus un choix de QCM ni même le lien de déblocage cliquables, seuls les boutons
  « Écouter » (exclus du figeage) répondant encore. Le mode leçon n'a pas ce besoin, sa
  scène `.sprint-stage` étant reconstruite à chaque question. Cette région porte aussi les verdicts
  **ORDINAIRES** de la révision (`revision.ts: annoncerVerdict`, appelé par `grade` et par le
  chemin d'échec d'un mot d'orthographe) : « Bravo, c'est juste. » ou « Ce n'est pas ça. La
  bonne réponse : X. » (« Une réponse possible » sur un item corrigé par intervalle, #446 —
  libellé lu par `labelReponse`, commun au verdict affiché et à son annonce). Les quatre
  formats dont le verdict remplace toute la carte — saisie, QCM, mot, opération posée —
  n'annonçaient rien du tout : le focus part sur « Continuer ▶ », donc un enfant qui n'y voit
  pas ne savait pas s'il avait eu juste ou faux. Trou antérieur à #467, corrigé avec lui
  puisque l'infrastructure était là. Les formats à widget bavard (tri, appariement, clic-mot,
  problème) gardent leur propre annonce, `annoncerStatut` visant leur région en priorité.
- **`tuile-interaction.ts`** (#345) — **widget « tuiles » mutualisé** pour les trois
  formats interactifs sans clavier. Point d'entrée unique :
  `bindTuileInteraction(root, spec, opts) → TuileController`. `spec` est un `TuileSpec`
  discriminé par `kind` :
  - `'tuile'` — amener **la** bonne tuile (signe `<`/`=`/`>` ou nombre) dans la case `@`
    de l'énoncé ;
  - `'ordre'` — ranger les tuiles dans des **cases numérotées** : mots (ordre alphabétique
    #108) ou nombres (ordre croissant/décroissant #448, champ `nature` — formulation
    seulement) ;
  - `'tri'` — trier les tuiles-mots dans **deux colonnes-thèmes** (champs lexicaux).
  Le binder remplace le placeholder `[data-tuile-mount]` dans `root` (insertion à plat,
  sans wrapper), câble TAP et glisser-déposer, et notifie la complétude via
  `opts.onState(complete)` pour que l'appelant active son bouton « Vérifier ». La méthode
  `verify()` du contrôleur renvoyé fige le widget, applique les marques ✓/✗ (couleur +
  icône, pour le daltonisme) et renvoie la justesse ; elle est **idempotente**. La méthode
  **`reponse()`** (#391) expose l'état final posé/proposé/placé (`TuileReponse`, discriminé
  par le même `kind` — plus une 4e variante `'appariement'` produite par le widget du même nom
  ci-dessous, qui implémente le même contrat sans passer par ce binder) — lue par le runner en
  cas d'échec pour journaliser une réponse lisible (cf. « Journal des erreurs » ci-dessous). La
  variante `opts.variant` (`'lecon'` | `'revision'`) adapte la classe de l'énoncé et
  l'enveloppe `.bignum` des grands nombres (#240).
  **Persistance du focus (#360, étendue au rangement par #448)** : les widgets se
  redessinent par `innerHTML`, ce qui détruit l'élément focalisé — le focus retomberait sur
  `<body>` à chaque interaction, obligeant l'enfant au clavier à retabuler depuis le haut
  de la page 4 à 5 fois par question. `'ordre'` et `'tri'` mémorisent donc la cible
  (`pendingFocus`) et la refocalisent en fin de redraw (`preventScroll`) : après une pose,
  la **tuile suivante encore au bac** ; après un retrait, la **tuile relâchée** ; rangée
  complète, le **bac** lui-même (`tabindex="-1"`), d'où **une** tabulation atteint
  « Vérifier » — le focus n'est jamais posé sur « Vérifier » directement (un enfant qui
  enchaîne les Entrée validerait sans relire, action irréversible). Dans ce seul état, le
  bac prend un **nom accessible** (`role="group"` + `aria-label` « Rangée complète. Vérifie
  ta réponse avant de valider. ») : un conteneur focalisé doit s'annoncer (SC 4.1.2), et
  c'est le moment où l'enfant a besoin de savoir quoi faire ensuite. Nom **dynamique** :
  aucun rôle ni libellé tant que des tuiles restent à poser (le focus est alors sur une
  tuile) ni après validation ; `aria-label` est posé **avec** `role="group"` car ARIA 1.2
  l'interdit sur un élément générique. Le focus ne dépend que de l'interaction, jamais de la
  `nature` (invariant testé). Ce module est **partagé** par les trois
  runners de leçon (`lecon-tuiles.ts`, `lecon-ordre.ts`, `lecon-tri.ts`) et par la
  révision (`revision.ts`), qui délèguent tous leur interaction au lieu d'en garder une
  copie locale — la révision affiche désormais les mêmes marques ✓/✗ que les runners
  (correction de la divergence antérieure à #345). La révision partage de la même façon
  les deux autres widgets d'interaction mutualisés ci-dessous, `appariement.ts` et
  `clic-mot-interaction.ts` (#466) : trois moteurs auparavant dégradés en révision en un
  simple champ texte (repli `genLessonItem`) montent désormais leur vrai widget.
- **`appariement.ts`** (#392) — widget **« relier des paires »** par des LIGNES de
  liaison : deux colonnes de boutons-mots (mélangées **indépendamment**) + un calque
  SVG de courbes reliant les ancres, dessiné derrière les mots. `bindAppariement(root,
  spec, opts)` **ne passe pas par `tuile-interaction.ts`** (mécanique de tracé propre,
  incompatible avec les trois `kind` du binder mutualisé) — il **réutilise seulement**
  son contrat public `TuileController`/`TuileOptions` (mêmes `onState`/`verify()`/
  **`reponse()`** #391, qui renvoie la variante `TuileReponse` `'appariement'` — liens
  posés dans l'ordre d'affichage de la colonne de gauche, `null` pour un mot laissé sans
  lien) et la tuile `.tuile`, pour rester interchangeable côté runner. Interaction : **tap en
  deux temps** (taper un mot à gauche l'arme, taper un mot à droite trace le lien ;
  retaper un mot relié efface son lien) — fiable au doigt et **nativement clavier**
  (de vrais `<button>`, Entrée/Espace passent par `click`) — et **glisser-déposer en
  appoint** (souris, jamais l'unique voie, SC 2.5.7). `verify()` fige le widget et
  marque chaque lien ✓/✗ (couleur + pastille + trait plein/pointillé, jamais la
  couleur seule). Le SVG est `aria-hidden` (décoratif) : toute l'info de liaison est
  portée par les libellés des boutons + une live region ; les coordonnées sont
  mesurées **relativement au conteneur** (indépendantes du défilement) et un
  `ResizeObserver` les recalcule au redimensionnement/zoom (SC 1.4.4/1.4.10). Réutilisé
  tel quel par `lecon-appariement.ts` (runner de leçon) et, depuis #466, par la révision
  (`revision.ts`) — plus de repli en champ texte pour cette dernière.
- **`clic-mot-interaction.ts`** (#466) — **3ᵉ widget d'interaction mutualisé**, aux côtés
  de `tuile-interaction.ts` et `appariement.ts` : sélectionner un ou plusieurs mots d'une
  phrase répondant à une consigne. Extrait du runner `lecon-clic-mot.ts` pour être
  réutilisé à l'identique par la révision. Point d'entrée `bindClicMot(root, spec, opts) →
  ClicMotController` : remplace le placeholder `[data-tuile-mount]` par la phrase
  cliquable (mots en `<button>`, ponctuation en `<span>` inerte) + une live region ;
  sélection **multiple réversible** tant que non figée, notifiée via `opts.onState`.
  `verify()` fige le widget, compare l'ensemble sélectionné à `cibleIndices` par
  **égalité d'ensembles exacte**, marque ✓/✗ (mot-cible non choisi révélé en vert doux),
  annonce le verdict dans la live region et renvoie la justesse ; `selected()` expose les
  indices choisis pour le journal d'erreurs (#391). L'annonce live énonce « La bonne
  réponse : … » **sauf** si l'exercice déclare `explicationNommeCible` (#436) — son
  explication nomme déjà les mots, l'annoncer en plus les ferait entendre **deux fois** ;
  le drapeau vient de la **donnée** et est **ignoré** s'il n'y a pas d'explication à dire
  (la réponse est alors annoncée : jamais de repli silencieux). Consommé par `lecon-clic-mot.ts`
  (runner de leçon) et par la révision (`revision.ts`, #466). **Cible multiple** (#436) :
  les aria-labels énoncent alors l'**appartenance à la réponse** (« ce mot faisait partie
  de la réponse : les noms ») au lieu d'accorder la phrase avec `cibleLabel` — celui-ci
  est au pluriel dès que la cible l'est (tous les noms / déterminants d'une phrase au
  CE2), et la cible peut compter **plus de deux** mots.
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
- **`lecon-ordre.ts`** — runner **« ranger une suite »**, partagé par l'ordre
  alphabétique (#108, vocabulaire) et l'**ordre des nombres** (#448, numération CE2
  `num-ranger` — croissant/décroissant tiré par question). Le runner est **agnostique de
  ce qu'on range** : la `nature` de l'exercice (`'mots'` par défaut / `'nombres'`)
  n'accorde que la **formulation** (consigne du widget, type d'aide `ordre` vs
  `ordreNombres`, aria-labels des tuiles).
  Même forme « une question à la fois » : l'enfant
  **tape** une tuile du bac → elle se place dans la prochaine case **numérotée**
  de la rangée-réponse ; **taper** une tuile posée la renvoie au bac (les suivantes
  se re-tassent) ; glisser-déposer du bac vers la rangée en appoint. Feedback
  immédiat case par case (✓/✗) + bon ordre montré ; parité `recordLessonRun`. Routé
  par `runLecon` quand le mode produit un `tuilesOrdre`. Interaction validée côté
  UX enfant (tap fiable au doigt, drag en appoint). Délègue l'interaction à
  `tuile-interaction.ts` (#345, `kind: 'ordre'`).
  **Diagnostic de l'inversion** (#448, avis `pedagogue-primaire`) : quand la suite posée
  est l'**exact inverse** de la suite attendue, le runner ajoute un message ciblé
  (`messageInversion`, pur et exporté ; `.lord-inverse`) — au CE2 l'erreur typique est un
  **réflexe de sens** (« du plus petit au plus grand » par habitude) et non une erreur de
  comparaison, et les deux ne s'aident pas de la même façon. Le message s'**ajoute** à la
  révélation du bon rangement (`.lqcm-ko strong`, jamais supprimée : c'est l'information
  la plus utile, et la spec e2e y lit le sens tiré), et l'inversion **reste journalisée**
  comme toute autre erreur. Accordé à la `nature` : sens explicite pour des nombres,
  renvoi à l'ordre alphabétique pour des mots.
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
  vocabulaire, « une manche à la fois » (5 manches). `genManches` privilégie
  **`ExerciseType.generateSession`** quand la fabrique l'implémente (session entière
  tirée **sans remise**, garantie portée par la fabrique — cf.
  `data/francais/familles.ts:tirerSessionAppariement`, [Contenu &
  leçons](contenu-et-lecons.md)) ; repli historique sinon (`generate()` en boucle,
  dédupliqué au mieux sur l'ensemble des mots de gauche). Délègue l'interaction au widget mutualisé
  `ui/appariement.ts` (tap en deux temps + glisser en appoint). **Feedback différé** :
  le bouton « Vérifier » fige chaque lien (✓/✗) et révèle les bonnes paires en TEXTE
  sous le widget en cas d'erreur ; parité `recordLessonRun`. Structure calquée sur
  `lecon-tri.ts`. **Exclu du sprint** (`isPairingLesson`, comme la posée/l'ordre/le
  tri/le problème), avec un **repli texte** en bilan/fiche (`genLessonItem` : une paire
  tirée au sort → « quel mot va avec X ? ») — **en révision**, c'est désormais le **vrai
  widget** `appariement.ts` qui est monté, comme en leçon (#466). Aide contextuelle dédiée
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
  `genLessonItem` pour le **bilan / la fiche** — **en révision**, le board complet est
  monté (énoncé + toutes les sous-questions + brouillon), corrigé étape par étape via
  **`corrigerEtapesProbleme`** (exportée avec la constante **`PROB_STATUS_HTML`**, live
  region du verdict) : deux exports **partagés** avec ce runner et consommés par
  `revision.ts` (#466), qui mutualisent la correction et l'annonce a11y du verdict entre
  la leçon et la révision. La **question finale en gras** passe par la convention `**…**`
  rendue par `enonceTexte` (`core/items.ts`).
- **`lecon-clic-mot.ts`** (#259, #437, #436) — runner **« Clique sur le mot »**, une
  phrase à la fois, **agnostique de la notation grammaticale ciblée** : il consomme
  `consigne`, `explication`, `cibleIndices` et le `cibleLabel?` optionnel de
  l'`Exercise` `type: 'clicMot'` (`data/francais/grammaire-clic-mot.ts`), sans rien
  savoir du verbe/déterminant/pronom/etc. visé — 7 leçons le partagent (verbe #259 +
  natures CM1 #437 : déterminant, conjonction, pronom, nom noyau, sujet + natures CE2
  #436 : déterminant, nom, adjectif, pronom sujet). L'`Exercise`
  porte `tokens[]` (la phrase mot à mot), `cibleIndices[]` (l'ensemble EXACT des
  indices-cibles, **stocké** à la génération, **adjacents ou non**), `consigne`,
  `explication`, `parle`. Chaque MOT est un `<button>` cliquable, la **ponctuation** un
  `<span>` inerte (`estPonctuation`). **Sélection multiple réversible** (`.is-selected`,
  aucune correction au 1er tap) ; « Vérifier » (désactivé tant qu'aucun mot n'est choisi)
  compare l'ensemble sélectionné à `cibleIndices` par **égalité d'ensembles exacte** —
  cible multi-mots adjacente (verbe au passé composé, 2 mots) OU **non adjacente**
  (« ni…ni », sujet composé « Paul … Léa » en sautant « et », **tous les noms /
  déterminants** d'une phrase au CE2 : jusqu'à 3 mots). Feedback différé : mots
  marqués `.correct`/`.wrong` + pastille ✓/✗, **bon(s) mot(s) révélé(s)** dans la phrase
  (`.is-cible`, vert doux) même en cas d'erreur, `explication` sous la phrase ; chaque
  mot marqué `.correct` reçoit un flash `reussite-flash` (par mot, pas conditionné à un
  sans-faute global). Les aria-labels de correction nomment la cible via `cibleLabel`
  (repli générique « la bonne réponse » si absent) ; cible **multiple**, ils énoncent
  l'appartenance à la réponse (le libellé peut être au pluriel, cf.
  `clic-mot-interaction.ts`). L'annonce live (`#lclicStatus`), le **repli fiche/bilan** et le
  **journal d'erreurs** énoncent une cible non contiguë via `libelleCible` (source unique) :
  **énumération française** — « Paul et Léa » à deux mots, « cour, enfants et ballon » à
  trois (jamais « Paul Léa », « ni ni » ni « cour et enfants et ballon »).
  Consigne **persistante** + **TTS** (`bindConsigneTts`) sur la consigne ET la phrase
  entière, journal via `capterErreur`. **Exclu du sprint** (`isClicMotLesson`), **repli
  texte** en bilan/fiche (`genLessonItem` : phrase → « Recopie ${cibleLabel} : … »,
  consigne neutre valable pour les 7 leçons) — **en révision**, c'est désormais le **vrai
  widget** de sélection qui est monté, via `clic-mot-interaction.ts` (#466, extrait de ce
  runner pour être partagé). Structure calquée sur
  `lecon-appariement.ts`/`lecon-probleme.ts` (état de module + `lecon-runner-shared.ts`).
  Aide contextuelle dédiée (`monterBoutonAide`/`maybeAutoAide`, type `'clicMot'` #272).
- **`lecon-droite-graduee.ts`** (#256) — runner **« Droite graduée »** (placer un
  nombre), une droite à la fois. Consomme l'`Exercise` `type: 'droiteGraduee'`
  (`data/maths/droite-graduee.ts`) : la droite est une **coquille SVG
  `role="radiogroup"`** (`renderDroiteGradueeInteractif`, `core/figures/droite.ts`)
  où chaque graduation est un `radio` (bandes verticales transparentes qui PAVENT
  l'axe → **tap aimanté** sur la graduation la plus proche) ; le repère mobile corail
  est dessiné dans `.dg-repere` (`repereMarkup`). **Sélection réversible** (aucune
  correction au 1er tap) ; « Vérifier » (`#dgVerify`, désactivé tant qu'aucune
  graduation choisie) compare la graduation choisie à `cible`. **Clavier** (WCAG
  2.1.1) : flèches ← → / Début / Fin déplacent le repère de graduation en graduation,
  Entrée valide ; focus visible sur la bande visée. Feedback différé : la coquille est
  remplacée par une **figure statique de RÉVÉLATION** (`renderDroiteGraduee` : repère
  juste en vert plein ; en cas d'erreur, repère de l'enfant en rouge à tête creuse en
  plus), verdict en **live region** (`#dgStatus`), journal via `capterErreur`. **Exclu
  du sprint** (`isDroiteGradueeLesson`), **repli LECTURE** en bilan/fiche/révision
  (`genLessonItem` : droite avec repère à la cible → « Quel nombre est repéré ? »,
  réponse numérique). Aide contextuelle dédiée (type `'droiteGraduee'` #272). Structure
  calquée sur `lecon-clic-mot.ts` (état de module + `lecon-runner-shared.ts`).
- **`sprint.ts`** — mode sprint 5 min (compte à rebours, questions une par une),
  **filtrable** (toutes matières / une matière / une catégorie / **une sélection
  précise de leçons** via `startCustomSprint`, #64) via un écran de
  configuration ; correction par `checkItemAnswer` (numérique ou texte).
  **Exclusions du sprint** (`lessonsForFilter`) : par TYPE d'item (posée, tuiles
  ordre/tri, problème, appariement, clic-mot, droite graduée — détecté via l'étiquette déclarative
  **`ExerciseType.exerciseKind`**, #348, via les helpers `isPosedLesson`/
  `isOrderingLesson`/`isTriLesson`/`isProblemeLesson`/`isPairingLesson`/`isClicMotLesson`/`isDroiteGradueeLesson` de
  `core/catalog.ts`) **et** par le flag déclaratif **`LessonDef.excludeFromSprint`** (#104) pour une leçon qui produit un
  item `text` ordinaire mais ne convient pas au chrono (figure de découverte,
  lecture d'énoncé — ex. « Je partage »). L'écran de config ne compte que les
  leçons **éligibles** (une catégorie entièrement exclue n'est pas proposée). Le
  réglage de profil **« sans pression temporelle »** (#223) masque le minuteur et le
  score ici et bascule la fin en mode doux — détaillé dans la section Accessibilité.
  **Validation à VIDE = réponse fausse assumée** (#467) : `sprintSubmit` ne refuse plus
  un champ vide — `sprintAnswer('', true)` la traite comme n'importe quelle réponse
  fausse (révélation de la solution, question comptée, aucun point ni XP), journalisée
  avec le marqueur `sansTentative` (cf. [Espace encadrant](espace-encadrant.md)). Le
  sprint n'a **délibérément pas** de bouton « Je ne sais pas, montre-moi » (un skip
  gratuit sous chrono gonflerait le record sans coût) : valider sans rien écrire EST sa
  sortie de secours pour l'enfant coincé, au même prix qu'une erreur.
  `sprintShowCorrection` affiche alors un rappel neutre (« Pas de réponse cette fois. »,
  `RAPPEL_SANS_REPONSE`) à la place de « Tu as répondu … ». **Refus de saisie**
  (`sprintRefuse`) : subsiste seulement là où un nombre est attendu (`itemEstNumerique`),
  pour une saisie que `saisieEstNombre` (`core/nombres.ts`) ne reconnaît pas comme un
  nombre (« Ce n'est pas un nombre. Corrige ta réponse, puis valide. », ex. « 3- » — un
  caractère parasite du pavé numérique Android) : `sprintAnswer` n'est **jamais appelé** —
  rien n'est corrigé, compté ni journalisé —, la saisie est **conservée** curseur en fin
  (redemander toute la frappe multiplierait les occasions de la rater), le message
  s'affiche dans `#sprintHint` et est annoncé via la région live `#sprintStatus`
  (`sprintAnnonce`), et se cache dès la retouche du champ (`sprintCacheHint`, sur
  l'événement `input`). **Écho de frappe** (`.sprint-input.frappe`) : un bref rebond CSS
  relance à chaque caractère (utile à l'enfant qui regarde le clavier et valide sans
  relire), neutre (aucune couleur, ce n'est pas un verdict) et coupé sous
  `prefers-reduced-motion`.
- **`session.ts`** (#349) — session d'exercice grille : vérification, saisie clavier,
  impression contextuelle (#40). Quatre exports :
  - **`verify()`** — **bloque d'abord** sur toute saisie non vide qui n'est pas un
    nombre là où un nombre est attendu (`itemEstNumerique` + `saisieEstNombre`,
    `core/items.ts`/`core/nombres.ts`) : AVANT même l'arrêt du chrono, les champs
    concernés sont signalés (`signalerSaisiesIllisibles` — teinte d'attention, jamais
    rouge, ce n'est pas une faute mais une réponse illisible ; message rattaché par
    `aria-describedby`, WCAG 3.3.1 ; le premier champ reçoit le focus) et la
    vérification s'arrête là — rien n'est corrigé, rien n'est compté, rien n'est
    journalisé. Un champ **vide** ne bloque pas (ne pas répondre reste permis). Une
    fois les champs corrigés, lit les champs `.ans` du DOM (dont la fusion « H h MM »
    des saisies d'heure, #88), construit une liste de `ScoredInput` (données pures,
    sans référence DOM), délègue le **calcul du score à `core/scoring.ts`**
    (`scoreItems`), puis marque les champs selon les `statuses` renvoyés (✓/✗ +
    révélation de la réponse) et rend le bandeau de résultats et les récompenses.
    Retire aussi l'astuce ci-dessous (`#astuceReponseVide`) : le verdict posé, elle
    n'a plus d'objet et contredirait l'avertissement des 60 % qui invite à remplir.
    Pose enfin, sous chaque grille posée ratée, le lien d'étayage de la notion (#490,
    `poserLiensEtayagePosee`, cf. « Étayage de la notion » plus bas) — jamais sur un
    simple champ texte/numérique.
  - **`afficherAstuceReponseVide()`** (#467) — pose en tête de `#sheets` un message
    **découvrabilité** du droit de laisser une réponse vide (« Tu ne sais pas quoi
    répondre ? Tu peux laisser la réponse vide et continuer. ») : la fiche/le bilan en
    saisie tolèrent déjà un champ vide (neutre à la correction, essai compté dès 60 %
    de champs remplis), mais rien ne le disait — un enfant pouvait se croire obligé de
    tout remplir et rester bloqué sans autre issue que d'abandonner la séance. Posée
    par `afterStart` (`ui/navigation.ts`), donc lue AVANT le blocage, sur tous les
    écrans à champs qui y passent (leçon en saisie, bilan express/complet, reprise des
    erreurs). Information, pas alerte (ni `role="alert"` ni teinte `--warn`), **non
    collante** (contrairement à `.verify-hint`) et **`screen-only`** (le markup de
    fiche est partagé avec l'impression). **Volontairement sans `data-tts`** — choix
    du mainteneur : `bindConsigneTts` lit le **premier** `[data-tts]` de l'écran en
    lecture auto, et l'astuce placée en tête volerait cette lecture à la vraie
    consigne de l'exercice ; elle reste donc **inaudible** par le bouton « Écouter »,
    contrairement au reste des consignes (#42). Posée **dans** `#sheets` (pas en frère,
    comme `#resultBanner`) : elle est ainsi capturée par l'instantané de reprise
    (`captureResume`) et réapparaît à la reprise d'une fiche interrompue, qui ne
    repasse pas par `afterStart`.
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

## Étayage de la notion (#490)

- **`etayage-panneau.ts`** — couche **UI** du socle pur `core/etayage.ts` et de ses six
  moteurs de résolution (cf. [Logique pure](core.md)) : **un seul panneau, six
  points d'entrée**, sur le modèle déjà pris pour la révélation neutre
  (`revelation-neutre.ts`) — un fond commun, des habillages. Forme : la mini-modale
  a11y de l'aide au geste (#272, `activateModal` — piège de focus, arrière-plan
  `inert`, Échap, tap-dehors, mascotte, TTS à la demande), mais un CORPS différent et
  délibéré : l'aide au geste montre trois phrases sans état, une résolution a un
  ÉTAT qui s'accumule (la grille se remplit). D'où un déroulé **pas à pas** piloté
  par l'enfant — jamais un pavé, jamais d'avance automatique — une SEULE colonne
  active à la fois, nommée en mots ET surlignée (jamais la couleur seule), en
  `--accent` (jamais `--ok`/`--ko`, qui disent « ta réponse est juste/fausse » : ce
  panneau EXPLIQUE, il ne corrige rien — aucun nouveau chemin de correction, donc
  aucune obligation côté journal d'erreurs #391).
  **`ouvrirEtayage(demande: EtayageDemande)`** compose l'overlay : le VISUEL de
  démonstration du moteur + le déroulé de ses pas (les deux fournis par
  **`moteurEtayage(exemple)`**, cf. `etayage-visuels.ts` ci-dessous) + une barre de
  progression + le renvoi à la **leçon prérequise** (`prerequisHTML`,
  `core/etayage.ts:leconPrerequise` — jamais un lien de NAVIGATION, on ne propose pas
  à un enfant de quitter la série qu'il vient de commencer ; il peut en revanche la
  **mettre de côté** : `epinglerPrerequis` l'ajoute à la file « à revoir » du profil
  ACTIF via `toggleRevoirFor`, le même geste que l'épinglage de l'espace encadrant
  mais à l'initiative de l'enfant, cf. [Espace encadrant](espace-encadrant.md)).
  **`etayageDisponible(lesson, niveau, mode?)`** conditionne tout affichage — jamais
  sous chronomètre (sprint/express/complet, comme l'aide au geste), jamais sans
  entrée `etayagePour` pour la leçon. Sans contenu pour cette leçon, `ouvrirEtayage`
  n'ouvre RIEN mais appelle quand même `onFerme` : l'appelant n'a pas à savoir si le
  panneau existe.

  **Six points d'entrée**, tous conditionnés par `etayageDisponible`. Les deux qui
  s'attachent à un ÉCRAN d'exercice passent par **`brancherEtayageEcran(conteneur,
  lesson, mode?)`** — un seul appel par écran, qui tient l'ordre (bouton d'abord, puis
  l'exemple, lui-même après l'aide au geste) au lieu de le laisser recopier :
  - le **bouton persistant** de l'en-tête (`monterBoutonEtayage`), posé à la fois par
    `ui/navigation.ts:runLecon` (leçon en fiche, ancré sur `#sheets .fiche`) et par
    `ui/lecon-runner-shared.ts` (les runners d'écran dédié, ancré sur
    `#sheets .sprint-stage`, cf. « Runners d'exercice » ci-dessus) — rouvre la
    méthode à tout moment de la série, pour l'enfant qui a oublié dès la 2ᵉ question ;
  - l'**exemple d'avant-série** (`maybeEtayageAvantSerie`, posé aux MÊMES deux
    endroits) : SEUL point d'entrée AUTOMATIQUE, donc seul à porter une mémoire
    (`core/progress.ts:loadEtayagesVus`/`marquerEtayageVu`) et une borne
    (`core/etayage.ts`) ; ne s'affiche jamais par-dessus l'aide au GESTE (#272) si les
    deux se présentent au même lancement — deux modales empilées avant la question 1
    seraient un péage ;
  - le **lien posé sous une grille posée ratée** de la fiche
    (`poserLiensEtayagePosee`, appelé par `ui/session.ts:verify()` après correction,
    cf. ci-dessous) : une offre par GRILLE plutôt que par chiffre, et déclenchée plus
    largement que le journal d'erreurs (#391, qui n'agrège que les résultats faux) —
    une retenue ou un produit partiel raté est justement ce que l'étayage explique le
    mieux, même quand le résultat final est juste ;
  - le **lien posé sous le verdict d'un runner** (`lecon-runner-shared.ts:wireNext`,
    paramètre optionnel `etayage`) : le pendant, pour les écrans dédiés, du lien de la
    fiche. Fourni SEULEMENT quand l'enfant s'est trompé (on n'explique pas une
    réussite), et avec l'exercice raté quand le runner sait le décrire — le tableau de
    conversion (`conversionDepuisTableau`), la droite graduée (`droiteDepuisExercice`) et
    le problème (son énoncé et ses sous-questions) déroulent ainsi CELUI-LÀ, pas
    l'exemple de la leçon. Le lien vit dans la zone de feedback, donc AVANT
    « Continuer ▶ » dans l'ordre de tabulation, et porte `role="status"` : le focus part
    sur « Continuer », et sans région live un enfant au lecteur d'écran n'apprendrait
    jamais que l'offre existe ;
  - en **révision espacée**, le lien posé au **verdict d'une erreur**
    (`ui/revision.ts:verdictHTML`, `lienEtayageHTML`) : APRÈS la bonne réponse, AVANT
    « Continuer ▶ » — l'enfant lit d'abord ce qu'il cherchait, choisit ensuite
    d'approfondir (un lien aussi lourd que « Continuer » serait cliqué par réflexe) ;
  - toujours en révision, **« Je ne sais pas, montre-moi »** (`ui/revision.ts:passerItem`) :
    seul point d'entrée où le panneau passe **AVANT** le verdict — sinon l'enfant lit
    le résultat neutre de #467 et saute l'explication. Le panneau franchi (ou
    absent), `verdictPasse` reprend le verdict habituel de #467, inchangé. Intégration
    **propre à la révision** : le mode leçon n'a pas de « Je ne sais pas, montre-moi »
    sur une opération posée (elle se joue en fiche, pas dans un runner à widget), donc
    rien à brancher côté `ui/lecon-passer.ts`.

  Libellé **« Comprendre la méthode »** et icône **`brain`**, tous deux NEUTRES quant à
  la matière : le panneau s'ouvre aussi bien sur une conjugaison que sur un calcul, et
  l'ancien « Comprendre ce calcul » sous une icône de signes opératoires devenait faux
  dès qu'il expliquait « nous viendrons ». Distincts, là encore, de l'ampoule de l'aide
  au geste. Styles dans `styles/etayage.scss`.

- **`etayage-visuels.ts`** — un DESSIN par moteur, et le seul endroit à changer quand un
  moteur s'ajoute : **`moteurEtayage(exemple)`** aiguille (un `switch`, pour que chaque
  branche garde le type CONCRET de son moteur — le déroulé de la droite porte un état que
  les autres n'ont pas) et rend `{deroule, visuel(i)}`. Le panneau redessine le visuel EN
  ENTIER à chaque pas plutôt que de le retoucher : les états sont peu nombreux, le rendu
  est pur, et « Précédent » n'a ainsi rien à défaire — donc rien à oublier de défaire.
  Règle commune aux six visuels, plus importante que leur code : la démonstration a la
  MÊME géométrie que l'exercice réel (`.posee-*` du calcul posé, `.tc-*` du tableau de
  conversion, la figure `core/figures/droite.ts`), un enfant en difficulté n'ayant pas à
  réapprendre un format visuel en plus de la méthode. Les cases portent leur clé en
  `data-cible` — pas pour le rendu, mais comme sélecteur stable des specs Playwright.
  Le visuel entier est `aria-hidden` : tout ce qu'il montre est déjà DIT par la
  narration, et l'étiqueter à moitié ferait entendre une grille de chiffres nus en plus
  de l'explication.

  **Lisibilité non visuelle du déroulé** (relecture a11y) : le compteur d'étapes est sa
  propre région live et PRÉCÈDE la phrase — l'enfant qui n'y voit pas entend d'abord où
  il en est, puis quoi faire —, la barre de progression ne fait que le redire en image
  et est donc `aria-hidden`, et la grille de démonstration l'est aussi : ses cellules
  sont des `<span>` qui se remplissent, et tout ce qu'elles montrent est déjà DIT par la
  narration (l'étiqueter à moitié ferait entendre une grille de chiffres nus en plus de
  l'explication). Compteur et première phrase sont rendus **déjà remplis** : une région
  live armée dans le même battement que l'insertion de la modale avale sa première
  annonce, et l'étape 0 est justement celle qu'aucun geste n'annonce. Le préremplissage
  ne suffit pourtant PAS — une région live rendue déjà pleine n'a pas muté, donc n'est en
  général pas annoncée : c'est **`aria-describedby="etayRegle etayPhrase"`** sur le
  dialogue qui fait entendre la règle et la première phrase à l'ouverture, la région live
  ne prenant le relais qu'aux pas suivants. Dans le même esprit, cacher « Précédent » en
  revenant à l'étape 0 lui reprendrait le focus qu'il détient encore (un élément caché le
  rend au `<body>`) : `afficher` le repasse alors explicitement à « Suivant ». Le texte lu passe
  par `core/tts-text.ts:texteParle`, comme toutes les consignes — sans quoi le fait
  numérique qui fait tout l'intérêt du panneau (« 7 × 6 = 42 ») serait rendu au moteur
  vocal avec ses symboles bruts, souvent muets.

  **Cas RÉDIGÉ, sans déroulé** (#490 PR 3, désormais la forme la PLUS fréquente — la
  majorité des leçons de maths n'ont que `regle` + `etapes`, sans `exemple`) : le
  panneau tient sur un seul écran, sans rien de ce qui précède — ni visuel, ni
  compteur ni barre de progression, ni bouton « Précédent » (une seule sortie,
  directe). La mascotte change de phrase en conséquence : `MASCOTTE_DEROULE` (« On y
  va ensemble, étape par étape. ») promet un pas-à-pas qui n'existe QUE si un moteur
  déroule un exemple ; `MASCOTTE_REDIGE` (« Voilà comment on fait, tranquillement. »)
  évite d'annoncer un bouton Suivant introuvable (constat `relecteur-accessibilite`).
  Le bouton « Écouter » lit alors la `regle` ET les `etapes` ensemble
  (`etayage-panneau.ts`) : sur du contenu rédigé, les étapes SONT la méthode, pas un
  supplément qu'on pourrait taire.

  **Contrainte d'écriture** pour tout contenu RÉDIGÉ, quelle que soit la matière
  (maths et français, #490 PR 3/PR 4) — parce que ce texte est lu à voix haute par `texteParle` autant
  qu'à l'œil : les milliers se séparent par l'espace fine insécable U+202F (la seule
  que le moteur vocal recolle en un seul nombre), et jamais de flèche « → » —
  `texteParle` (`core/tts-text.ts`) la rend SILENCIEUSE (elle marque un trou dans
  « X → @ »), ce qui romprait le connecteur d'une phrase énoncée ; on l'écrit en
  toutes lettres.

## Menu, préférences, thèmes & accessibilité

- **`menu.ts`** — liste déroulante de profils (`open/close/toggleProfileMenu`),
  extrait pour éviter un cycle `main ↔ navigation`. Ce cycle-là ne pouvait PAS rester en
  l'état : `main.ts` appelle ces helpers dans son câblage d'événements **au chargement**
  (`wireDOM()`, exécuté au bootstrap), donc une dépendance circulaire aurait fait lire un
  export **avant** qu'il n'existe.

  **Critère qui décide si un cycle d'imports doit être cassé par extraction, ou peut
  rester tel quel** (à appliquer avant de proposer une extraction, cf. `seance.ts` ↔
  `recap-seance.ts` ci-dessus, dans « Récap éphémère de fin de séance », pour le second
  cas) : un cycle **casse** dès qu'un des deux
  modules **utilise l'import au chargement** — effet de bord de niveau module, comme ici
  (`wireDOM()`), ou constante dérivée d'un export de l'autre module évaluée en haut de
  fichier. Un cycle où l'import n'est **utilisé qu'à l'intérieur d'une fonction** (appelée
  après que les deux modules ont fini de s'évaluer) est **sans risque** : à l'exécution,
  les deux exports existent déjà, peu importe l'ordre d'évaluation initial des modules.
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

**Rampe de gris et contraste AA (#576).** Trois niveaux de texte : `--ink` (principal),
`--grey` (secondaire), `--muted` (discret). `--muted` a longtemps été **sous AA**
(`#9aa1ac` ≈ 2,6:1 sur `--paper`) et se contournait à la main, feuille par feuille — quatre
overrides `--grey` avaient fini par exister, chacun redécouvrant le problème. Corrigé à la
source (`#5c6470`) : la valeur est calée sur la surface la plus **serrée** où ce texte
atterrit vraiment, l'`--accent-soft` du thème « fruit rouge », **pas** sur le blanc — un
token qui ne passe AA que sur `--paper` laisse échouer tout ce qui est posé sur un fond
teinté. Les overrides existants sont **conservés** (y revenir éclaircirait ces textes sans
rien gagner, et deux d'entre eux portent une autre raison : une région live et un alignement
sur les sous-lignes voisines) ; seuls leurs commentaires ont été remis à jour.

Ce paragraphe **est** le rejet écrit de ces quatre overrides, au sens de la règle de sortie
de relecture (#585, cf. `CLAUDE.md`) : ils sont conservés **délibérément**, pas par oubli.
Inutile de les re-remonter en relecture — et c'est précisément ce cas qui a servi de cas
d'école à la règle, puisque le défaut de token avait été constaté trois fois, contourné trois
fois, et corrigé zéro fois.

Piège associé, corrigé au même endroit : **une `opacity` sur un conteneur dilue tout son
contenu**. La carte d'un trophée verrouillé était à `0.55`, ce qui faisait tomber son titre
à 3,9:1 et sa description à 2,6:1 — le « gris `#a1a1a1` » vu par axe n'est écrit nulle part,
c'est `--grey` traversé par l'opacité. Aucun token ne peut corriger ça (même `--ink`, à
17:1, y retombe à 3,9:1) : l'opacité est remontée à `0.85`, la désaturation restant le
signal fort. Les deux règles sont tenues par `tests/contraste-tokens.test.ts`, thème par
thème (cf. [Tests](tests.md)).

**Table de paires de tokens (#582).** Le même test éprouve désormais **tous** les couples
(texte, surface) constatés dans les feuilles — pas seulement la rampe — au seuil 4,5:1 pour
du texte et 3:1 pour un composant d'interface, sur les six thèmes. **Réflexe à avoir avant
de poser une couleur** : la mesurer avec `node tools/contrast/contrast.mjs`, qui partage sa
formule avec le gate ; et si un nouveau couple apparaît, l'**ajouter à la table** — sinon il
n'est gardé par rien. Les défauts connus non corrigés y sont déclarés en dérogation avec
leur issue (#385, #438, #600, #601) ; ces dérogations **échouent le jour où le défaut est
corrigé**, pour forcer leur retrait.

Token associé, introduit à cette occasion : **`--field-line`** (#386), la ligne de base d'un
champ de réponse (`.ans` et dérivés). Elle était en `#333` **codé en dur**, donc jamais
réécrite par les thèmes : en Nuit, `#333` sur `--paper` (`#222a36`) tombait à 1,14:1 et
l'enfant ne voyait plus **où écrire** tant qu'il n'avait pas cliqué dedans (seul le `:focus`
restait visible). À ne pas confondre avec `--line`, qui reste **décoratif** (filets,
séparateurs) et exempté du 3:1 : `--field-line` est le seul indice de l'emplacement de
saisie, donc un composant d'interface. Valeur claire inchangée (`#333333`, rendu identique
sur les cinq thèmes clairs), `#aeb7c4` en Nuit (7,1:1).

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
