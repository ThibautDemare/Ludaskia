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
