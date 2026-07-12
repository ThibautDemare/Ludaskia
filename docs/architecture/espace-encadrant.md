[← Architecture Ludaskia](../ARCHITECTURE.md)

# Espace encadrant (#234)

Vue gatée `#encadrant` (dans app.html, **pas** une page séparée), réservée aux adultes
(parents/enseignants) et **distincte de l'espace enfant** : voix « **vous** » (cf. Voix,
cas (d)), chrome neutre (token `--admin-bg` + accent `--admin-accent` bleu, stables quel
que soit le thème déblocable), densité d'info plus élevée, aucun vocabulaire visuel
enfantin. **Accès** : lien sobre en pied de l'écran « Mon espace » (`#btnEncadrant`) **et**
item « Espace encadrants » (gris + cadenas) dans le menu profils de la barre — jamais un bouton
permanent visible dans la barre de l'enfant.

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
(+ export/import) vivent ICI, fusionnés à la liste de consultation (carte par enfant : « Voir
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

## Historique des erreurs (#391)

**« Ce qui a été difficile récemment »**, sous le graphe d'activité et avant « à revoir »
(`ui/encadrant-erreurs.ts`, inséré par `encadrant-progression.ts`) : chaque erreur commise
pendant un entraînement est journalisée localement (`core/erreurs-journal.ts`, clé
`ludaskia_erreurs`, 150 entrées les plus récentes par profil) — question posée, réponse
donnée, bonne réponse, leçon, mode, quand. **Groupé par leçon**, la plus récemment ratée en
tête, replié par défaut (`<details>`) pour ne pas dérouler un « mur de fautes » ; à
l'intérieur d'une leçon, une même erreur répétée (même question + même réponse donnée) est
**dédoublonnée** en une seule ligne « vue N fois » plutôt que N lignes identiques. Parti pris
(avis designer-ux-enfant) : pas de rouge en aplat, la **bonne réponse** est mise en avant
(positif), la réponse donnée reste neutre et n'est jamais barrée. Chaque leçon **du catalogue**
peut être **épinglée** depuis ce bloc (même `data-act="epingler"` → `toggleRevoirFor`, mécanique
partagée avec « à revoir » ci-dessous) ; l'action est **masquée** pour un groupe d'erreurs de
dictée (la file « à revoir » est catalogue-only, une liste d'orthographe n'y a pas sa place).

**Capture — couverture complète** : point d'entrée unique `capterErreur` (`ui/erreur-capture.ts`),
appelé par **tous les runners** au moment de la correction d'une réponse fausse : la fiche en
saisie (`ui/session.ts:verify`), le QCM de leçon (`ui/lecon-qcm.ts`), le sprint (`ui/sprint.ts`),
les tuiles de numération (`ui/lecon-tuiles.ts`), le rangement dans l'ordre (`ui/lecon-ordre.ts`),
le tri par thème (`ui/lecon-tri.ts`, une entrée par mot mal classé), la résolution de problèmes
(`ui/lecon-probleme.ts`, une entrée par sous-question ratée) et la dictée d'orthographe
(`ui/ortho-runner.ts`, le **premier essai raté** d'un mot). Ignore une erreur sans leçon
rattachée ou sans énoncé affichable (rien à regrouper/montrer). Les formats **composites**
délèguent leur mise en forme à `core/erreur-representation.ts` (pur) : une opération posée
agrège les cellules-chiffres du résultat (`Item.posedResult`) en **une** entrée par opération
(`analyserResultatPosee`) plutôt qu'une par chiffre ; les tuiles, le rangement et le tri lisent
l'état final du widget via `TuileController.reponse()`. Une erreur de dictée référence l'id d'une **liste**
d'orthographe (pas une leçon du catalogue) : `encadrant-erreurs.ts` résout son libellé via
`labelLeconOrtho` (`core/orthographe/lessons.ts`), d'où l'action « Épingler » masquée pour ces
groupes.

**Détachée du seuil de 60 %** : la capture des erreurs d'une fiche est **indépendante** du seuil
`enough` qui conditionne l'enregistrement (XP, étoile, record) — une fiche remplie à moins de
60 % journalise quand même ses erreurs (décision mainteneur : c'est précisément là que l'enfant
décroche, la donnée la plus utile au parent). Garde dédiée « une fois par essai »
(`sessionErreursLoggees`, `ui/navigation.ts`), distincte de `sessionRecorded`.

## « À revoir » → carte d'accueil

**« À revoir » → carte d'accueil** : l'encadrant **épingle** des leçons
(`toggleRevoirFor(uuid, …)` → `ludaskia_revoir` du profil). Au retour de l'enfant sur son
accueil, `ui/a-revoir-card.ts` affiche une carte (`#aRevoir`, modèle « leçon du jour ») qui
**boucle** sur la liste ; auto-nettoyage au rendu (`revoirActives` exclut une leçon redevenue
solide). L'enfant n'a pas à être présent quand l'encadrant épingle.

## Réglages déplacés hors de portée de l'enfant

**Réglages déplacés hors de portée de l'enfant** (par UUID consulté) : la **« Classe
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
