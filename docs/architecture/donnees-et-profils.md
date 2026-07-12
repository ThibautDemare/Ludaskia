[← Architecture Ludaskia](../ARCHITECTURE.md)

# Données & profils

## Données (`localStorage`)

Tout passe par `lsGet/lsSet`. Les clés sont **préfixées par le profil actif**
(`<uuid>/ludaskia_…`) sauf la méta globale `ludaskia_profiles`. Clés par profil :
`ludaskia_runs_{complet,express,sprint,revision-espacee}` (le dernier non classé,
décompte d'objectif seul ; clé réellement **namespacée par niveau** :
`ludaskia_runs_<mode>@<niveau>`, cf. [Niveaux scolaires](niveaux-scolaires.md)),
`ludaskia_streak`, `ludaskia_stars`,
`ludaskia_lessonStats`, `ludaskia_lessonFirstSeen` (date du 1er passage par
leçon, objectif « nouvelle leçon »), `ludaskia_paliers` (#397 : journal daté des
**premiers** franchissements de palier par notion — `PaliersNotion {enCours?, acquis?}`,
namespacée `lessonId@niveau` comme stats/étoiles, 2 horodatages max donc bornée par le
catalogue — écrit par `recordMonteesPalier` en fin de session, APRÈS l'étoile ; base de la
frise d'évolution de l'espace encadrant, cf. [Espace encadrant](espace-encadrant.md)),
`ludaskia_lessonRevision` (état SR par leçon),
`ludaskia_goal`, `ludaskia_goalsDone`, `ludaskia_trophies`, `ludaskia_xp`,
`ludaskia_bilans` (configs de bilans favoris), `ludaskia_resume` (exercices
grille **en cours**, repris ou abandonnés — #63), `ludaskia_activity` (#234 :
journal borné des sessions finalisées — base du graphe d'activité de l'espace
encadrant, plus complet que les `runs` car il couvre aussi les leçons jouées seules ;
**entrées typées** `{t: number; k: 'lecon' | 'bilan' | 'sprint' | 'revision' | 'dictee' | 'inconnu'}`
depuis #319, alimentées par `recordLessonStats` (leçons/bilans/sprints) et
`recordSessionActivity` (révision espacée, dictée d'orthographe) — **migration lazy**
depuis l'ancien `number[]` : un horodatage nu est lu en `'inconnu'` puis réécrit au
format objet au prochain passage, sans perte), `ludaskia_revoir`
(#234 : ids de leçons épinglées « à revoir » par l'encadrant → carte d'accueil de
l'enfant), `ludaskia_erreurs` (#391 : journal des erreurs commises — question posée,
réponse donnée, réponse attendue, leçon, mode, horodatage — plafonné aux 150 entrées
les plus récentes ; base du bloc « Ce qui a été difficile récemment » de l'espace
encadrant, voir `core/erreurs-journal.ts`), `ludaskia_aide_vue` (#272 : aides d'exercice déjà vues, une par type de
runner — voir `core/aide.ts`), `ludaskia_eggs` (#331 : ids des **easter eggs** trouvés,
album de l'accueil — clé **dédiée et disjointe** de l'XP et des trophées, les eggs étant
hors de l'économie de jeu, cf. `core/eggs.ts`), `ludaskia_tour_seen` et `ludaskia_parents_seen`
(#330 : deux drapeaux booléens **indépendants** du guide de première visite —
tour enfant vu/sauté, mot aux parents affiché ; voir `core/tour.ts` — l'enchaînement
automatique ne se déclenche qu'**une fois par profil**, le bouton « ? » rejoue le tour
sans les toucher). Un `LessonStat` porte aussi `recentPct?` (#234 : fenêtre glissante des
derniers % d'une leçon — base de la performance **récente**, distincte du cumul
historique de `lessonAvgPct`) et `lastAt?` (horodatage ms de la dernière session
travaillée, écrit par `recordLessonStats` — base du « dernière fois travaillée » et
de la tendance par notion de l'espace encadrant, cf.
[Espace encadrant](espace-encadrant.md)). **Clé GLOBALE** (non préfixée profil), comme
`ludaskia_profiles` : `ludaskia_encadrant_lock` (#234 : `{pinHash, recoveryHash}`
du verrou optionnel de l'espace encadrant — verrou de l'ESPACE, pas d'un profil,
donc non exporté et survit à la réinitialisation/suppression d'un profil).
L'état SR des **mots**
d'orthographe vit dans `ludaskia_ortho` (`MotOrtho.revision`). Un `MotOrtho`
porte aussi des **formes fléchies** optionnelles (`formes?: FormesAccord` — masc/fém
× sing/plur, #109), saisissables par le parent dans l'éditeur de listes et
exploitées par la leçon d'accords.
Les étoiles et stats sont désormais indexées par **id de leçon (chaîne)**.

## Profils

- Chaque profil a un **UUID stable** (id inter-appareils) et un **`updatedAt`**
  (ms) bumpé à chaque écriture via le hook `onDataWrite`.
- **Bascule** du profil actif = **liste déroulante de la barre d'outils**
  (`renderProfileMenu`) ; ses items basculent l'actif. Le menu propose aussi
  **« Mon espace »** (→ `#profils`) et **« Espace encadrants »** (→ `#encadrant`,
  gris + cadenas) — #234.
- **Écran enfant `#profils` = « Mon espace »** (#234) : l'enfant ne gère que **son**
  profil (avatar + prénom) + thème + « Mon confort ». **La gestion des AUTRES profils**
  (créer / renommer / avatar / réinitialiser / **supprimer**) **et l'export/import**
  vivent dans l'**espace encadrants** (un enfant ne touche pas aux profils des autres).
- **Export/import par profil** (`exportProfiles`/`importProfiles`, dans l'espace
  encadrants) : fusion par **UUID**, écrase un profil existant **seulement si la
  sauvegarde est plus récente** (`updatedAt`), ajoute si l'UUID est inconnu.
- **Réglages par UUID** (#234) : l'encadrant règle un profil CONSULTÉ via
  `setNiveauReferenceFor`/`setNiveauMatiereFor`/`setPrefFor` (jamais `m.active`).
- Pas de migration de données prévue (on part de profils vierges).
