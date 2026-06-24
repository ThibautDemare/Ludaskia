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
seulement s'il y a un record).

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

## Règle des 60 %

**Règle des 60 %** : un bilan/leçon ne « compte » (temps, record, étoile,
objectif, trophée) que si ≥ 60 % des calculs ont une réponse. Le sprint compte
s'il va au bout des 5 minutes.

## Récompense = modale + confettis

Une récompense déclenche une **modale + confettis** (jamais de confettis sans
explication).
