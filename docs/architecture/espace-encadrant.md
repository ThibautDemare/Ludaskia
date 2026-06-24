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

## « À revoir » → carte d'accueil

**« À revoir » → carte d'accueil** : l'encadrant **épingle** des leçons
(`toggleRevoirFor(uuid, …)` → `ludaskia_revoir` du profil). Au retour de l'enfant sur son
accueil, `ui/a-revoir-card.ts` affiche une carte (`#aRevoir`, modèle « leçon du jour ») qui
**boucle** sur la liste ; auto-nettoyage au rendu (`revoirActives` exclut une leçon redevenue
solide). L'enfant n'a pas à être présent quand l'encadrant épingle.

## Réglages déplacés hors de portée de l'enfant

**Réglages déplacés hors de portée de l'enfant** (par UUID consulté) : la **« Classe
scolaire »** (`setNiveauReferenceFor`/`setNiveauMatiereFor`) et les **« Aménagements »**
dys/attention — *masquer le minuteur* + *lecture auto des consignes* (`setPrefFor`, avis
`specialiste-troubles-apprentissage`). Le **« Mon confort »** (réduire les animations,
confort de lecture) reste côté enfant (auto-régulation immédiate, coût d'erreur nul) ;
un aménagement actif est rappelé en lecture seule sur « Mon espace » (« réglé par un
adulte »). L'écoute TTS **à la demande** reste toujours dispo côté enfant.

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
