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
- **Suivi** — récap de progression (chiffres-clés, activité 7 jours, **leçons
  travaillées récemment** (#520), notions par catégorie + frise, listes de dictée
  suivies, historique des erreurs), **puis** le récap de révision espacée (#423).
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

Compteur **remis à zéro dès que la leçon est franchie** (#490,
`core/report-lecon.ts:apresEssaiLecon`, cf. [Logique pure](core.md)) : ce signal
décrit une difficulté COURANTE, pas un passé — une notion butée en octobre puis
maîtrisée ne reste donc pas signalée « point dur » le reste de l'année. Le même
seuil éteint aussi, côté enfant, l'exemple d'étayage automatique de la leçon (#490,
« Étayage de la notion », cf. [Logique pure](core.md) et [Rendu &
interactions](ui.md)) : passé ce point, l'appli cesse de s'auto-expliquer au moment
même où l'espace encadrant se met à signaler la leçon — c'est alors à l'adulte de
prendre le relais, pas à une répétition de plus.

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
entre matières plutôt que se focaliser sur une seule. Depuis #521, la ligne porte aussi
« N changement(s) récent(s) » (`RecapMatiere.changementsRecents`, cf. `aChangeRecemment` dans
[Logique pure](core.md)) quand il y en a : seule trace de « ça bouge » lisible sans déplier
une catégorie, la frise ayant rejoint les lignes de leçon (ci-dessous). Ce chiffre ne se
déduit pas entièrement du dessin de la frise (un cap daté derrière un seul état visible
compte, un simple passage sous le suivi non) — cf. `aChangeRecemment` pour le détail. Chaque
catégorie affiche le même dénombrement (`RecapCategorie.travaillees`). Comptage factuel,
aucune note.

**Étoiles cumulées par classe (#556)** : sous ce bloc, « Étoiles gagnées depuis toujours :
N en CE2, M en CM1. » (`RecapProfil.etoilesParNiveau`, cf. [Logique pure](core.md)) —
n'apparaît qu'à partir de **deux** classes (sur une seule, la ligne répéterait le total sans
rien apprendre). Contrepartie ADULTE du « trésor » cumulé de l'enfant, qui reste lui un total
unique et sans détail : elle répond à « quelle part du travail se fait hors de la classe
suivie ? », question à laquelle la couverture par matière ci-dessus — scopée à cette classe —
ne peut pas répondre. Cumul DEPUIS TOUJOURS, comme le trésor : ne baisse jamais, même après un
changement de classe.

**Tendance par notion** (signal COURT TERME, pas une note) : puce ↗ « en progrès » / →
« stable » / ↘ « à relancer » à côté de l'état, dérivée de la fenêtre glissante `recents`
(`tendanceNotion` : compare la performance pondérée de la 1re et de la 2de moitié de la
fenêtre, coupées en **questions** et non en essais depuis #541). **Masquée sous 24 questions**
(`TENDANCE_MIN_QUESTIONS`), et aussi si l'une des deux moitiés en compte moins de 8
(`TENDANCE_MIN_MOITIE`, une moitié trop maigre ne se compare pas à l'autre) — un signal sur
trop peu de données serait du bruit lu comme une régression.
Formulée en action, jamais en verdict (« à relancer », jamais « en baisse ») ; couleur en
indice **secondaire** porté par le glyphe (`aria-hidden`), mot en `--ink`, libellé `sr-only`
(« Tendance : … ») pour les lecteurs d'écran. Reste un instantané, sans historique par
elle-même — l'historique daté vit dans la frise d'états ci-dessous (#521).

## Frise d'états par leçon (#521)

**Frise d'états**, sur sa propre ligne sous le libellé de chaque leçon, dans le détail
dépliable d'une catégorie (remplace la frise par matière de #397 : un compteur hebdomadaire
de notions ayant franchi un cap, événement rare, laissait la plupart des colonnes à 0 et ne
nommait aucune leçon). Douze cellules (**12 dernières semaines**, `SEMAINES_FRISE`), une par
semaine : couleur ET hauteur portent le même rang d'état — deux canaux redondants, la couleur
ne portant jamais seule le sens. Les **onze premières** cellules montrent le rang le plus haut
atteint à leur date (le journal des paliers ne date que les montées : il ne peut pas dessiner
une baisse passée) ; la **douzième**, celle de la semaine en cours, porte l'**état du jour**
(`friseNotion(paliers, firstSeen, niveau, debutSuivi, now)`, cf. [Logique pure](core.md)). La
rangée peut donc décrocher d'un cran sur sa dernière marche. `debutSuivi` est une
borne **par profil** (pas par leçon, cf. [Logique pure](core.md) pour `debutSuiviPaliers`)
qui gouverne toutes les lignes de la même façon : une première rencontre ne vaut
« à découvrir » que si sa semaine tombe à cette borne ou après.

Cinq rangs, chacun avec son rendu : gris neutre dédié (`$frise-neutre`, distinct de
`--muted` qui tombe sous le seuil 3:1 pour un objet graphique de cette taille) au rang le
plus bas pour « à découvrir » (bloc **plein**) ; au même rang, une semaine antérieure à
`debutSuivi` (`'inconnu'`) est un bloc **creux** — contour `$frise-neutre`, fond transparent.
Rendu retenu après deux essais écartés (raisonnement détaillé dans `styles/encadrant.scss`,
trois contraintes) : un filet fin sans hauteur (l'origine) passait, à l'usage, pour un bug
d'affichage plutôt que pour une absence de donnée, et neuf cellules contiguës à 4px se
lisaient comme un seul trait continu, rompant la dénombrabilité des douze semaines ; un bloc
plein identique à « à découvrir » (essayé ensuite) **affirmerait** « pas encore commencée »
sur des semaines dont l'état est en réalité inconnu ; une cinquième couleur pleine
introduirait un état de plus alors que la couleur code ici l'ÉTAT, sans compter qu'un gris
assez clair pour se lire « vide » tomberait sous 3:1 (1.4.11). Le bloc creux tient les trois
contraintes à la fois : douze blocs dénombrables, aucune affirmation sur l'inconnu, et un
contraste porté par le contour, aux mêmes ratios que l'aplat. Puis `--warn` pour « à
renforcer » — jamais **daté** (ce palier n'est pas un progrès de maîtrise) mais **déduit**
dès que la leçon est suivie sans cap franchi, ce qui donne désormais une frise aux leçons
n'ayant jamais dépassé 40 % —, bleu `--cat-bleu` pour « en cours » (**relevé en thème Nuit**,
en réutilisant le bleu déjà rehaussé pour le graphe d'activité plutôt qu'en introduire un
troisième) et vert `--ok` pour « acquis » ; un filet `box-shadow` sépare deux cellules
contiguës (deux états voisins peuvent avoir des luminances proches). Ratios mesurés en
commentaire dans `styles/encadrant.scss` (`tools/contrast/`) ; `styles/print.scss` relève
aussi `--warn` en thème Nuit pour l'impression, dont les cellules « à renforcer » dépendent
désormais également. La dernière cellule (semaine en cours) porte en plus un contour distinct
(`.enc-frise-courante`) : l'état qu'elle montre est déjà un fait, mais peut encore changer
avant dimanche.

**Rendu en un seul `role="img"` par ligne** (`friseNotionHTML`, `ui/encadrant-progression.ts`) :
les douze cellules sont `aria-hidden`, l'`aria-label`/`title` porte un **récit textuel** des
changements (« statut inconnu, puis passée en cours le 3 juin 2026, puis acquise hier ») plutôt
que d'annoncer douze cellules une à une, dont aucune n'est focalisable. La **puce d'état**
(pastille colorée) de la ligne est **omise** dès qu'une frise s'affiche : elle redirait, en
plus petit, ce que la dernière cellule montre déjà (avis designer) — le **mot** d'état, lui,
reste affiché (canal indépendant de la couleur, a11y). **Cette justification n'est vraie que
depuis le correctif « état du jour »** : la dernière cellule portait auparavant le plus haut
rang atteint, donc la puce avait été retirée sur une affirmation fausse, et une leçon
retombée à « à renforcer » n'avait plus aucun canal COULEUR disant son état réel. Si la frise
redevenait un jour purement historique, la puce serait à rétablir avec elle. La méta de la ligne (« travaillée N
fois · dernière fois … ») gagne la date du cap le **plus haut** franchi (« acquise le… » /
« passée en cours le… ») : la trajectoire complète vit dans la frise, la méta n'en retient que
l'événement marquant. Un segment « à renforcer » reste volontairement **muet** (pas de date,
ce palier n'en a pas) — « statut inconnu, puis à renforcer » se lit donc sans date pour ce
second segment. Rien à tracer (leçon jamais travaillée : encore « à découvrir » et aucun cap
franchi) → pas de frise, et la puce d'état n'est alors pas omise : la ligne garde sa pastille
habituelle. **Même verdict** pour une leçon (ou une liste) déjà travaillée dont pourtant AUCUNE
semaine ne serait déductible (#541 : douze cases `'inconnu'`, cf. [Logique pure](core.md)) —
un dessin entièrement creux se lit comme un bug d'affichage, pas comme une absence de donnée,
la ligne retombe donc sur sa pastille comme si la frise n'existait pas encore.

**Signal de recul** : il se lit DANS la rangée, comme un décrochage de la dernière cellule
sous celles qui la précèdent (p. ex. onze cellules « en cours » puis une « à renforcer »).

La règle a changé, et c'est le correctif « état du jour » : la frise se déduisant d'un journal
monotone, elle ne redescendait jamais, et le recul ne se voyait que comme un ÉCART entre sa
dernière cellule et le mot d'état affiché à côté. Ce design était intenable à l'usage — le mot
et la barre segmentée de la catégorie disent l'état du jour, la frise disait le plus haut rang
atteint, et rien à l'écran ne prévenait que les deux widgets ne mesuraient pas la même chose.
Une leçon retombée sous 40 % annonçait donc « à renforcer », comptait pour un segment orange
dans sa catégorie, et gardait une frise bleue jusqu'au bout ; le parent qui balaie les frises
ne voyait jamais la baisse. Un test e2e verrouillait même l'écart comme s'il était la
solution. La dernière cellule porte désormais l'état du jour (`finaliserFrise`, partagé avec
la frise des listes de dictée), et les trois expressions de l'état concordent.

Corollaire à connaître : le compteur « N changements récents » (`aChangeRecemment`) compte
depuis lors les BAISSES comme les montées. C'est voulu — une notion qui retombe est
exactement ce qu'un adulte doit pouvoir repérer sans déplier chaque catégorie — et le libellé
(« changement », jamais « progrès ») reste vrai dans les deux sens.

**Écarté, une fois pour toutes** : masquer la date du cap dans la méta de la ligne quand
l'état est retombé (« passée en cours le 15 juillet » affiché sur une leçon désormais « à
renforcer »). Remontée à la relecture pédagogique du correctif « état du jour », par crainte
d'une relecture au présent. Gardé tel quel : c'est un événement PASSÉ et daté, le mot d'état
juste à côté dit le présent, et la frise montre maintenant le décrochage — trois informations
qui se complètent au lieu de se contredire. La retirer effacerait une trajectoire réelle, le
défaut même que `friseListeOrtho` documente sous le nom de « sous-dire ». Inutile de la
re-remonter sans élément nouveau.

**La révision espacée alimente la frise** (#541) : dès qu'une session rejoue au moins un item
du catalogue, elle met à jour les stats de la leçon (et son étoile éventuelle) exactement
comme une leçon jouée seule, cf. [Logique pure](core.md) — une semaine de révision peut donc
faire monter un palier, sans attendre qu'une leçon soit relancée ailleurs.

**Dépliage global par matière** (`deplierHTML`) : un bouton par matière suivie (masqué s'il
n'y en a qu'une) ouvre ou referme d'un coup toutes les catégories de cette matière, pour
balayer plusieurs frises sans déplier catégorie par catégorie. Commande, pas un réglage
persistant : les catégories repartent repliées à l'arrivée sur l'écran. Le handler
`deplier-matiere` et l'événement natif `toggle` d'un `<details>` (un clic direct sur son
`<summary>` ne passe par aucun handler — capté en CAPTURE sur `#encadrantContent`,
`progressionToggle`, `ui/encadrant.ts`) tiennent à jour le même état de vue
(`categoriesOuvertes`), pour que le bouton reste juste même après une ouverture manuelle.
**Les catégories dépliées sont désormais retenues** d'un re-rendu à l'autre et réappliquées
au rendu (comme `vueActivite`) : jusqu'ici, toute action de l'écran (épingler une leçon,
changer de bascule…) refermait les catégories qu'on venait d'ouvrir.

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

## Travaillé récemment (#520)

**Travaillé récemment**, entre le graphe d'activité et « Notions par catégorie »
(`ui/encadrant-travail.ts` — `travailHTML`/`travailClick`, module de section au même
patron qu'`encadrant-erreurs`/`encadrant-revision`/`encadrant-banque`, composé par
`recapHTML` d'`encadrant-progression.ts`, aiguillé par `progressionClick`) : nomme
DIRECTEMENT ce qui a été travaillé sur une fenêtre courte, là où le graphe d'activité
compte des séances par jour sans nommer une seule leçon et où le détail par leçon reste
enfermé dans l'accordéon « Notions par catégorie », qu'il fallait déplier catégorie par
catégorie pour reconstituer la semaine.

Calcul pur dans `core/encadrant-stats.ts` : **`travailRecent(statsRaw, activityRaw, ortho,
sources, jours, now)`** → `GroupeTravail[]` (un groupe par matière, dans l'ordre de `SUBJECTS`,
chaque `cibles: CibleTravaillee[]` triée de la plus récente à la plus ancienne), lu pour
le profil consulté par **`travailRecentProfil(profile, jours, now, dicteeDispo)`** (mêmes
clés brutes par UUID que `progressionProfil`, plus les deux journaux de paliers et les
étoiles — cf. « Cap franchi » ci-dessous ; `dicteeDispo` sans défaut, **obligatoire**).

Chaque **`CibleTravaillee`** combine deux sources distinctes : l'**appartenance** à la
fenêtre vient de `lastAt` (tous chemins confondus : leçon jouée seule, bilan, sprint),
tandis que le **compte de séances** (`seances`) vient de la `ref` du journal d'activité
posée depuis #498. Une leçon vue seulement dans un bilan ou un sprint, qui ne référencent
pas une cible unique, n'a pas de `ref` attribuable : `seances` vaut alors **`null`**
(« travaillée, sans compte fiable »), et jamais `0`, qui se lirait « pas travaillée »
alors qu'on vient de l'affirmer.

Les **dictées** sont collectées depuis le SEUL journal d'activité (`{k:'dictee', ref}`) :
elles n'ont pas de stats de leçon, et sans elles le bloc annoncerait « aucune leçon
travaillée » un jour où l'enfant n'a fait que des dictées. `kind: 'lecon' | 'dictee'`
(`CibleTravaillee`) est une **donnée**, pas un libellé dérivé : l'UI compte les dictées à
part (« N leçons et M dictées travaillées ») sans avoir à reconnaître un mot français dans
`contexte`.

**Aucun filtre de niveau** — à la différence des notions par catégorie (et de leur frise)
juste à côté, scopées au niveau actif : ce qui a été travaillé l'a forcément été à la portée de l'enfant, et l'écarter au prétexte du niveau
suivi rouvrirait le trou que ce bloc ferme (une leçon CE2 rejouée par un profil CM1,
favori/révision/épingle, reste rangée `@ce2` par `niveauStockage`). Une leçon travaillée
sous deux niveaux porte donc deux clés de stats : elle est **dédoublonnée par id**, avec la
date la plus récente des deux.

Rendu : groupé par MATIÈRE, chaque ligne portant sa catégorie (leçon) ou l'étiquette
« Dictée » (`kind`), son compte (« N fois », omis quand `null` — jamais « travaillée N
fois », formule réservée au compte CUMULÉ « depuis toujours » de l'accordéon « Notions par
catégorie » ci-dessous, pour ne pas afficher deux chiffres différents sous la même phrase
sur le même écran) et sa date relative (`libelleDerniereFois`). **Aucun état d'acquisition
par ligne** (avis pédago), à une seule exception près (« Cap franchi », #536, ci-dessous) :
une notion tout
juste abordée est normalement encore « à découvrir », un badge afficherait donc un niveau
bas sur ce qu'il y a de plus récent, alors que c'est une photo d'activité et non un
jugement. Sélecteur de période à **1 / 2 / 7 jours** (composant segment partagé, cf. [Rendu
& interactions](ui.md)), défaut 7 jours pour s'aligner sur le graphe d'activité juste
au-dessus, sans choix « Tout » qui reviendrait à lister le catalogue. Au-delà de 6 lignes
par matière, le reste rejoint un repli dépliable (même parti pris que les erreurs plus
anciennes ci-dessous : jamais un simple compteur muet) — son chrome de `<summary>` est
**factorisé** dans le mixin SCSS `repli-sum` (`styles/encadrant.scss`), partagé avec le
repli des erreurs plus anciennes plutôt que recopié. État vide : « Aucune session … »
(le mot déjà employé par le graphe d'activité), jamais un « 0 » en tête de phrase.

**Cap franchi, seule exception positive (#536)** : une ligne peut porter la mention
« récemment passée en cours » / « récemment acquise » (`CapFranchi`, `MOT_CAP` dans
`ui/encadrant-travail.ts`, classe `.enc-trav-cap`, `--ok` en gras dans la méta plutôt qu'en
badge — un badge se lirait comme un état permanent, alors que le fait est ponctuel) quand la
cible a franchi ce cap **pendant la fenêtre affichée** (`capDansFenetre`). Deux valeurs
seulement, jamais rien de plus bas : ce sont les deux seuls franchissements que les
journaux de paliers datent, et les deux seuls que le pédagogue a autorisés à figurer ici.

Les deux journaux de paliers **n'ont pas la même clé** (cf. [Données &
profils](donnees-et-profils.md)) : celui des leçons (`ludaskia_paliers`) est indexé par la
clé de stats **namespacée** `lessonId@niveau`, la même que `statsRaw` ; celui des listes
(`ludaskia_paliersOrtho`) par l'**id nu** de la liste. Une première version avait adressé le
premier par id nu : la mention restait alors silencieusement muette pour **toute** leçon,
sans qu'aucun test ne le révèle — « aucun cap franchi » étant le cas ordinaire, rien ne
distingue un vrai calme d'une lecture qui rate sa clé.

Un cap n'est retenu que s'il est encore **porté par l'état courant** de la cible
(`capAnnoncable`) : les journaux sont MONOTONES (ils ne datent que les montées), alors que
l'état réel peut être redescendu depuis (perf récente retombée sous le seuil, mot ajouté à
une liste déjà acquise, voix de synthèse qui réapparaît et remet la dictée au rang des modes
requis). Le filtrage par l'état courant **précède** la prise du plus haut des deux valeurs,
et non l'inverse : un « acquis » démenti ne doit pas effacer un « en cours » de la même
fenêtre qui, lui, est encore vrai.

Les entrées nécessaires à ce calcul (les deux journaux, les étoiles, et `dicteeDispo` — la
dispo de la synthèse vocale, qui conditionne l'état courant d'une liste) sont rassemblées
dans `SourcesCapFranchi`, 4e paramètre de `travailRecent`. Forme **plate**, non imbriquée
par famille (`{ lecons: …, ortho: … }` aurait semblé plus parlante) : `dicteeDispo` n'est
pas une donnée du profil mais une propriété de l'**appareil**, et la ranger avec les deux
journaux lus en stockage laisserait croire qu'elle en vient aussi. `travailRecentProfil`
prend `dicteeDispo` en paramètre **obligatoire**, sans défaut : un défaut à `false` serait
silencieusement optimiste (une liste sans synthèse vocale s'acquiert plus tôt) et ferait
apparaître une mention sur une liste que l'appareil ne considère pas encore comme acquise —
exactement la classe de panne muette que ce mécanisme cherche à fermer.

Cas limite couvert par les tests : une leçon travaillée sous **deux niveaux** (deux clés de
paliers) est annoncée dès que l'**une** des deux a franchi un cap — cohérent avec le
dédoublonnage « aucun filtre de niveau » ci-dessus, qui traite déjà une telle leçon comme
une seule ligne.

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

**Journal d'états d'une liste** (#541) : `ludaskia_paliersOrtho` / `ludaskia_paliersOrthoDepuis`
(`core/orthographe/paliers.ts`, cf. [Données & profils](donnees-et-profils.md)) datent le premier
passage « en cours » puis « acquis » d'une liste, écrits en fin de dictée ET de révision espacée,
qui rejoue aussi des mots et peut donc faire franchir un cap à une liste sans qu'aucune dictée
n'ait été lancée. **Depuis #545, ce journal ne dessine plus de frise sur la ligne** —
`friseNotionHTML` (ci-dessus) reste réservée aux leçons du catalogue ; `RecapListeOrtho.frise`
(`friseListeOrtho`, [Logique pure](core.md)) survit seulement pour dater la méta de la ligne
(« acquise le… » / « commencée le… »), les deux seules informations qu'aucun autre champ ne porte
— la frise de COMPOSITION ci-dessous ne mesure pas la même chose et ne peut pas en tenir lieu.

**Frise de COMPOSITION d'une liste** (#545, remplace l'affichage de la frise d'états sur cette
ligne) : entre « en cours » et « acquis », des semaines de travail réel ne changeaient rien à
l'écran — le seul compte affiché (`avancementLecon`) ne retient que les mots dont TOUS les modes
sont validés. Chaque ligne porte désormais une **barre segmentée** — combien de ses mots sont,
**aujourd'hui**, à chaque étape du parcours (atelier de découverte, tuiles, affiche/masque, dictée
si le TTS est dispo) — suivie d'un dénombrement en toutes lettres (`compositionHTML`,
`ui/encadrant-progression.ts`, sur `composition`/`rangMot`, `core/orthographe/etapes.ts`) : cette
répartition bouge dès qu'UN mot monte d'une marche, même si personne ne devient « maîtrisé », ce
que la frise d'états ne pouvait pas montrer. Un repli natif ouvre la même répartition **semaine
par semaine sur 12 semaines** (`friseComposition`, `core/encadrant-stats.ts`, même fenêtre
`SEMAINES_FRISE` que les frises d'états ci-dessus) — narrée en **texte visible** (une entrée par
semaine où la composition CHANGE, pas les douze), jamais colonne par colonne : la frontière la
plus serrée de la palette (rang sous le sommet contre `--ok`, 1,24:1 en Nuit) ne suffit pas seule
à porter l'information.

**Datage PAR MOT** (#545, `core/orthographe/etapes.ts`) : chaque mot porte un champ
`franchissements?: Franchissements` (date du PREMIER passage à chaque étape, MONOTONE — un mot
rejoué ne réécrit pas sa date), écrit **structurellement** par `marquerAtelierFait`/`validerMode`
(`core/orthographe/runner.ts`) : c'est à l'INTÉRIEUR de ces deux fonctions, jamais laissé à un
appelant qui pourrait l'oublier, qu'un franchissement se date — impossible donc de faire
progresser un mot sans le dater. Troisième borne de mise en service, DISTINCTE des deux journaux
« par liste » ci-dessus (elle date des franchissements PAR MOT, journal plus récent que les deux
autres) : `ludaskia_orthoEtapesDepuis` (`ORTHO_ETAPES_DEBUT_KEY`, `debutSuiviEtapes`, cf. [Logique
pure](core.md) et [Données & profils](donnees-et-profils.md)).

**Un 4e cran « à renforcer » a été écarté pour les listes** (avis `pedagogue-primaire`, #545) :
côté leçon, ce cran signale une chute de performance RÉCENTE et mesurée (`pctRecent` sous le
seuil) ; rien d'équivalent n'existe côté liste, où la validation d'un mode reste binaire — le même
mot aurait donc désigné deux réalités différentes selon qu'on regarde une leçon ou une liste.
L'échelle d'une liste reste à **3 niveaux** (à découvrir / en cours / acquis, cf. ci-dessus).

**L'axe « solidité dans la durée » reste hors périmètre** (#545) : le palier de révision espacée
d'un mot est un axe PARALLÈLE au parcours d'apprentissage, pas sa suite — le brancher au bout de
l'escalier de composition serait faux (un mot « maîtrisé » peut être fragile en révision, et
inversement). Le pédagogue classait pourtant cet axe premier en utilité pour un parent ; le besoin
est noté ici pour ne pas être ré-instruit à chaque relecture — aucune solution retenue à ce stade.

**Rendu retenu** (avis designer) : la frise de composition doit se DISTINGUER de la frise d'états
au premier coup d'œil, sans quoi on lit l'une avec la grille de l'autre. Distinction
**structurelle avant d'être chromatique** : la frise d'états est un aplat unique par semaine dont
la HAUTEUR varie avec le rang atteint ; la frise de composition est une barre **segmentée** à
hauteur constante, toujours pleine — c'est une répartition, sa somme vaut toujours l'effectif de
la liste. Palette dédiée (`--compo-atelier` / `--compo-tuiles` / `--compo-cache`,
`styles/base.scss`, relevée en thème Nuit) en **rampe monochrome** — une seule teinte, trois
clartés — là où la frise d'états voisine est multi-teintes : elle encode un ESCALIER ordonné, pas
des catégories. Le SOMMET rompt la rampe et prend `--ok` : « combien de mots sont maîtrisés » est
la question que l'adulte pose en premier. Le repli des 12 semaines porte une cible de **36 px**,
et non les 44 px habituels de l'espace encadrant : depuis #545 une ligne de liste porte DEUX
replis l'un sous l'autre (mots + semaines), et 88 px de chrome cumulé espaçait tellement les
listes qu'on n'en voyait plus que deux à l'écran ; 36 px reste très au-dessus du plancher WCAG
2.5.8 (24 px), sur un écran d'adulte majoritairement tenu à la souris — le 44 px reste la règle
pour ce que l'ENFANT touche (`styles/encadrant.scss`).

**Amorçage par l'historique de dictée** : à la mise en service de ce journal, un profil déjà
actif n'a par construction AUCUNE donnée datée pour ses listes déjà travaillées — sans
rattrapage, chacune afficherait donc douze cases creuses, lues comme un bug plutôt que comme
une absence de suivi (d'où le choix de ne rendre AUCUNE frise dans ce cas, cf. « Frise d'états
par leçon » ci-dessus). `friseListeOrtho` compense en relisant le graphe d'activité
(`premieresSeancesDictee`, sur les entrées `{k:'dictee', ref}`, #498) : la 1re séance **datée**
d'une liste devient son cap « en cours » quand le journal n'en a pas de plus ancien, et la
borne de suivi de **cette ligne** (avant cette séance, rien n'est prouvable). Trois limites à
connaître : l'amorçage ne date **jamais** une acquisition (rien dans le stockage ne le
permet) — une liste déjà maîtrisée avant ce journal reste sans frise jusqu'à sa **prochaine**
séance ; le journal d'activité est borné aux **200** dernières séances et ne porte de `ref`
que depuis #498 ; et une liste travaillée **seulement** en révision espacée n'y a aucune
entrée à son nom (un tour de révision ne référence aucune cible unique, cf. [Logique
pure](core.md)).

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

**Résumé annoncé, avec un différé** (#527) : le compte affiché (« N mots affichés sur Total »)
vit dans une région live `#encBanqueResume` (`role="status"`) que le filtrage à la frappe
**mute** au lieu de la remplacer (un nœud recréé à chaque lettre n'est plus annoncé du tout),
écrite avec un délai de 350 ms (`DELAI_ANNONCE`) après chaque frappe ou bascule de filtre —
la réécrire à chaque lettre ferait qu'une synthèse vocale s'interrompt elle-même en boucle. Le
texte est **recalculé au moment de retomber**, jamais transporté depuis l'appel : un re-rendu
**complet** de l'espace (`renderEspace`, typiquement une suppression confirmée) peut survenir
dans cette fenêtre et réécrire lui-même le nœud avec le compte à jour ; un texte figé au moment
de l'appel retomberait alors par-dessus et y recollerait pour de bon un compte **périmé**, plus
rien ne le corrigeant ensuite. Recalculer rend cet écart impossible à exprimer, plutôt que de
compter sur chaque futur site de re-rendu pour penser à annuler le minuteur.

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

**Focus rendu au résumé après suppression** (a11y, #527) : la modale de confirmation rend le
focus au bouton « Supprimer » de la ligne, qui existe encore à cet instant — mais le re-rendu
**complet** qui suit (`renderEspace`) le détruit aussitôt, et le navigateur rabattrait sinon le
focus sur `<body>` (même piège que `demarrerRunner`/`#sheets`, cf. [Rendu &
interactions](ui.md)). `supprimer()` pose donc le focus sur `#encBanqueResume`
(`tabindex="-1"`) juste après le re-rendu : l'adulte au clavier garde son contexte, et c'est
aussi ce qui **fait dire** le nouveau compte à un lecteur d'écran — une région `role="status"`
recréée déjà remplie n'est annoncée de façon fiable par aucun moteur (même constat que pour le
filtre de période de l'historique des erreurs, ci-dessous).

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
l'intérieur d'une leçon, une même erreur répétée (même question + même réponse donnée + même
statut « passé ») est **dédoublonnée** en une seule ligne « vue N fois » plutôt que N lignes
identiques. Dans une
leçon, seules les **5 erreurs** les plus récentes s'affichent d'emblée ; les suivantes restent
lisibles via un repli **dépliable** (`<details class="enc-err-anciennes">`, imbriqué dans celui
de la leçon) plutôt qu'un simple compteur muet — le total annoncé en tête du groupe reste ainsi
consultable en détail. Parti pris
(avis designer-ux-enfant) : pas de rouge en aplat, la réponse attendue est mise en avant
(positif), la réponse donnée reste neutre et n'est jamais barrée. **« Passé sans essayer »**
(#467) : une entrée marquée `sansTentative` (l'enfant a demandé à voir la réponse, ou validé à
vide au sprint) n'est pas présentée comme une faute — la ligne « Réponse donnée » cède la
place à une phrase explicite **déduite du mode** (« N'a pas essayé : a demandé à voir la
réponse. » partout, sauf au sprint — seul mode où une validation vide vaut ce marqueur, faute
de bouton « Je ne sais pas, montre-moi » sous chrono — « N'a pas essayé : a validé sans
répondre. », `.enc-err-passe`, icône œil décorative) et
le liseré de l'item perd son accent « écart » pour un filet neutre (`.enc-err-item--passe`). Le
sens tient dans le texte, jamais dans la couleur seule. Ces entrées **comptent** en revanche
dans le « N erreurs » du groupe : le journal reste la liste de ce qui n'était pas su. Le libellé lit « **Réponse
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

## Assigner une leçon d'une autre classe (#556)

Un adulte peut désigner, pour un profil, une leçon d'une classe **autre** que celle qu'il
suit — typiquement une notion CE2 à consolider pour un CM1 — **sans faire reculer toute la
matière**. Le niveau reste une donnée transversale ([Niveaux
scolaires](niveaux-scolaires.md), #225) ; ce qui change, ce sont les points
d'**exposition** : deux endroits où l'adulte DÉSIGNE une leçon précise partagent le même
sélecteur tous niveaux (`ui/selecteur-lecon.ts`, cf. [Rendu &
interactions](ui.md)) — l'épinglage « à revoir » (sous-bloc « Épingler une leçon »,
ci-dessous) et la cible d'une étape « une leçon précise » du programme du jour (« Composition
du programme du jour », plus bas). Là où le catalogue de l'enfant (et les pools de tirage,
sprint/révision) restent strictement scopés à sa classe, ce sélecteur ouvre TOUT le
catalogue : le niveau y redevient un FILTRE (barre de jetons « Sa classe » / par classe,
recherche) plutôt qu'une frontière.

**Trois régimes d'affichage**, selon d'où vient la cible retenue par rapport à la classe
suivie par le profil pour la matière de la leçon (`core/encadrant-stats.ts:origineLecon` →
`OrigineLecon {niveau, direction}`, cf. [Logique pure](core.md)) :
- **classe suivie** — état d'acquisition habituel, sans rien de plus ;
- **classe EN DESSOUS** — badge « classe d'origine » + état d'acquisition, lu au niveau de
  **stockage** de la cible (`scopeStockage`, [Niveaux scolaires](niveaux-scolaires.md)) : une
  consolidation part souvent d'un état bas, ce qui est normal et non une alerte ;
- **classe AU-DESSUS** — badge « classe d'origine » + **compte-rendu FACTUEL** (« Pas encore
  travaillée » / « Essayée … » / « Réussie … »), **jamais** un état d'acquisition (avis
  pédagogue) : un échec afficherait « à renforcer » sur une notion pas encore enseignée, une
  réussite « acquis » sur un seul essai. Cet essai ne compte ni dans les compteurs de
  maîtrise, ni dans les suggestions « à revoir », ni dans le signal « reste un point dur »
  (#492), qui supposent tous du contenu de la classe suivie.

**Le badge « classe d'origine »** (`badgeClasseOrigine`, `ui/encadrant-commun.ts`) ne
s'affiche que côté ADULTE, et seulement là où l'on voit une leçon **déjà choisie** : la ligne
d'une épingle (suggestions et « Retirées automatiquement » exclues — leurs lignes viennent
du récap scopé, donc toujours de la classe suivie) et l'étape « une leçon précise » d'un
programme, une fois sa cible retenue. Il ne s'affiche jamais dans le sélecteur lui-même (le
jeton de filtre actif dit déjà la classe). L'ancien libellé « hors du niveau suivi » et la
classe CSS `.enc-revoir-hors` — qui marquaient une épingle hors classe comme **inerte** —
ont disparu avec #556 : une telle épingle n'est plus inerte, elle revient normalement sur
l'accueil de l'enfant (cf. « À revoir » ci-dessous).

**Son explication a deux formes selon le site (#571)** : `badgeClasseOrigine(niveau,
infobulle?)` prend l'infobulle en paramètre **optionnel**. Sur la ligne d'une épingle —
où l'état d'acquisition ou le compte-rendu factuel juste à côté laisse deviner le SENS de
l'écart (consolidation ou avance) — le badge PORTE l'infobulle : `role="img"` avec un
`aria-label` qui enchaîne le préfixe, la classe ET la phrase, `title` conservé pour la
souris. Sur l'étape « une leçon précise » du programme, où le badge est **seul** sur sa
ligne (rien d'autre n'indique le sens de l'écart), il est rendu **nu** (préfixe `sr-only`
seulement) et la phrase est affichée **en clair sous l'activité** par une fonction dédiée
(`noteOrigineHTML`, `ui/encadrant-seance.ts`) — jamais les deux à la fois, pour ne pas
l'annoncer en double. Le motif du choix : un `title` sur un `<span>` non focusable ne
s'ouvre **jamais** au doigt, or cet écran est fait pour la tablette, et sur un rôle
générique sa restitution vocale reste inconstante.

**Asymétrie voulue avec la révision espacée** : une leçon assignée **en dessous** entre
normalement en révision espacée, à son niveau de stockage, comme n'importe quelle leçon
jouée. Une leçon assignée **au-dessus**, elle, reste un essai PONCTUEL qui n'entre jamais en
révision — et cela **ne demande aucun code nouveau** : l'état de répétition espacée
n'AVANCE (`core/progress.ts:avancerLessonRevision`) que depuis le mode Révision
(`ui/revision.ts`), dont le pool de sélection se limite à la vue scopée à la classe suivie
plus, au maximum, un niveau en dessous (#232, cf. [Logique pure](core.md) et « Récap du mode
Révision espacée » ci-dessous) — jamais au-dessus. Une leçon prise en avance ne peut donc
jamais y être tirée, ni y voir son état avancer.

**L'enfant ne voit AUCUNE étiquette de classe, nulle part** : la carte d'accueil, la file « à
revoir » et le programme du jour lui présentent la leçon exactement comme les autres — seule
la lecture de son état, côté adulte, change selon d'où elle vient.

Ferme #535 comme sous-cas (une épingle hors classe qui ne revenait jamais sur l'accueil de
l'enfant).

## « À revoir » → carte d'accueil

**« À revoir » → carte d'accueil** : l'encadrant **épingle** une leçon du catalogue **ou** une
liste de dictée (#424) — `toggleRevoirFor(uuid, entryId)` → `ludaskia_revoir` du profil (cf.
[Données & profils](donnees-et-profils.md)). La file reste un simple `string[]` : une entrée de
dictée s'y distingue par le préfixe `ortho:` (`orthoRevoirId`/`isOrthoRevoirId`/
`orthoIdFromRevoir`, `core/encadrant-stats.ts`) — id opaque pour une liste du parent, `fr-ortho-*`
pour une dictée prédéfinie.

**Depuis #490, l'ENFANT peut aussi y ajouter une entrée** : le panneau d'étayage de la
notion (cf. [Rendu & interactions](ui.md)), quand il renvoie à une leçon prérequise,
propose de la mettre de côté — même mécanique (`toggleRevoirFor`), mais à l'initiative
de l'enfant plutôt que de l'adulte (l'épinglage était jusqu'ici un geste d'adulte
exclusif). **La file ne distingue pas la provenance d'une entrée** : côté espace
encadrant, une leçon mise de côté par l'enfant apparaît dans « Épinglées » exactement
comme une leçon épinglée par l'adulte, sans aucun marquage — état ASSUMÉ pour cette
1re livraison (arbitrage mainteneur), pas nécessairement définitif.

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

**État d'acquisition sur une épinglée** (#518, révisé #556) : chaque ligne porte le même
badge que celles des suggestions (`EpingleEntry.etat`, `core/encadrant-stats.ts`) — sans lui,
l'adulte ne pouvait pas juger s'il fallait désépingler. Une leçon épinglée jamais travaillée
n'est pas un trou de données : elle est dans le récap à `'a-decouvrir'`, donc affiche
« à découvrir » comme n'importe quelle notion neuve. Une cible d'une AUTRE classe que celle
suivie porte en plus le badge « classe d'origine » (`EpingleEntry.origine`) et suit l'un des
deux régimes hors classe détaillés dans « Assigner une leçon d'une autre classe » plus haut —
dont un compte-rendu FACTUEL pour une cible prise dans une classe au-dessus, jamais un état
d'acquisition.

**Épingler une leçon** (#556, `epinglerHTML`) : sous-bloc qui ouvre le sélecteur de leçon
partagé (`ui/selecteur-lecon.ts`, cf. [Rendu & interactions](ui.md)) avec « Épingler » pour
action de ligne — tout le catalogue, y compris les classes que l'enfant ne suit pas. Il
COEXISTE avec l'épinglage inline des « Notions par catégorie » et du signal « reste un point
dur » ci-dessus, qui reste le geste naturel quand on vient de lire l'état d'une notion DÉJÀ
au programme de la classe suivie : les deux écrivent la même file `ludaskia_revoir`.

Une troisième sous-section, **« Retirées automatiquement »** (#465,
`retraitsAutoProfil(profile, now)`), rappelle les entrées que la purge vient de retirer —
libellé, date et **motif** (#571, ci-dessous) **figés** à l'instant du retrait, la cible peut
avoir disparu depuis sans que la trace devienne muette — pour qu'une épingle ne s'efface
jamais sans explication ; un bouton « Épingler » la remet dans la file d'un clic (elle sort
alors de cette trace).

**Ce que la ligne a le droit d'annoncer (#571)** : la phrase d'en-tête du bloc reste
factuelle (« Ces notions ont quitté la liste d'elles-mêmes. Épinglez-en une si vous voulez
quand même y revenir. »), sans jugement — jusqu'ici elle affirmait, pour TOUTE entrée,
« … les maîtrise de nouveau », y compris pour une leçon d'une classe suivante réussie une
seule fois, verdict que la ligne d'une épingle « au-dessus » refuse déjà de prononcer sur
cette même notion deux blocs plus haut. Chaque ligne porte désormais son propre motif
(`RetraitAuto.motif`, `MotifRetrait = 'maitrise' | 'essai'`, calculé et FIGÉ au moment du
retrait comme le libellé, cf. [Logique pure](core.md)) : « de nouveau maîtrisée » pour une
cible de la classe suivie (ou en dessous), « essai réussi » pour une cible venue d'une classe
au-dessus — jamais une maîtrise, et jamais « de nouveau » (aucune maîtrise antérieure n'a
existé). Motif ABSENT sur une trace d'avant #571 : la ligne n'affiche que la date, sans en
supposer un. **Le retrait lui-même ne change pas** : même critère de solidité pour toutes les
entrées (mêmes « Deux garde-fous » ci-dessus) — le motif ne s'ajoute PAS comme un troisième
garde-fou, il ne change que ce que la trace en DIT, jamais si l'entrée est retirée.

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
masquée (elle compte pour la couverture). **Filtre aligné sur ce que le moteur révise
VRAIMENT** (pas seulement la frise d'états, qui reste scopée au seul niveau actif) : les
entrées du **niveau actif de la matière** (`niveauProfilMatiere`) **et**, depuis l'entretien
du niveau inférieur en révision espacée (#232), celles du niveau **immédiatement en
dessous** sont montrées — ces clés ne sont plus dormantes, les masquer rendrait le suivi
faux. Chaque entrée d'entretien porte son **niveau d'origine** en pastille (`entreeHTML`,
`ui/encadrant-revision.ts` — elle réutilise la pastille de catégorie, `.enc-rev-cat`, plutôt
que d'ajouter un style : même rôle visuel), pour ne pas se confondre avec la même leçon
suivie au niveau actif dans la même catégorie. Tout le reste (au-dessus du niveau actif, ou à plus d'un
niveau en dessous) reste dormant et masqué : l'afficher créerait un doublon fantôme « en
retard » que le parent ne pourrait jamais résorber — c'est aussi, depuis #556, ce qui
garantit qu'une leçon assignée dans une classe au-dessus n'entre jamais en rotation (cf.
« Assigner une leçon d'une autre classe » plus haut). Cette distinction de niveau d'origine
est réservée à l'espace encadrant — rien n'en est montré à l'enfant.

Trois visualisations, bascule au même patron que le graphe d'activité (module
`ui/encadrant-revision.ts`, composant segment en variante `wrap` depuis cette 3e option —
trois libellés de cette longueur ne tiennent pas sur une ligne de téléphone) : **« Par
catégorie »** (regroupement dépliable, même chrome que « Notions par catégorie »), **« Par
urgence »** (liste à plat, les plus en retard d'abord, `compareUrgence`) et **« Par palier »**
(#555, `PalierRevision[]`, `core/encadrant-stats.ts:revisionProfil`). Cette dernière répond à
« qu'est-ce qui stagne en bas de l'escalier, qu'est-ce qui est presque ancré ? », une lecture
qu'aucune des deux autres ne donne : la catégorie mélange les paliers, et l'urgence trie sur
l'échéance, qui DÉCOULE du palier sans le dire (deux entrées dues aujourd'hui peuvent être
l'une au 1er étage, l'autre au 5e). Un étage par palier occupé, du moins ancré au plus ancré,
« acquis » en dernier ; **les étages vides ne sont pas rendus**. En-têtes d'étage en **vrai
`<h3>` NON repliable** (contrairement aux `<details>` de la vue par catégorie) : la question
posée ici est une lecture panoramique, que des accordéons fermés cacheraient précisément (avis
designer). Le palier de chaque entrée est alors porté par l'en-tête de son étage et n'est plus
répété sur la ligne — reste l'échéance, seule information qui varie encore d'une ligne à
l'autre à palier égal. Seul chiffre affiché : un dénombrement (« X en révision, dont Y à réviser
· Z déjà acquises »), aucun pourcentage ni note.

**« Par palier » et « Par urgence » sont plafonnées** : rien ne borne le nombre d'entrées d'un
profil (une par leçon travaillée et par mot d'orthographe en rotation), et les deux vues à plat
devenaient un mur illisible sur un profil réel chargé. **6 lignes** visibles par étage
(`MAX_PAR_ETAGE`) et **20 lignes** au total en « Par urgence » (`MAX_URGENCE`, module
`ui/encadrant-revision.ts`) ; le tri par urgence plaçant déjà les plus pressantes en tête, le
plafond ne coupe que la queue la moins urgente. Le reliquat rejoint un repli `<details>` (même
geste que « Travaillé récemment » et l'historique des erreurs plus haut) dont le libellé redit
aussi les entrées DUES qu'il cache (« N autres, dont M à réviser »), avec un contrôle « Voir
moins » en tête ET en pied (le second vise un reliquat de plusieurs centaines de lignes, où le
résumé d'ouverture est loin en haut de l'écran). **Invariant** : l'en-tête d'un étage
(`resumeEtage`) et la synthèse du bloc comptent toujours la liste COMPLÈTE, jamais la tranche
affichée — c'est ce qui permet de plafonner sans mentir sur ce que contient la file. Un filet
coloré (`--admin-accent`, `--ok` pour l'étage « Acquis ») sépare deux étages consécutifs. La vue
« Par catégorie » n'a pas ce plafond : ses `<details>` par catégorie sont déjà repliés par
défaut.

**Distinct de « à revoir » ci-dessus** : cette file reflète le moteur de révision espacée
(#45), automatique et alimentée par le passage en session ; la file « à revoir »
(`ludaskia_revoir`) reste un mécanisme **manuel**, épinglé par l'encadrant. Les deux
coexistent sans se recouvrir.

## Composition du « programme du jour » (#440)

Bloc de composition (`ui/encadrant-seance.ts` — `seanceHTML`/`seanceClick`/
`seanceChange`, en tête de l'**onglet Programme**, #459) permettant à l'encadrant de préparer,
pour le profil **consulté** (par UUID, sans bascule), un ou plusieurs programmes :
une liste d'**étapes** (Sprint, Révision, **À revoir** #464, Leçon du jour, une leçon
précise ou une dictée) répétées `count` fois (paliers fixes 1 à 5, pas de saisie libre),
et une **récurrence** (une **date** ponctuelle ou des **jours de semaine**). Une étape
« dictée » vise un **pool** de dictées cochées via une liste à cases (#463, cf.
[Logique pure](core.md)), filtrées au **niveau du profil** comme ce que l'enfant voit :
une seule cochée reste figée, deux ou plus donnent un tirage au hasard à chaque lancement
(l'enfant ne voit pas laquelle avant de commencer). Une étape **« une leçon précise »
(#556)** cible, elle, TOUT le catalogue via le sélecteur de leçon partagé (cf. « Assigner
une leçon d'une autre classe » plus haut, et [Rendu & interactions](ui.md)) : elle NAÎT
sans cible (aucune présélection, ce serait poser une consigne que l'adulte n'a pas donnée)
et n'entre ni dans le nombre d'activités du composeur ni dans `estimationDureeMin` tant
qu'aucune leçon n'est choisie — elle disparaîtrait sinon au lancement, ce qui aurait promis
un temps que l'enfant ne passera pas (`etapeConfiguree`, cf. [Logique pure](core.md)). Une
fois une cible retenue, elle est affichée seule sur la ligne, avec le badge « classe
d'origine » si elle vient d'une autre classe que celle suivie. Une étape **« À revoir »
(#464)** n'a rien à configurer : sa cible est la file épinglée du profil (ci-dessus) — un
repère (« rien n'est épinglé » / « ce sera celle-ci » / « une au hasard ») prévient
l'adulte si elle restera invisible tant que rien n'est épinglé. **Choix assumé** : cette
étape **s'ajoute** à la carte d'accueil « à revoir », elle ne la remplace pas — deux
chemins vers la même file (l'un toujours disponible, l'autre au fil du programme composé).
Garde-fou « un seul programme par jour » : `recurrencesEnConflit` (`core/seance.ts`)
refuse une récurrence qui chevaucherait celle d'un autre programme du même profil (message
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
apparitions surprises* + *ne pas rappeler les mots difficiles* (`setPrefFor`, avis
`specialiste-troubles-apprentissage`). Le 3ᵉ (#331, `sansApparitionsSurprises`) coupe
l'**easter egg ambiant** (la luciole qui
passe) pour un enfant qu'un mouvement inattendu déconcentre ou qui a besoin de
prévisibilité — il **n'affecte pas** les eggs d'exploration, déclenchés volontairement par
l'enfant (cf. [Gamification](gamification.md)). Le 4ᵉ (#618, `sansMotsDifficiles`) coupe
le rappel de fin de séance d'orthographe (cf. [Rendu & interactions](ui.md)) pour un
enfant que revoir ses mots ratés décourage plutôt qu'il ne l'aide — il **n'affecte rien
d'autre** : le journal d'erreurs de ce même onglet continue de capturer le premier essai
raté de chaque mot, que le rappel soit affiché ou non côté enfant. Le **« Mon confort »** (réduire les
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
