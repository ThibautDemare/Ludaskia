[← Architecture Ludaskia](../ARCHITECTURE.md)

# Espace encadrant (#234)

Vue gatée `#encadrant` (dans app.html, **pas** une page séparée), réservée aux adultes
(parents/enseignants) et **distincte de l'espace enfant** : voix « **vous** » (cf. Voix,
cas (d)), chrome neutre (token `--admin-bg` + accent `--admin-accent` bleu, stables quel
que soit le thème déblocable), densité d'info plus élevée, aucun vocabulaire visuel
enfantin. **Accès** : lien sobre en pied de l'écran « Mon espace » (`#btnEncadrant`) **et**
item « Espace encadrants » (gris + cadenas) dans le menu profils de la barre — jamais un bouton
permanent visible dans la barre de l'enfant.

## Organisation en onglets (#459)

La vue est découpée en **4 onglets**, dans l'ordre de fréquence d'usage
décroissante : **Suivi** (observer, onglet par défaut) → **Programme**
(préparer) → **Réglages** (configurer) → **Profils** (gérer) — type `EncTab` /
`ENC_TABS` et l'état d'onglet actif vivent dans `ui/encadrant-commun.ts`
(module feuille, transverse à toutes les sections). Un **en-tête de contexte**
persistant « Vous consultez : [profil ▾] » (`<select data-act="set-consulte">`,
simple libellé si un seul profil) surmonte la barre d'onglets ; il est
**distinct** du bouton « Retour à [prénom] » de la barre du haut, qui nomme le
joueur **actif** — les deux notions ne sont jamais fusionnées.

**Sous-routes de hash** `#encadrant/<onglet>` (Suivi = `#encadrant` sans
suffixe) : lien direct + restauration de l'onglet au rechargement ; `route()`
(cf. [Modes & navigation](modes-et-navigation.md)) matche
`h === 'encadrant' || h.startsWith('encadrant/')`. Un clic d'onglet
synchronise le hash via `history.replaceState` **sans re-router** (pas de
`hashchange` déclenché → ne réinitialise pas le profil consulté).

**Choix v1 assumé** : l'en-tête de contexte et la barre d'onglets ne sont
**pas** collants (la barre d'outils de l'app l'est déjà ; un second en-tête
collé entrerait en conflit) — le prénom du profil consulté reste donc répété
dans les titres de section (« Progression de … », « Révisions de … »,
« Programme du jour de … ») comme filet tant que ce sticky n'est pas fait
(polish différé).

