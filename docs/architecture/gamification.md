[← Architecture Ludaskia](../ARCHITECTURE.md)

# Gamification

> Pédagogie : régularité espacée, pas de pression quotidienne.

## Médailles, trophées & récompenses

**Médailles** = podiums des classements (🥇🥈🥉), réservés au **sprint** (seul
ensemble stable, donc comparable). Les **bilans** (express/complet) ne sont
**pas classés** — leurs leçons varient d'un essai à l'autre — mais restent
enregistrés (régularité + trophées cumulatifs). **Trophées** = succès cumulatifs,
présentés dans une **modale dédiée** (bouton de l'accueil), plus une **modale
« Récompenses »** qui récapitule les paliers de niveau (rangs, compagnon, avatars,
thèmes) acquis ✓ / à venir 🔒 ; ouvertes depuis l'accueil et l'écran Profils
(`ui/unlocks-view.ts`).

## Objectifs de régularité

**Objectifs de régularité** (panneau d'accueil, hebdomadaires, `REGULARITY`) :
**2 sprints**, **3 révisions** (sessions de répétition espacée *terminées*) et
**1 nouvelle leçon** par semaine (#178). Ces trois pratiques constituent un
usage sain (un peu de chrono, de l'entretien espacé, de la découverte) ; les
bilans express/complet n'y figurent plus. Comptage : `countSince(mode, since)`
pour sprint et `revision-espacee` — **tous niveaux confondus** (effort global :
changer de classe en cours de semaine ne remet pas l'objectif à zéro, #233) ;
une session terminée enregistre un `run` non classé, juste pour le décompte ;
`countNewLessonsSince(since)` pour la
nouvelle leçon, à partir du **premier passage daté par leçon**
(`ludaskia_lessonFirstSeen`, posé dans `recordLessonStats` à la 1re rencontre).
L'objectif « nouvelle leçon » est **masqué** quand le catalogue est entièrement
découvert et qu'aucune découverte n'a eu lieu cette semaine (pas d'objectif
fantôme jamais cochable).

## Défi du jour

**Défi du jour** contextuel et « qualité » : jamais un défi impossible
(remédiation seulement s'il existe une leçon < 70 % ; « bats ton record »
seulement s'il y a un record). Le vivier de remédiation (`rewards.ts:weakLessons`)
exclut une leçon actuellement **mise de côté** par la leçon du jour (#485, report,
cf. [Logique pure](core.md)) : la reproposer irait à l'encontre du répit qu'elle
vient de recevoir ; elle continue de revenir via la révision espacée.

## Série de jours

**Série de jours** calculée en coulisse, uniquement pour les trophées 3/7 jours
(one-shot, jamais reperdus) ; pas d'affichage anxiogène.

## Trophées à paliers (déclaration)

Trophées à paliers via `tiers(prefix, icon, metric, levels)` ; un trophée se
déclare par `{metric, n}` (compilé en test `g[metric] >= n`) ou un `test`
explicite. `gSnapshot()` fournit les métriques, dont des agrégats **par matière**
et **par catégorie** (`subjectCorrect/Stars`, `categoryCorrect/Stars`) ; des
groupes de trophées par matière/catégorie sont **générés depuis le catalogue**
(ils s'étendent automatiquement avec les nouvelles matières).

Ces compteurs d'effort agrègent `LessonStat.correct/questions`, donc **toutes** les
réponses enregistrées comme stats de leçon — y compris, depuis #541, celles de la
révision espacée, qui n'écrivait auparavant qu'un run de régularité. Un même
entraînement compte donc un peu plus qu'avant vers ces trophées ; c'est cohérent
avec l'XP, gagnée « tous modes confondus » de longue date.

**Franchir plusieurs paliers d'un coup n'est pas un défaut (#559).** Rebrancher une
métrique sur un CUMUL (ex. les paliers ⭐ sur `starsTousNiveaux`, cf. [Niveaux
scolaires](niveaux-scolaires.md)) peut faire dépasser **plusieurs** seuils au même
appel d'`evaluateTrophies()` pour un profil déjà avancé — rien à coder pour ce cas :
`showCelebration` affiche déjà une **liste** de récompenses dans une **modale
unique**, jamais des pop-ups en série, et c'est le mécanisme déjà employé partout
ailleurs pour un déblocage simultané (plusieurs trophées de bilans/sprints à la
fois, montée de niveau + déblocage cosmétique…). Juger du *ressenti* de voir trois
trophées listés d'un coup relève d'un avis `gamification-enfant` /
`designer-ux-enfant`, pas d'un défaut technique.

## Tour complet d'une matière (#276)

Le jalon le plus rare de l'app — finir **toutes** les leçons proposées, dans **une**
matière, à son niveau actif — donne lieu à un trophée `tour-<matière>-<niveau>`
(`rewards.ts:tourMatiereTrophies`, un id par couple matière × niveau **peuplé**), qui
sert à la fois de célébration à l'instant (modale + confettis, comme toute
récompense), de gate anti-rejeu (le stockage des trophées ne rend que le
nouvellement acquis) et de trace en galerie. **Aucun état dédié** n'est nécessaire :
la condition (`tourMatiereFait`, cf. [Logique pure](core.md)) est recalculée en direct
à chaque évaluation.

**Barre volontairement plus basse que « Sans faute partout » (`starsAll`)** : une
leçon est « franchie » ici dès qu'elle est étoilée **ou** réussie au seuil des 70 %
(la même barre que le fil de la leçon du jour, #485) — pas besoin du sans-faute sur
chacune. C'est précisément le chemin franchi au score, jamais étoilé, que rien ne
fêtait avant ce lot ; les deux jalons restent **distincts** et peuvent se déclencher à
des moments différents.

**Aucun XP** n'accompagne ce trophée : sans cette règle, finir la matière où l'on est
à l'aise en évitant l'autre deviendrait rentable. Même icône et descriptions de
longueur comparable entre matières, pour qu'aucun tour ne paraisse plus « juteux »
qu'un autre. Pas de « grand tour toutes matières » par-dessus les deux tours : ce
serait un doublon de prestige sur un jalon censé rester rare.

**Dans la galerie** (`ui/unlocks-view.ts:openTrophees`), `trophiesVisibles()` masque
un trophée de tour d'un niveau **au-dessus** du niveau de référence tant qu'il n'est
pas acquis (afficher « 🔒 Tour complet — Mathématiques CM1 » à un enfant de CE2
pointerait vers « la suite », une décision d'encadrant). Un tour déjà acquis reste
visible même si le niveau redescend ensuite. Le compteur « N/M trophées obtenus »
compte les acquis **parmi les visibles** (et non `TROPHIES.length`), pour rester
cohérent quand le dénominateur varie avec le niveau.

Pourquoi la maille est **matière × niveau**, pas le seul niveau : cf. [Niveaux
scolaires](niveaux-scolaires.md), qui détaille aussi pourquoi ce trophée ne rentre ni
dans la case « scopé » ni dans la case « global » des autres trophées de cette page.

## Trophée « programme du jour » (#440)

Le **programme du jour** composé par l'encadrant (cf. [Modes &
navigation](modes-et-navigation.md) et [Espace encadrant](espace-encadrant.md)) donne
lieu à un trophée à paliers dédié (`tiers('seance', …)`, métrique
`seancesCompletees` — compteur **cumulé, jamais remis à zéro**, à la différence de
l'état du jour) : 1 / 7 / 30 programmes menés **en entier**. **Forfaitaire** (un
programme court et un long comptent 1 pareil) et **sans XP** : la complétion
déclenche la modale + confettis habituelle, mais aucun bonus d'XP — chaque mode
composant le programme a déjà donné le sien.

## Trophées « ce qui tient dans le temps » (#660)

Deux familles adossées à la **répétition espacée** (`core/revision.ts`) reconnaissent ce
qui n'a pas été *seulement réussi une fois*, mais a **tenu** : un élément n'y compte
qu'une fois arrivé au sommet de l'escalier (`PALIER_ACQUIS`), soit **137 jours sans échec
au minimum** (réalistement plusieurs mois, ratés compris). Jusqu'ici, un savoir qui tient
ne rapportait rien de plus que l'XP de fond d'une bonne réponse.

**Un rendez-vous servi très en retard peut créditer plusieurs paliers d'un coup, mais
jamais l'ancre elle-même (#688)** : le crédit de l'escalier (cf. [Logique
pure](core.md)) plafonne au palier 3, il reste donc toujours trois réussites à des
rendez-vous réels avant `PALIER_ACQUIS` (16 + 35 + 75 jours ; le cadrage de l'issue
écrivait « au moins deux », le plafond retenu en impose trois), et le plancher ci-dessus reste
le chemin le plus court possible — l'escalier est sur-additif, attendre pour se faire
créditer un cran coûte toujours plus cher que le gagner en deux rendez-vous à l'heure. Le
crédit rattrape une information jetée par le retard de la file, il ne fabrique jamais de
progression : le sens du trophée (ce qui a réellement TENU) est préservé.

**Deux familles, jamais un compteur unique** : **mots d'orthographe ancrés**
(`orthoAncres1/150/300/420`, 🧠, métrique `orthoMotsAncres` — mots dont l'escalier de
révision a atteint `estAcquis`, toute la banque du profil comptant, mots saisis par le
parent compris) et **notions ancrées** (`notionsAncrees1/45/120/200`, 💎, métrique
`notionsAncrees`, comptée en **paires leçon × niveau**, comme les étoiles cumulées #559 :
retravailler une notion au niveau supérieur est un travail distinct). Les mots se comptent
par centaines, les notions sont bornées par le catalogue : fondues en un seul compteur,
l'événement le plus signifiant — une notion entière qui tient — disparaîtrait derrière le
plus fréquent.

**Notions ancrées : lues sur l'état de révision BRUT, jamais sur la vue scopée au niveau
actif** (`progress.ts:notionsAncrees()`) — scoper ferait BAISSER le compteur quand une
matière passe du CE2 au CM1, exactement le défaut que #559 avait corrigé pour les étoiles.
Contrepartie assumée, propre à cette lecture brute : une entrée dont la leçon a QUITTÉ le
catalogue est comptée elle aussi (renommer un id de leçon ajoute +1 définitif) — un
compteur qui monte à tort après une maintenance du catalogue est jugé bénin, à la
différence d'un compteur qui BAISSERAIT et reprendrait à l'enfant un travail réel. Détail
de la taxonomie scopé/global/troisième-nature dans [Niveaux scolaires](niveaux-scolaires.md).

**Seuils volontairement hors de la convention `tiers()` des autres familles** (avis
`gamification-enfant`) : le calibrage habituel suppose une métrique qui bouge à chaque
séance, alors qu'ici un seul élément met des mois à franchir. Ancres mesurées au cadrage :
466 mots distincts livrés (419 atteignables sans quitter le CE2), 264 paires leçon × niveau
(142 en CE2). Le **4ᵉ palier de chaque famille dépasse délibérément le plafond CE2** : un
capstone qui suppose du contenu CM1.

**Impossible à forcer, donc sans dark pattern** : rien de ce que l'enfant fait aujourd'hui
n'avance ces compteurs avant plusieurs semaines — reconnaissance **rétrospective**, pas un
objectif à viser. Corollaire de rendu : **aucun écran enfant ne révèle quels éléments
approchent du sommet** (ce serait rendre le trophée ciblable, donc *forçable*) ; côté
encadrant, la vue « Par palier » (#555, cf. [Espace encadrant](espace-encadrant.md))
donne seule cette lecture, à l'adulte plutôt qu'à l'enfant.

**À ne pas confondre avec `orthoMots` (« mots maîtrisés », seuils 10/50/100/200)** : cette
famille existante compte les mots ayant validé motCache + tuiles **une fois** — affaire de
quelques séances, qui ne dit rien de la durée. Les deux familles cohabitent volontairement
sur la même population de mots.

Aucun mot absolu dans les libellés (« pour toujours ») ni verbe d'action en tête (charte
détaillée dans [Conventions rédactionnelles](conventions-redaction.md)) : un élément au
sommet peut redescendre s'il est raté plus tard, et ces trophées ne sont pas une consigne
du jour. **Cette phrase est un chemin RÉEL depuis #689** (cf. [Logique pure](core.md)) :
elle était fausse avant — le sommet posait `prochaineRevision: null` et sortait de la
rotation pour de bon, donc rien ne pouvait plus jamais le re-tester ni le faire
redescendre. Le sommet pose désormais un rendez-vous de **contrôle annuel**
(`REVISION_CONTROLE_ACQUIS`, 365 jours) ; un contrôle raté fait redescendre d'un cran
comme n'importe quel échec, donc cesse d'être compté par `estAcquis` — et les deux
métriques `orthoMotsAncres`/`notionsAncrees` qui en dépendent peuvent désormais
**diminuer**. Tenu par
`tests/trophees-ancres.test.ts` (calcul, seuils, non-reverrouillage, propriété des
libellés) et `e2e/revision-trophees-ancres.spec.ts` (annonce en fin de session de
révision, apparition dans la galerie — cf. [Tests](tests.md)).

## XP & niveaux

**XP & niveaux** : 1 point d'XP par bonne réponse, tous modes confondus
(`addXP`). L'XP totale (`ludaskia_xp`) reste l'unique source de vérité ; le
**niveau (1 → 100)** en est *dérivé* par fonction pure (`niveauDepuisXP`),
donc aucune migration. Courbe « de plus en plus dure » : coût d'un palier
`round(12 × L^0,89)` (`xpVersSuivant`), calibrée (avis pédagogique CE2) pour
qu'une leçon isolée fasse gagner au plus 1 niveau au début ; ~37 900 XP pour
le niveau 100, dernier palier ~717 XP (pas un mur).
Affiché dans la barre d'outils en **badge niveau + barre de progression**
(`progressionNiveau`) ; l'XP brute n'apparaît plus qu'en infobulle.

## Déblocages par niveau

**Déblocages par niveau** : monter de niveau débloque du **cosmétique** (jamais du
contenu d'apprentissage). En place : un **rang** (titre + icône Nature, épicène) et
une **mascotte évolutive** (compagnon œuf→aigle), tous deux dérivés du niveau
(`core/unlocks.ts`). Le rang s'affiche dans le **badge de la barre** ; rang + mascotte
vivent dans une **carte « progression »** sur l'accueil, où la mascotte est **animée**
(entrée + boucle de repos douce selon sa forme, coupée sous `prefers-reduced-motion` ;
animée uniquement sur cet écran de contemplation, jamais pendant un exercice
chronométré). La mascotte apparaît aussi comme **accompagnant** (bulle de BD
d'encouragement) **autour** des exercices — sur les **écrans de résultats** (session,
sprint, orthographe) et sur l'accueil (où elle annonce le défi du jour) — mais
**jamais pendant** un calcul chronométré ni en réaction à une erreur. Les déblocages
d'un palier sont annoncés dans la **modale de niveau** (`showLevelUp`), l'évolution de
la mascotte y étant mise en avant. Des **avatars
« forêt »** se débloquent aussi par palier : dans le sélecteur d'avatar (écran Profils),
les non-débloqués sont grisés « 🔒 Niv X », jaugés au niveau du **profil édité**
(`getXPFor`) ; `setProfileEmoji` refuse un avatar verrouillé et `resetProfile` rend un
avatar forêt si l'XP repart à zéro. Des **thèmes de couleur** (tous clairs) se
débloquent aussi par palier : choisis dans le bloc « Préférences » de l'écran Profils
(verrouillés grisés), stockés par profil (`ludaskia_theme`), appliqués via
`<html data-theme>` ; un thème non débloqué retombe sur le défaut. Le même bloc offre
un réglage **« Réduire les animations »** (`ludaskia_anim`, classe `anim-reduced`), en
complément de `prefers-reduced-motion`.

## Easter eggs (#331) — DÉCOUPLÉS de l'apprentissage

**Mini easter eggs** : de petites surprises de l'accueil à découvrir, **délibérément
hors de l'économie de jeu**. Ce ne sont **pas** une mécanique de rétention : aucune
XP / étoile / graine, aucun compteur « X/Y », aucun FOMO, **rien ne se perd** si on ne
revient pas — la découverte EST la récompense. La persistance passe par une clé
**dédiée et disjointe** (`ludaskia_eggs`, cf. [Données & profils](donnees-et-profils.md)) :
les eggs ne polluent jamais l'XP ni les trophées. Logique pure dans `core/eggs.ts`,
rendu/déclencheurs dans `ui/eggs.ts` (cf. [`core/`](core.md) et [`ui/`](ui.md)).

Catalogue v1 = **4 eggs**, trois familles : **exploration** (déclenchés volontairement
par l'enfant — chatouiller la mascotte, un animal caché dans la bande forêt),
**ambient** (une luciole rare qui traverse parfois l'accueil) et **visible** (un
déclencheur OUVERT et assumé, offert à la vue plutôt que caché). Le seul egg `visible`
est la **« pluie de cookies »** (#336) : un emoji cookie DISCRET du **pied de page
global** (« Pas de cookies… sauf les bons ! »), un clin d'œil à dénicher plutôt qu'un
bouton-CTA, fait tomber une averse bornée de cookies qui se posent en bas et **y
restent** (ils ne s'effacent pas seuls) ; on les croque un à un (miettes projetées), et
l'averse se relance une fois tous croqués — un jouet, aucun score ni compteur. Son rendu vit dans le module **partagé** `ui/footer.ts` (app **et** vitrine,
sans dépendance stockage) ; côté app seulement, le 1er clic range le souvenir dans
l'album (`recordCookieEgg`, `ui/eggs.ts`), la vitrine n'a pas d'album. L'**album de
surprises** (modale, accès masqué tant que rien n'a été trouvé) n'affiche **que les
trouvailles** — jamais de liste des eggs non trouvés, de cases vides ni de compteur — et
chaque carte se rejoue au tap. L'apparition ambiante est coupée par l'aménagement
encadrant **« apparitions surprises »** et par le mouvement réduit (cf. Accessibilité
dans [`ui/`](ui.md)) ; la pluie de cookies, comme tous les eggs, **ne s'affiche jamais
pendant l'effort** (masquée par `body.session-active`, cf. [`ui/`](ui.md)).

## Règle des 60 %

**Règle des 60 %** : un bilan/leçon ne « compte » (temps, record, étoile,
objectif, trophée) que si ≥ 60 % des calculs ont une réponse. Le sprint compte
s'il va au bout des 5 minutes.

## Annonce des récompenses, par chemin (#659)

Une récompense déclenche une **modale + confettis** (jamais de confettis sans
explication) : `showLevelUp` (passage de niveau, avec ses déblocages) puis, à sa
fermeture, `showCelebration` (célébration générique) s'il reste autre chose à
montrer — chaînage tenu par la porte commune `announceRewards` (`ui/effects.ts`,
cf. [Rendu & interactions](ui.md)).

Deux chemins y mènent, avec un calcul et un libellé qui **diffèrent
volontairement** :

- **Leçon, bilan, sprint** (`core/lesson-run.ts:recordLessonRun`) calculent
  trophées + niveau **inline**, au même appel que l'enregistrement de l'essai.
  Un trophée s'y annonce « **Nouveau** trophée : … ».
- **Orthographe** (bilan, révision d'une liste déjà acquise, pause de séance) et
  **révision espacée** appellent le calcul **factorisé**
  `core/recompenses-fin.ts:recompensesFin(niveauAvant, celebBase?)` — mêmes
  ingrédients (`evaluateTrophies`, `recompensesEntre`), lus une fois l'essai déjà
  enregistré. Un trophée s'y annonce « Trophée : … » (sans « Nouveau »).

**Les deux libellés distincts sont un choix assumé, pas un oubli
d'harmonisation** (critère 9 de #659) : factoriser le calcul ne devait rien
changer au comportement déjà en place de la leçon/du bilan/du sprint, seul le
trou de la révision espacée étant à combler. Un test fige ce refus
(`tests/recompenses-fin.test.ts`) pour qu'un futur relecteur ne le reprenne pas
pour un oubli.

**Avant #659, la révision espacée faisait avancer XP, trophées et niveau sans
jamais rien annoncer** — le seul écran de fin de run à ne jamais appeler
`evaluateTrophies`. Un trophée gagné en révision n'était rattrapé que plus tard,
au retour à l'accueil (`ui/render.ts`, `evaluateTrophies()` « sans célébration
ici ») : la récompense existait bien, mais rien ne la reliait au moment où
l'enfant venait de la gagner. L'annonce ne tombe que sur l'**écran de fin** de la
session, jamais entre deux items : un franchissement de niveau, calculé en temps
réel sur l'XP, peut survenir dès le premier item d'une session multi-matières qui
en compte douze — l'annoncer en cours de route couperait le flux d'une séance qui
continue.

### Un trophée peut être ACQUIS sans avoir de moment (suite de #640)

`evaluateTrophies()` recalcule ses métriques **à chaque appel**, en relisant les
données sources — dont l'état d'orthographe, via `loadOrtho()`. Une métrique peut
donc sauter sans qu'aucun geste de l'enfant ne l'explique, si la lecture elle-même
change ce qu'elle rend : c'est le cas depuis la **réparation des escaliers troués**
(cf. [`design-orthographe.md`](../design-orthographe.md)), qui fait monter d'un coup
des mots hérités au rang « maîtrisé ».

Le danger n'est pas le trophée — il est mérité, l'enfant avait prouvé ces mots —
mais le **moment** : `evaluateTrophies()` est appelé à la fin de **n'importe quelle**
leçon (`core/lesson-run.ts`), où ses nouveaux trophées sont célébrés. Un enfant
pouvait donc voir « Nouveau trophée : Collectionneur de mots » à la fin d'un
exercice de multiplication, sans avoir touché à l'orthographe ce jour-là — et selon
la route prise, le saut était tantôt absorbé en silence (accueil), tantôt fêté hors
sujet.

D'où `absorberTropheesDeReparation()` (`core/profiles.ts`), appelé quand un profil
**devient actif**, à côté des migrations idempotentes : il consomme le saut sans
rien célébrer.

**Deux causes désormais, pas une seule (#660).** À la réparation des escaliers troués
d'avant #641 ci-dessus s'ajoute un second cas, arrivé avec les trophées « ce qui tient
dans le temps » (ci-dessus) : ces deux familles sont, elles aussi, recalculées à CHAQUE
`evaluateTrophies()`, donc un profil qui avait DÉJÀ des mots ou des notions au sommet de
l'escalier de révision **avant** la mise à jour les verrait sinon apparaître d'un coup à
la fin d'une leçon sans rapport. Le remède est le même rattrapage silencieux. Ce n'est
donc plus « **temporaire, le temps que les banques d'avant #641 s'éteignent** » à
proprement parler : la fonction reste nécessaire tant que l'une OU l'autre cause n'est
pas consommée par tous les profils existants — la supprimer suppose de vérifier les deux,
pas seulement la première. La règle générale qu'elle illustre, elle, reste : *une
métrique qui peut bouger sans geste de l'enfant doit être absorbée hors d'un écran de
fin*, sinon elle finira par être fêtée au mauvais moment.