Répartition des blocs par onglet :
- **Suivi** — récap de progression (chiffres-clés, activité 7 jours, notions
  par catégorie + frise, listes de dictée suivies, historique des erreurs),
  **puis** le récap de révision espacée (#423).
- **Programme** — composeur du programme du jour (#440), puis « À revoir
  ensemble » (épinglées + suggestions + retirées automatiquement, #465) et
  « Proposer une dictée à l'avance » :
  deux actes de **préparation**, sortis du récap de Suivi (qui garde un simple
  renvoi textuel vers cet onglet pour les dictées prédéfinies non commencées).
- **Réglages** — classe scolaire, aménagements dys/attention, longueur d'une
  séance de révision, leçons déjà vues en classe (#478), code d'accès PIN.
- **Profils** — liste/gestion des profils + sauvegarde.

## Consultation SANS bascule

**Consultation SANS bascule** : on lit la progression de **n'importe quel** profil par
UUID, sans changer le profil actif. Tout l'accès stats usuel lit le profil/niveau ACTIFS ;
ici, `core/encadrant-stats.ts` lit les **clés brutes** `uuid + '/' + KEY` (via `lsGetRaw`,
sur le modèle de `getXPFor`) et résout le niveau depuis la méta du profil **consulté**
(`niveauProfilMatiere`). **Invariant** (testé) : aucune lecture du tableau de bord ne touche
`meta.active` ni `activePrefix`. Chaque carte profil propose « Voir le suivi » (≠ bascule) ;
l'enfant consulté est nommé par le titre du récap (emoji + « Progression de [prénom] »), et
le bouton « Retour à [prénom] » nomme le joueur **actif** (pas le consulté).

## Gestion des profils (#234)

**Gestion des profils** (#234) : créer / renommer / avatar / **réinitialiser** / **supprimer**
(+ export/import) vivent dans l'**onglet Profils** (#459), fusionnés à la liste de
consultation (carte par enfant : « Voir
le suivi » + repli « Gérer ce profil »). Opérations par UUID (`renameProfile`/`setProfileEmoji`/
`resetProfile`/`deleteProfile`/`exportProfiles`/`importProfiles`). L'écran enfant « Mon espace »
ne permet que l'édition de SON profil.

## Récap = outil d'accompagnement, pas un bulletin

**Récap = outil d'accompagnement, pas un bulletin** (avis `pedagogue-primaire`) : état par
notion/catégorie en **4 niveaux** (`niveauNotion` : à découvrir / non acquis / en cours /
acquis), piloté par le **`%` récent JAMAIS affiché en nombre** ; « N notions maîtrisées
récemment » (jalons datés) ; **2-3** leçons « à revoir » (perf récente < 70 %) ; graphe
d'activité 7 jours (journal `ludaskia_activity`). **Bannis** : moyenne/note globale, XP comme
niveau scolaire, classement, comparaison entre profils, temps-performance.

**Signal « butée à répétition » (#485)** : une leçon sur laquelle l'enfant a buté ≥
`BLOCAGES_SIGNAL_ADULTE` (3) **jours** dans la leçon du jour (cf.
[Logique pure](core.md) ; le 1er blocage ne reporte rien, donc 3 blocages = 2e mise de
côté) rejoint la file « à revoir » **même si son `%` récent la ferait paraître solide** —
ce `%` mélange aussi le sprint et les bilans, où la leçon peut ne peser qu'une question,
alors que le report ne réagit qu'à des essais complets en mode leçon. Une telle notion
passe aussi **devant** les autres suggestions dans le tri (`RecapNotion.blocages`) : un
mur qui revient appelle une explication humaine, pas une répétition de plus. Reste une
**suggestion**, jamais un épinglage automatique.

La ligne concernée porte un **marqueur visible** (#492, `signalBlocage` →
`.enc-revoir-signal`) : puce cerclée « **reste un point dur** », **en plus** du badge
d'état d'acquisition et jamais à sa place (« où en est la notion » ≠ « ça coince ») ; ce badge
est désormais porté par les deux sous-blocs, épinglées comprises (#518). Le **nombre de jours
n'est jamais affiché** (un chiffre sur un enfant se lit comme une note) : il vit dans le
`title`.
Le marqueur apparaît **aussi sur une ligne déjà épinglée** — épingler fait passer la notion
des suggestions aux épinglées, le signal ne doit pas disparaître au moment où l'adulte agit.
Wording « reste un point dur » et non « revient souvent » (avis `redacteur-contenu-francais` :
« revient » se lisait aussi comme « revient souvent dans les exercices », lecture neutre qui
annulait le signal) ; liseré en `--warn` plein, seule teinte qui se détache du `--paper` de
la carte (avis `relecteur-accessibilite`), le texte restant en `--ink`.

**Suivi par leçon** : dans le détail dépliable d'une catégorie, chaque leçon affiche
« travaillée N fois · dernière fois … » — `RecapNotion.vues` (= `LessonStat.attempts`) et
`RecapNotion.derniereFois` (= `LessonStat.lastAt`, horodatage alimenté par
`recordLessonStats`). Le libellé (`libelleDerniereFois`) reste relatif tant que c'est lisible
(aujourd'hui / hier / il y a N jours), sinon bascule en date absolue au-delà d'une semaine.

**Couverture par matière** : bloc « Couverture par matière » en tête de « Notions par
catégorie » (`RecapMatiere`, roll-up dans `RecapProfil.parMatiere` des catégories d'une même
matière) : « X/total travaillées · Y acquises » par matière, pour équilibrer l'entraînement
entre matières plutôt que se focaliser sur une seule. Chaque catégorie affiche le même
dénombrement (`RecapCategorie.travaillees`). Comptage factuel, aucune note.

**Tendance par notion** (signal COURT TERME, pas une note) : puce ↗ « en progrès » / →
« stable » / ↘ « à relancer » à côté de l'état, dérivée de la fenêtre glissante `recentPct`
(`tendanceNotion` : compare la moyenne de la 1re et de la 2de moitié de la fenêtre). **Masquée
sous 4 essais** — un signal sur trop peu de données serait du bruit lu comme une régression.
Formulée en action, jamais en verdict (« à relancer », jamais « en baisse ») ; couleur en
indice **secondaire** porté par le glyphe (`aria-hidden`), mot en `--ink`, libellé `sr-only`
(« Tendance : … ») pour les lecteurs d'écran. Reste un instantané, sans historique par
elle-même — l'historique daté vit dans la frise d'évolution ci-dessous (#397).

## Frise d'évolution (#397)

**Frise d'évolution** par matière, sous « Notions par catégorie » : une rangée de colonnes
hebdomadaires par matière (**12 dernières semaines**, `SEMAINES_FRISE`), hauteur = nombre de
**notions distinctes** ayant franchi un cap (« en cours » ou « acquis ») cette semaine-là
(`frisesParMatiere`, calculée sur le journal daté `ludaskia_paliers` / `PaliersNotion`).
Alimentée par `recordMonteesPalier(lessonIds, now)` (`core/progress.ts`), appelé **après**
l'écriture de l'étoile, en fin de session, par `recordLessonRun` et le sprint
(`ui/sprint.ts`) — modèle « premier franchissement » **monotone** : une notion qui repasse
par un palier déjà atteint ne re-loggue pas (pas d'oscillation autour du seuil). La
dernière colonne (semaine en cours) est visuellement distinguée : partielle, non comparable
à hauteur égale. **Masquée** tant qu'une matière n'a pas au moins **3 semaines de recul**
depuis son premier franchissement (`PALIERS_MIN_SEMAINES`) — évite de lire « trop tôt »
comme « aucun progrès » (avis pédago/designer) ; une amorce textuelle s'affiche si l'enfant
a déjà travaillé la matière sans encore assez de recul. **Garde-fous** (mêmes principes que
le reste du récap) : aucun pourcentage ni note affichés, aucune comparaison entre enfants —
un simple compteur de notions au-dessus des barres non vides.

## Graphe « Activité des 7 derniers jours » (#319)

Histogramme par jour (index 6 = aujourd'hui), avec **échelle Y chiffrée** (graduations +
lignes de repère, via `echelleActivite` côté `core/encadrant-stats.ts`) et une **bascule
« Total » / « Par type »** (état `vueActivite`, boutons-segments `data-act="activite-mode"`).
En mode « Total » chaque barre = le nombre de sessions du jour ; en mode « Par type » la barre
est **empilée**, segmentée par type de session (`lecon`/`revision`/`dictee`/`bilan`/`sprint`,
+ `inconnu` pour les sessions de l'ancien format) avec **légende**. Couleurs : leçon = vert
(`--ok`), révision = bleu (`--cat-bleu`), dictée = rose, bilan = violet (`--cat-bilan`),
sprint = corail (`--cat-sprint`) — relevées en thème Nuit pour le contraste, avec un filet
séparateur entre segments (daltonisme). Le détail par type est aussi exposé en **texte**
(a11y, `repartitionTexte`). Pas d'activité → ni graphe ni bascule (rien à comparer). Le type
est journalisé en amont par `recordLessonRun` (`'lecon'` seule / `'bilan'` express\complet),
`ui/sprint.ts` (`'sprint'`), et `recordSessionActivity` pour les sessions hors
`recordLessonStats` : révision espacée (`ui/revision.ts` → `'revision'`) et dictée
d'orthographe (`ui/ortho-runner.ts` → `'dictee'`, un point par séance).

## Dictées : listes et banque de mots (#424, #496)

**Bloc « Dictées »** (`listesOrthoHTML`, `ui/encadrant-progression.ts`), entre le graphe
d'activité et l'historique des erreurs : les dictées d'orthographe (store dynamique, cf.
[Données & profils](donnees-et-profils.md)) ne sont **pas** des `LessonDef` du catalogue,
donc suivies **à part**. Depuis #496, le bloc (autrefois « Listes de dictée ») porte une
**bascule segment « Listes » / « Mots »** (`data-act="dictees-vue"`, composant segment
partagé cf. [Rendu & interactions](ui.md)) : le volet **Listes** (ci-dessous) reste le
défaut, le volet **Mots** — la banque du profil, mot par mot — n'apparaît que sur demande
(masqué tant que la banque est vide, rien à y montrer). Changer de volet réinitialise les
filtres du volet Mots plutôt que de les laisser posés hors de vue.

### Volet Listes

Suivi sur la **même échelle d'acquisition** (`NiveauNotion`) mais à **3 niveaux
seulement** — pas de « à renforcer » : la validation d'un mode d'orthographe est
**binaire** (validé ou non), il n'existe pas de « perf récente en % » comme pour un QCM.
`à découvrir` (aucun mot commencé) / `en cours` / `acquis` (tous les mots attendus maîtrisés =
liste étoilée, cf. `listeEtoilee`, `core/orthographe/runner.ts`).

Calcul dans `core/orthographe/progression.ts` (lecture seule et **synchrone**, sans
matérialisation LEFFF) : `statutsLecon(state, id, dicteeDispo)` énumère le statut (`StatutMot`)
de chaque mot **attendu** d'une liste (mots simples + cibles verbe, résolues par l'id
**déterministe** `cibleVerbeId`) ; `avancementLecon(state, id, dicteeDispo)` en déduit
`{niveau, total, maitrises}` ; `niveauListeOrtho` en extrait le seul niveau.

Agrégé par profil pour l'espace encadrant par `listesOrthoProfil(profile, dicteeDispo)`
(`core/encadrant-stats.ts`), qui lit `ludaskia_ortho` du profil **consulté** par UUID
(`loadOrthoFor`) et unifie prédéfinies + listes du parent via `listOrthoLecons`. **Les dictées
prédéfinies non commencées sont masquées du SUIVI** (sinon la quarantaine de dictées prédéfinies
noierait les listes du parent), **sauf si elles ont été épinglées** (suivi alors voulu) ; **les
listes créées par le parent restent toujours visibles**, même « à découvrir ». Pour « en cours »,
un compte factuel « X/Y mots maîtrisés » est accolé (jamais de %), pour restituer la nuance
perdue par l'absence de « à renforcer ».

**Mots consultables** (#441) : `RecapListeOrtho` et `DicteeProposee` portent chacune un champ
`mots: string[]`, déjà dans l'ordre d'**AFFICHAGE** — alphabétique pour une liste du parent
(mots saisis dans un ordre quelconque), ordre d'origine pour une prédéfinie (des nombres, par
exemple, doivent rester numériques). Cet ordre est calculé par `motsApercu(mots, source)`
(`core/orthographe/lessons.ts`, **pure**), **factorisée** depuis l'infobulle du catalogue
enfant (`ui/catalog-nav.ts:renderOrthoCategorie`, `.ortho-apercu`) : les deux aperçus — celui
de l'enfant et celui de l'adulte — partagent désormais la même règle et ne peuvent plus
diverger. Côté encadrant, ces mots sont consultables via un repli natif `<details
class="enc-mots">` « Voir les mots » (`motsDicteeHTML`), posé dans les **deux** familles de
lignes de dictée (suivi ci-dessus ET dictées proposées ci-dessous) : contrairement à
l'infobulle du catalogue (purement décorative, `aria-hidden`), ici le contenu **est**
l'information cherchée — l'adulte doit pouvoir lire une liste sans lancer la dictée lui-même
(préparer une aide, comparer à ce qui a été vu en classe). Le repli est **scopé aux seuls
mots**, jamais à toute la ligne : sinon le bouton « Épingler », action principale et fréquente,
sortirait de l'ordre de tabulation tant que le bloc reste fermé.

**Une cible verbe s'annonce, elle ne se tait plus** (#261, #441) : un verbe configuré (couples
pronom × temps) compte pour plusieurs dictées dans `nbMots`, mais reste une **seule** entrée
dans `mots` — l'écart (« 3 mots » annoncés pour 2 lignes affichées) demeure, mais l'entrée dit
maintenant pourquoi plutôt que de le taire : `listOrthoLecons` (`core/orthographe/lessons.ts`)
y place `apercuVerbe(cfg)` (`core/orthographe/verbes.ts`, pure) au lieu du seul infinitif, par
exemple « manger (je, il — présent) ». Vaut pour les **deux** aperçus (catalogue enfant et
espace encadrant, même champ `mots`). `apercuVerbe` s'appuie sur `TEMPS_LABEL`
(temps en clair) et `libellePronoms` (« je, il » ou « tous les pronoms » si tous cochés) — même
vocabulaire que le **formulaire** de création/édition d'une liste (`ui/ortho-liste.ts:resumeVerbe`) :
formulaire du parent et les deux aperçus décrivent le même objet sans jamais le nommer différemment.

Chaque liste peut être **épinglée** (même mécanique que « à revoir », cf. ci-dessous) — elle
rejoint alors la file de l'enfant comme une leçon.

### Volet Mots — la banque du profil (#496)

Les listes ne **contiennent** pas les mots, elles les **référencent** (`motIds`, cf. l'en-tête
de `core/orthographe/types.ts`) : supprimer une liste n'en retire aucun de la banque, qui
continue de revenir en révision espacée **sans qu'aucun affichage n'y donne accès** — et,
depuis #489, sans même que ses erreurs soient journalisées (cf. « Historique des erreurs »
ci-dessous). Le volet **Mots** (`banqueMotsHTML`, module dédié `ui/encadrant-banque.ts`,
calculs purs dans `core/orthographe/banque.ts:banqueProfil`) projette, pour chaque mot de la
banque du profil consulté : où il vit (les listes du parent **et** les listes dont un verbe
regénère la cible, `listesContenantMot`/`listesDeCibleVerbe`, #496 — distinctes de
`listeContenantMot`, qui n'en rend qu'une, réservée au journal d'erreurs), la leçon prédéfinie
dont il provient s'il en vient, son statut (même échelle à 3 niveaux que le volet Listes) et
s'il est **supprimable**.

**Recherche** (insensible casse/accents — un enfant sur clavier tactile ne tape pas le
circonflexe de « être ») et **filtre « plus dans aucune liste »** (compteur cliquable,
`orphelinsSeuls`, masqué dès qu'il n'y a plus d'orphelin) ; liste **paginée par 50**
(`data-act="banque-plus"`, SC 2.4.1 — une banque de plusieurs centaines de mots n'impose pas
de tous les traverser au clavier avant la section suivante).

**Un mot orphelin** = rattaché à **rien** — ni liste, ni verbe, ni leçon prédéfinie
(`EntreeBanque.orphelin`) : exactement le cas où `core/orthographe/lessons.ts:groupeOrthoDuMot`
renvoie `null`, donc où une erreur sur ce mot n'est **pas journalisable** (limite documentée en
« Historique des erreurs » ci-dessous). C'est le motif d'ouverture n°1 de cette vue, d'où le
filtre dédié plutôt qu'une simple recherche.

**Suppression DÉFINITIVE** — le premier geste **irréversible** de l'onglet Suivi (les autres
actions du récap, épingler compris, se défont d'un clic) : confirmation `uiConfirm`
**destructive** qui **nomme** les listes amputées, jamais un tap unique. Règles :
- un mot d'une **leçon prédéfinie** n'est **pas** supprimable — la relancer le recréerait
  (`ajouterMots`), un « Supprimer » qui se contredit à la session suivante tromperait
  l'adulte ; le bouton est remplacé par une mention textuelle (pas de bouton désactivé,
  invisible aux lecteurs d'écran en navigation par contrôles) ;
- une **forme conjuguée** (cible de verbe) est supprimable, mais l'adulte est **averti**
  qu'elle reviendra au prochain lancement du parcours tant que le verbe reste dans la liste
  qui le porte (id déterministe, `materialiserVerbes` la recrée) — le message nomme cette
  liste pour qu'il aille y retirer ou reconfigurer le verbe.

Écriture sur le profil **consulté** par UUID (`saveOrthoFor` + `touchProfile`, cf. [Données &
profils](donnees-et-profils.md)), jamais de bascule du profil actif.

**Nettoyage proposé à l'enregistrement d'une liste** (`ui/ortho-liste.ts`) : après avoir
enregistré les modifications d'une liste, si des mots viennent d'en être retirés et ne sont
plus référencés par rien (`motsDevenusOrphelins`), l'adulte se voit proposer de les supprimer
pour de bon en une fois — sans quoi ils resteraient orphelins et invisibles jusqu'à une visite
volontaire du volet Mots. Ne rien supprimer reste un choix valable (le corpus de l'année a du
sens, avis pédagogique) ; les mots d'une dictée prédéfinie sont exclus de cette proposition.

**Épingler une dictée « à l'avance »** : le bloc **« Proposer une dictée à l'avance »**
(`dicteesProposeesHTML`, exportée par `ui/encadrant-progression.ts`) liste, dans l'**onglet
Programme** (#459), les dictées **prédéfinies non commencées** (`dicteesProposees`,
`core/encadrant-stats.ts`), pour que l'encadrant en pousse une **avant** que l'enfant ne la
rencontre — parité avec « épingler n'importe quelle leçon, même pas encore abordée » du
catalogue, sans noyer le suivi. Chaque ligne (`ligneDicteeProposee`) délègue désormais au
**même renderer** que « à revoir ensemble » plus bas (`ligneRevoir`, `etat: 'a-decouvrir'`
**constant** par construction — une proposée n'est par définition jamais commencée) plutôt
qu'à une copie manuelle : elle gagne ainsi le **badge d'état d'acquisition** que cette copie
n'affichait pas (#441), et ressemble désormais exactement aux autres cartes de son onglet.
**Choix assumé** (arbitrage mainteneur) : cette harmonisation ne **fusionne pas** les deux
familles de composant — `.enc-detail-item` (ligne dense du bloc de suivi ci-dessus) et
`.enc-revoir-item` (carte de préparation, ci-dessous et ici) restent deux rendus distincts,
chacun adapté à l'intention de son onglet (observer vs préparer) ; seul le **langage du
badge** (vocabulaire des niveaux d'acquisition) est désormais partagé entre les deux. Une
prédéfinie ainsi épinglée quitte ce bloc et apparaît dans le suivi de l'onglet Suivi (état « à
découvrir » tant qu'elle n'est pas commencée), qui se contente sinon d'un renvoi textuel vers
l'onglet Programme.

## Historique des erreurs (#391)

**« Ce qui a été difficile récemment »**, dernier bloc du récap de l'onglet **Suivi** (après
les notions par catégorie et les listes de dictée, juste avant le récap de révision espacée
ci-dessous) — `ui/encadrant-erreurs.ts`, inséré par `encadrant-progression.ts` : chaque erreur commise
pendant un entraînement est journalisée localement (`core/erreurs-journal.ts`, clé
`ludaskia_erreurs`, 150 entrées les plus récentes par profil) — question posée, réponse
donnée, réponse **attendue**, leçon, mode, quand. **Groupé par leçon**, celle avec le **plus
d'erreurs** en tête (#519 ; le décompte ne porte que sur la période filtrée ci-dessous, et la
récence de la dernière erreur ne départage plus qu'une égalité de volume), replié par défaut
(`<details>`) pour ne pas dérouler un « mur de fautes » ; à
l'intérieur d'une leçon, une même erreur répétée (même question + même réponse donnée) est
**dédoublonnée** en une seule ligne « vue N fois » plutôt que N lignes identiques. Dans une
leçon, seules les **5 erreurs** les plus récentes s'affichent d'emblée ; les suivantes restent
lisibles via un repli **dépliable** (`<details class="enc-err-anciennes">`, imbriqué dans celui
de la leçon) plutôt qu'un simple compteur muet — le total annoncé en tête du groupe reste ainsi
consultable en détail. Parti pris
(avis designer-ux-enfant) : pas de rouge en aplat, la réponse attendue est mise en avant
(positif), la réponse donnée reste neutre et n'est jamais barrée. Le libellé lit « **Réponse
attendue :** », et non « La bonne réponse » (#446) : depuis que l'intercalation corrige par
BANDE plutôt que par valeur unique, un attendu peut être « un nombre entre 450 et 465 » — un
« LA » y nierait la pluralité. Formulation neutre, valable pour **toutes les leçons**, pas
seulement l'intercalation. Chaque groupe — **leçon du
catalogue ou liste de dictée** (#424) — peut être **épinglé** depuis ce bloc (même
`data-act="epingler"` → `toggleRevoirFor`, mécanique partagée avec « à revoir » ci-dessous) ;
l'action n'est **masquée** que si l'id ne résout ni l'une ni l'autre (groupe orphelin, cible
disparue).

**Filtre de période** (#476) : un sélecteur à quatre segments (`Aujourd'hui` / `2 jours` /
`1 semaine` / `Tout`, `data-act="erreurs-periode"`, handler exporté `erreursClick` et routé
depuis `progressionClick` puisque c'est cette section qui insère le bloc) — composant
**segment** partagé de l'espace encadrant (contrat clavier « Radio Group », cf. [Rendu &
interactions](ui.md)) — borne les erreurs **AVANT** le regroupement : le « récemment » du
titre correspond ainsi à une vraie fenêtre de temps plutôt qu'aux `MAX_ERREURS` dernières
erreurs conservées, qui peuvent remonter à des semaines pour un profil peu actif. Fenêtres en **jours calendaires locaux**, aujourd'hui
inclus, `1 semaine` = 7 jours (`filtrerErreursParPeriode`, `core/erreurs-journal.ts`) ; `Tout`
lève toute borne (seule la rétention `MAX_ERREURS` joue encore). Défaut **adaptatif**
(`periodeParDefaut`) : la fenêtre la plus serrée qui contient au moins une erreur, repli sur
`1 semaine` si le journal est vide ou entièrement plus ancien — répondre d'abord à « sur quoi
a-t-il buté aujourd'hui ? » sans faire tomber le parent sur un bloc vide dès que la dernière
séance date de l'avant-veille. Un choix explicite de l'encadrant, lui, est conservé d'un
profil consulté à l'autre (état de module `periodeChoisie`, même pattern que `vueActivite`/
`vueRevision`). **Deux messages d'état vide distincts** : journal entièrement vide (« Rien à
signaler récemment ») vs période sans erreur alors que le journal en contient plus loin
(invite à élargir la fenêtre). Le segment actif porte un `aria-label` enrichi du résultat
(nombre de leçons et d'erreurs de la période) : le changement de fenêtre déplace le contenu
affiché sans y déplacer le focus (SC 4.1.3), et le focus revient sur ce même bouton après le
re-rendu, ce qui garantit l'annonce.

**Capture — couverture complète** : point d'entrée unique `capterErreur` (`ui/erreur-capture.ts`),
appelé par **tous les runners** au moment de la correction d'une réponse fausse : la fiche en
saisie (`ui/session.ts:verify`), le QCM de leçon (`ui/lecon-qcm.ts`), le QCM multi-sélection
(`ui/lecon-qcm-multi.ts`, une entrée par question, propositions cochées dans l'ordre
d'affichage), le sprint (`ui/sprint.ts`), les tuiles de numération (`ui/lecon-tuiles.ts`), le
rangement dans l'ordre (`ui/lecon-ordre.ts`), le tri par thème (`ui/lecon-tri.ts`, une entrée par
mot mal classé), l'appariement (`ui/lecon-appariement.ts`, une entrée par manche ratée,
restreinte aux paires fausses), le tableau de conversion (`ui/lecon-tableau.ts`, le nombre relu
dans l'unité cible), la résolution de problèmes (`ui/lecon-probleme.ts`, une entrée par
sous-question ratée) et la dictée d'orthographe (`ui/ortho-runner.ts`, le **premier essai raté**
d'un mot). Ignore une erreur sans leçon rattachée ou sans énoncé affichable (rien à
regrouper/montrer). Les formats **composites** délèguent leur mise en forme à
`core/erreur-representation.ts` (pur) : une opération posée agrège les cellules-chiffres du
résultat (`Item.posedResult`) en **une** entrée par opération (`analyserResultatPosee`) plutôt
qu'une par chiffre, un tableau de conversion se relit **dans l'unité cible** demandée
(`nombreTableauSaisi`) et un appariement ne montre que les **paires fausses**
(`pairesErreur`, jamais les correctes) ; les tuiles, le rangement, le tri et l'appariement
lisent l'état final du widget via `TuileController.reponse()`. Une erreur de dictée référence
l'id d'une **liste** d'orthographe (pas une leçon du catalogue) : `encadrant-erreurs.ts` résout
son libellé via `labelLeconOrtho` (`core/orthographe/lessons.ts`) et épingle sous l'id
**préfixé** `orthoRevoirId(id)` (#424, cf. « À revoir » ci-dessous) — même geste que pour une
leçon.

**Révision espacée, aussi journalisée** : `ui/revision.ts` capture ses erreurs sous le mode
dédié **`'revision'`** (déjà prévu dans `MODE_LABEL` d'`encadrant-erreurs.ts`, longtemps
inatteint faute de capture en amont) — chacune des **10 formes** d'item qu'elle rejoue (saisie,
QCM, mot d'orthographe, tuile, ordre, tri, appariement, opération posée, problème à
sous-questions, « clique sur le mot ») capture juste avant son verdict, via un point d'entrée
local (`capterRev`) qui fixe ce mode et délègue à `capterErreur`. Le groupe d'un mot raté en
révision est résolu par `groupeOrthoDuMot` (`core/orthographe/lessons.ts`) — la **liste** du
profil qui le contient en priorité (même id que le journal de la dictée, donc les deux se
regroupent sous le même libellé côté encadrant), sinon la **leçon prédéfinie** dont il vient,
sinon la liste qui porte le **verbe** dont il est une cible conjuguée. **Limite assumée** : un
mot rattaché à **rien de tout cela** — le cas **orphelin** (typiquement un mot resté en banque
après suppression de sa liste) — n'est **pas journalisé**, faute de groupe où le ranger ; ce
même mot orphelin est désormais repérable et supprimable depuis le volet « Mots » du bloc
Dictées (#496, ci-dessus).

**Détachée du seuil de 60 %** : la capture des erreurs d'une fiche est **indépendante** du seuil
`enough` qui conditionne l'enregistrement (XP, étoile, record) — une fiche remplie à moins de
60 % journalise quand même ses erreurs (décision mainteneur : c'est précisément là que l'enfant
décroche, la donnée la plus utile au parent). Garde dédiée « une fois par essai »
(`sessionErreursLoggees`, `ui/navigation.ts`), distincte de `sessionRecorded`.

## « À revoir » → carte d'accueil

**« À revoir » → carte d'accueil** : l'encadrant **épingle** une leçon du catalogue **ou** une
liste de dictée (#424) — `toggleRevoirFor(uuid, entryId)` → `ludaskia_revoir` du profil (cf.
[Données & profils](donnees-et-profils.md)). La file reste un simple `string[]` : une entrée de
dictée s'y distingue par le préfixe `ortho:` (`orthoRevoirId`/`isOrthoRevoirId`/
`orthoIdFromRevoir`, `core/encadrant-stats.ts`) — id opaque pour une liste du parent, `fr-ortho-*`
pour une dictée prédéfinie.

Au retour de l'enfant sur son accueil, `ui/a-revoir-card.ts` affiche une carte (`#aRevoir`,
modèle « leçon du jour ») qui **boucle** sur `revoirActives(dicteeDispo)` — union `RevoirEntry`
(`{kind:'lecon', lesson}` ou `{kind:'ortho', source}`, `core/encadrant-stats.ts`). Ce filtre
d'**affichage** ne montre que les entrées ENCORE faibles **par nature de l'entrée** : une leçon
si non étoilée et perf récente < seuil, une liste de dictée si `niveauListeOrtho(...) !==
'acquis'`. Icône/sous-titre : matière/catégorie réelles pour une leçon, sous-titre **fixe**
« Français · Orthographe » pour une dictée. Lancement : `startLecon` pour une leçon,
**`startOrthoLecon`** pour une dictée (hash dédié `ortho-`/`ortho-mode-`, distinct de
`lecon-`/`mode-`). L'enfant n'a pas à être présent quand l'encadrant épingle.

**Désépinglage automatique** (#465) : le rendu de cette carte déclenche aussi
`purgeRevoirSolides(profile, dicteeDispo, now)` (`core/encadrant-stats.ts`), qui retire **pour
de bon** de `ludaskia_revoir` les entrées redevenues solides, avec le MÊME critère que le
filtre d'affichage ci-dessus. Jusqu'ici seul l'affichage se nettoyait : la file persistée
gardait l'entrée à vie et l'espace encadrant la listait encore (« entrée fantôme »). Deux
garde-fous : une leçon épinglée alors qu'elle était **déjà** solide n'est jamais retirée
d'office — la file mémorise, par profil, les entrées **vues fragiles depuis qu'elles sont
épinglées** (`ludaskia_revoirFragile`), seules candidates au retrait ; sans quoi « épingler
n'importe quelle leçon, même déjà acquise » deviendrait intenable et un ré-épinglage manuel ne
tiendrait pas. Et chaque retrait est **tracé**, jamais silencieux (cf. « Retirées
automatiquement » ci-dessous). `ui/encadrant.ts:tabPanelHTML` appelle la **même** purge côté
encadrant, AVANT de calculer le récap de n'importe quel onglet — la consultation ne peut donc
plus afficher de fantôme non plus.

Dans l'espace encadrant lui-même, le bloc **« À revoir ensemble »** (`aRevoirHTML`, exportée
par `ui/encadrant-progression.ts`) vit dans l'**onglet Programme** (#459), sous le composeur
du programme du jour — c'est un acte de **préparation**, pas d'observation. Sa sous-section
« Épinglées » liste **toutes** les entrées de la file sans filtre de faiblesse, via
`epingleesProfil(profile)` (gestion, pas suggestion) ; une cible disparue (leçon hors
catalogue actif, liste supprimée) en est silencieusement écartée — la purge automatique
ci-dessus l'a déjà débarrassée des entrées redevenues solides, donc « Épinglées » ne peut plus
contenir de fantôme.

**État d'acquisition sur une épinglée** (#518) : chaque ligne porte le même badge que celles
des suggestions (`niveauEpingle`, `core/encadrant-stats.ts`) — sans lui, l'adulte ne pouvait
pas juger s'il fallait désépingler. Une leçon épinglée jamais travaillée n'est pas un trou de
données : elle est dans le récap à `'a-decouvrir'`, donc affiche « à découvrir » comme
n'importe quelle notion neuve. Quand aucun état n'est disponible, la ligne affiche à la place
un repli « **hors du niveau suivi** » (`.enc-revoir-hors`, sans pastille de couleur, pour ne
pas se lire comme un 5e cran de l'échelle d'acquisition) : la cible n'est pas au programme de
la classe suivie par le profil, donc l'épingle est **inerte** — `revoirActives` l'écarte, elle
ne revient jamais sur l'accueil de l'enfant. Elle reste néanmoins listée ici, précisément pour
que l'adulte puisse la retirer en sachant pourquoi ; le motif (`EpingleEntry.horsNiveau`) est
calculé par `epingleesProfil`, là où le niveau de la cible est connu, et non déduit d'un état
absent — les deux auraient pu diverger en silence.

Une troisième sous-section, **« Retirées automatiquement »** (#465,
`retraitsAutoProfil(profile, now)`), rappelle les entrées que la purge vient de retirer —
libellé et date **figés** à l'instant du retrait, la cible peut avoir disparu depuis sans que
la trace devienne muette — pour qu'une épingle ne s'efface jamais sans explication ; un bouton
« Épingler » la remet dans la file d'un clic (elle sort alors de cette trace).

## Récap du mode Révision espacée (#423)

**Récap du mode Révision espacée** (#423), dans l'**onglet Suivi** (#459), juste après le
récap de progression (chiffres, activité, notions par catégorie, listes de dictée,
historique des erreurs) : donne à l'encadrant une vue
de la file de répétition espacée (#45) du profil consulté. `core/encadrant-stats.ts` (fonction
`revisionProfil`) projette, PAR ENTRÉE (leçon maths/conjugaison ou mot d'orthographe — deux
sources fusionnées, `LESSON_REVISION_KEY` et `ORTHO_KEY → banque[].revision`), son **palier
courant** (position dans l'escalier d'intervalles, `libellePalier`) et son **échéance
relative** (« à réviser aujourd'hui / demain / dans N jours », « en retard de N jours »,
`libelleEcheanceRevision`) — jamais de date brute, dans l'esprit du reste du récap. Une
entrée ayant atteint le palier maximal reste affichée, avec un badge « acquis » plutôt que
masquée (elle compte pour la couverture). **Même filtre que la frise d'évolution** : seules
les entrées du **niveau actif de la matière** (`niveauProfilMatiere`) sont montrées, pour ne
pas afficher de fantôme d'un ancien niveau après un changement de classe.

Deux visualisations, bascule au même patron que le graphe d'activité (module
`ui/encadrant-revision.ts`) : **« Par catégorie »** (regroupement dépliable, même chrome que
« Notions par catégorie ») et **« Par urgence »** (liste à plat, les plus en retard d'abord,
`compareUrgence`). Seul chiffre affiché : un dénombrement (« X en révision, dont Y à réviser
· Z déjà acquises »), aucun pourcentage ni note.

**Distinct de « à revoir » ci-dessus** : cette file reflète le moteur de révision espacée
(#45), automatique et alimentée par le passage en session ; la file « à revoir »
(`ludaskia_revoir`) reste un mécanisme **manuel**, épinglé par l'encadrant. Les deux
coexistent sans se recouvrir.

## Composition du « programme du jour » (#440)

Bloc de composition (`ui/encadrant-seance.ts` — `seanceHTML`/`seanceClick`/
`seanceChange`, en tête de l'**onglet Programme**, #459) permettant à l'encadrant de préparer,
pour le profil **consulté** (par UUID, sans bascule), un ou plusieurs programmes :
une liste d'**étapes** (Sprint, Révision, **À revoir** #464, Leçon du jour, une leçon
précise ou une dictée — cible(s) filtrée(s) au **niveau du profil**, comme ce que
l'enfant voit) répétées `count` fois (paliers fixes 1 à 5, pas de saisie libre), et une
**récurrence** (une **date** ponctuelle ou des **jours de semaine**). Une étape
« dictée » vise un **pool** de dictées cochées via une liste à cases (#463, cf.
[Logique pure](core.md)) : une seule cochée reste figée, deux ou plus donnent un
tirage au hasard à chaque lancement (l'enfant ne voit pas laquelle avant de
commencer). Une étape **« À revoir » (#464)** n'a rien à configurer : sa cible est
la file épinglée du profil (ci-dessus) — un repère (« rien n'est épinglé » / « ce
sera celle-ci » / « une au hasard ») prévient l'adulte si elle restera invisible
tant que rien n'est épinglé. **Choix assumé** : cette étape **s'ajoute** à la carte
d'accueil « à revoir », elle ne la remplace pas — deux chemins vers la même file
(l'un toujours disponible, l'autre au fil du programme composé). Garde-fou
« un seul programme par jour » : `recurrencesEnConflit` (`core/seance.ts`) refuse une
récurrence qui chevaucherait celle d'un autre programme du même profil (message
d'erreur affiché dans la carte, jamais de blocage dur du **volume** d'étapes/programmes).
`estimationDureeMin` affiche une durée indicative, avec un repère « 2 à 3 activités,
10 à 15 min » (non contraignant). Persistance **immédiate** à chaque action
(`enregistrerSeancesFor`, cf. [Données & profils](donnees-et-profils.md)). Un bloc
« Copier ces programmes » duplique les programmes d'un profil vers un autre
(`copierSeances`, écrase la cible).

**Métriques de temps (#440)** : chaque étape réalisée est horodatée avec sa durée et
archivée — y compris une réalisation **partielle** — dans un journal borné
(`ludaskia_seanceJournal`, cf. [Données & profils](donnees-et-profils.md)) au passage
de minuit ; base d'un futur récap encadrant « durée des séances ». **Visuel différé** :
rien n'affiche encore ces métriques côté espace encadrant.

## Réglages déplacés hors de portée de l'enfant

**Réglages déplacés hors de portée de l'enfant** (par UUID consulté, **onglet Réglages**,
#459) : la **« Classe
scolaire »** (`setNiveauReferenceFor`/`setNiveauMatiereFor`) et les **« Aménagements »**
dys/attention — *masquer le minuteur* + *lecture auto des consignes* + *désactiver les
apparitions surprises* (`setPrefFor`, avis `specialiste-troubles-apprentissage`). Ce
dernier (#331, `sansApparitionsSurprises`) coupe l'**easter egg ambiant** (la luciole qui
passe) pour un enfant qu'un mouvement inattendu déconcentre ou qui a besoin de
prévisibilité — il **n'affecte pas** les eggs d'exploration, déclenchés volontairement par
l'enfant (cf. [Gamification](gamification.md)). Le **« Mon confort »** (réduire les
animations, confort de lecture) reste côté enfant (auto-régulation immédiate, coût
d'erreur nul) ; un aménagement actif est rappelé en lecture seule sur « Mon espace »
(« réglé par un adulte »). L'écoute TTS **à la demande** reste toujours dispo côté enfant.

**Séance de révision** (#439) : bloc distinct des « Aménagements » (charge de la séance,
pas un aménagement dys/attention). Menu déroulant à **paliers fixes**
(`REVISION_PLAFOND_CHOIX` : 6/8/10/12/15/20/24, 12 marqué « par défaut ») — pas de saisie
libre, donc pas de valeur extrême possible. Réglé sur le profil consulté
(`setPrefFor(uuid, 'revisionPlafond', n)`), ajuste le nombre d'éléments proposés par une
séance de `#revision-espacee` (fallback + bornage assurés à la lecture par
`getRevisionPlafond`, cf. [Logique pure](core.md)).

## Leçons déjà vues en classe (#478)

**Leçons déjà vues en classe**, bloc de l'**onglet Réglages** sous « Séance de
révision » (`ui/encadrant-reglages.ts:vuEnClasseHTML`) : l'adulte déclare, pour
le profil **consulté**, ce que l'enfant a déjà travaillé HORS de l'application
(rattrapage à l'arrivée sur l'appli, notions traitées après un changement de
classe). Une leçon déclarée compte alors comme **rencontrée** pour le
périmètre « déjà vues » du sprint (`core/sprint-scope.ts`, cf. [Logique
pure](core.md)) et **entre en révision espacée** au comportement standard
(état neuf, 1er re-test à J+1).

Case par catégorie (état plein/partiel/vide via l'`indeterminate` du DOM),
dépliage leçon par leçon (`aria-expanded`/`aria-controls`, listes closes au
rendu — évite d'ajouter la centaine de cases de leçons à l'ordre de
tabulation), actions groupées « Tout déclarer » / « Tout retirer ». Une leçon
**déjà jouée dans l'application** (date de 1er passage) est cochée et **non
modifiable** : elle est de toute façon rencontrée, la déclarer n'ajouterait
rien et la décocher ne la retirerait pas du périmètre — incompréhensible pour
l'adulte. Mise à jour du DOM **en place** après chaque action (jamais
`renderEspace()`, qui détruirait focus/scroll/dépliages sur une liste pouvant
dépasser la centaine de leçons) ; un hook post-rendu dédié
(`reglagesApresRendu`, appelé par l'orchestrateur `encadrant.ts` juste après le
rendu de l'onglet) pose l'état « indéterminé » des cases de catégorie,
impossible à exprimer en HTML seul.

**Annulation prudente** (`core/vu-ailleurs.ts:declarerVuAilleursFor` →
`core/progress.ts:retirerRevisionsDeclareesFor`) : décocher une leçon ne
retire son état de révision espacée que s'il n'a **jamais été re-testé** et
que la leçon n'a **aucune statistique** dans l'appli — un progrès issu d'un
vrai passage n'est jamais détruit, seule la trace créée par la déclaration
l'est.

**Carte de stockage dédiée** (`ludaskia_lessonVuAilleurs`, cf. [Données &
profils](donnees-et-profils.md)) qui ne remplace **pas** la date de 1er
passage : les autres lecteurs de cette date — l'objectif « découvre une
nouvelle leçon » côté enfant et le récap « notions maîtrisées récemment »
ci-dessus — restent **aveugles** aux déclarations (l'union des deux cartes ne
vit que dans `sprint-scope.ts`), pour qu'une déclaration en masse ne
débloque ni ne gonfle artificiellement ces compteurs.

## Impression sans bascule

**Impression** d'une fiche au niveau du profil consulté **sans bascule** : `buildLessonFiche`/
`buildPrintableDOM` acceptent un `level?`/`PrintScope.level` explicite (`printScope`).

## Verrou optionnel

**Verrou optionnel** (`core/encadrant-lock.ts`) : PIN 4 chiffres **OFF par défaut**, **haché**
(SHA-256 `crypto.subtle`), réinitialisable **uniquement** via un **secret de récupération**
(GUID) affiché une fois (copier/télécharger `.txt`) — son haché seul est stocké. Garde-fou
anti-modification accidentelle par l'enfant, **pas** une sécurité (contournable en devtools →
vrai verrouillage = contrôles parentaux de l'appareil) ; à l'activation, on prévient que perdre
PIN **et** secret rend l'accès définitivement perdu. Déverrouillage mémorisé pour la session de
page. La **protection inter-profils en classe** (verrou de profil) relève de #299, qui
réutilisera ce mécanisme.
