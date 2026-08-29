[← Architecture Ludaskia](../ARCHITECTURE.md)

# Conventions rédactionnelles

## Voix des libellés (« tu » / « je », #278)

Parti pris de rédaction de l'interface, fondé sur **qui parle** (acté #278 ;
avis `redacteur-contenu-francais` + `pedagogue-primaire`). Quatre cas, à appliquer
dès la création d'un libellé :

- **(a) L'app parle À l'enfant → « tu »** (voix par défaut) : titres d'écran et de
  section, questions de réglage, consignes, encouragements, messages d'état.
  Ex. « Ta prochaine leçon », « Dans quelle matière ? », « Sur quoi veux-tu
  t'entraîner ? », « Tu as fait toutes les leçons proposées ici. ».
- **(b) Le libellé EST la voix de l'enfant → « je / mon / mes »** (conservé
  volontairement, **ne pas tutoyer**) : (1) **boutons d'action/de choix** que
  l'enfant « prononce » en cliquant (« J'ai compris », « Je choisis mes leçons »,
  « Non, je garde », « J'ai besoin d'un brouillon ») ; (2) **possessifs de
  collections** qui portent la fierté/appropriation (« Mes trophées »,
  « Mes objectifs », « Mes récompenses », « Mes listes »).
- **(c) La mascotte / l'app se décrit → « je »** (conservé) : la mascotte est le
  sujet du verbe. Ex. « Je me mets à jour… je reviens tout de suite ! »,
  « Un instant, je prépare tes mots… ». Les tutoyer serait un contresens.
- **(d) L'app parle à un ADULTE → « vous »** (#234) : **uniquement** dans l'**espace
  encadrant** (`ui/encadrant*.ts`, découpé #354), qui n'est pas destiné à l'enfant. Ex. « Entrez
  votre code à 4 chiffres », « Vous regardez les progrès de Léa », « Conservez bien
  cette clé ». Ce basculement « tu → vous » est, avec le retrait du vert de marque,
  le principal signal de rupture « on a quitté l'espace de l'enfant ». Le vouvoiement
  ne déborde **jamais** hors de cet espace — à une exception près, relevée en
  mesurant #586 : **« Un mot pour les parents »** (`ui/tour.ts`, #330), la fenêtre du
  premier lancement, est une **seconde surface adulte** et vouvoie donc elle aussi.
  C'est la seule ; elle est déclarée comme telle dans
  `tests/voix-libelles-gate.test.ts`, qui fait échouer `npm test` sur tout autre
  débordement.

Le défaut à corriger = un cas (a) **déguisé en (b)** : un titre/une question posés
par l'interface mais rédigés en « je ». Règle mnémotechnique : si on peut préfixer
par « [La mascotte te demande :] » → cas (a), « tu » ; par « [L'enfant clique et
pense :] » → cas (b), « je ». Ne **pas** réécrire les cas (b)/(c) en « tu » : on
perdrait la chaleur (possessifs froids, boutons agrammaticaux, mascotte absurde).

## Titres sémantiques & hiérarchie (#277)

Chaque **écran** (`.screen-only`) porte **son propre `<h1>`** identifiant la page :
soit la promotion du titre visuel `.big` en `<h1 class="big">` (le style reste sur
la classe, rendu inchangé), soit — quand l'écran n'a pas de titre texte (accueil) —
un `<h1 class="sr-only">` réservé au lecteur d'écran. Les écrans cachés étant en
`display:none` (retirés de l'arbre a11y), un seul `<h1>` est exposé à la fois.
Le **branding « Ludaskia »** de la barre n'est **plus un `<h1>`** mais un **lien
vers l'accueil** (`<a class="toolbar-brand">`) dans l'en-tête `<header class="toolbar">`
(landmark `banner`) ; son `aria-label` garde un nom accessible même quand le texte
est masqué (< 600 px). Les sous-titres de réglage (config sprint) sont des `<h2>`
portant l'`id` cible de l'`aria-labelledby` du `radiogroup` (un seul nœud). **Tout
nouvel écran doit suivre ce schéma** (un `<h1>` propre, jamais réintroduire un titre
global dans la barre).

## Énumérations elliptiques : toujours porter le sujet (#545)

Une énumération affichée dans l'espace encadrant, quand elle omet le sujet grammatical à
chaque terme pour ne pas l'alourdir (un dénombrement du type « 1 découvert et 1 réussi aux
tuiles »), doit porter ce sujet **au moins une fois**. Sans lui, l'antécédent est déjà loin dans
l'ordre de lecture au moment où l'oreille (lecteur d'écran) ou l'œil l'attend — surtout quand
d'autres éléments (badge d'état, bouton d'action) s'intercalent dans le DOM entre le sujet réel et
l'énumération. Cas corrigé (avis `redacteur-contenu-francais`) : « 1 découvert et 1 réussi aux
tuiles » → « 1 mot découvert et 1 réussi aux tuiles » (`motsColonne`, frise de composition des
listes de dictée, #545). Le mot-sujet se pose sur le **premier** terme seulement — le français
sous-entend le reste — jamais sur chacun (alourdit une ligne déjà dense) ni en `sr-only` (ne
règle rien : l'antécédent reste loin dans l'ordre de lecture, y compris pour un lecteur d'écran).

## Résumé d'un repli `<details>` : ne pas redire ce que le contenu annonce (#545)

Le texte visible d'un `<summary>` ne répète pas un compte ou une constante que le contenu déplié
annonce lui-même une fois ouvert — la valeur vit dans le code, pas dans deux endroits à tenir
synchrones. Convention observée deux fois : « Voir les mots » (le nombre de mots figure déjà dans
la méta juste au-dessus de la ligne, pas dans le résumé du repli) et « Voir les étapes semaine par
semaine » (`friseCompositionHTML`, #545) — pas « … des 12 dernières semaines » : la constante
(`SEMAINES_FRISE`) vit dans le code, et le récit l'annonce une fois le repli ouvert.

## « Récemment » pour la fraîcheur d'un état, jamais « tout juste » (#536)

Pour dater un changement d'état sans afficher de date (un cap franchi, une notion
maîtrisée), l'adverbe est **« récemment »** — déjà celui du bandeau de chiffres-clés
(« N maîtrisées récemment »). Pas **« tout juste »** : le mot a deux sens en français, l'un
temporel (« à l'instant ») et l'autre restrictif (« à peine, de justesse »), et ce second
sens se lit comme un jugement sur la solidité de l'acquisition — l'inverse de ce qu'une
mention de progrès veut dire. Cas posé par la mention de cap de « Travaillé récemment »
(`MOT_CAP`, `ui/encadrant-travail.ts`, cf. [Espace encadrant](espace-encadrant.md)).

## Franchir « en cours » se dit « passée en cours », jamais « commencée » (#536)

Sur une échelle qui compte un palier **« à renforcer » entre « à découvrir » et « en
cours »** (celle d'une leçon du catalogue), franchir « en cours » n'est pas un
commencement : la notion peut être travaillée depuis des semaines sans y être encore
entrée. « Commencée » ne redevient exact que sur une échelle à trois crans sans « à
renforcer » (celle d'une liste de dictée). Quand un même libellé doit valoir pour les deux
familles sans les distinguer (`MOT_CAP`), c'est donc le mot qui reste vrai des deux côtés
qu'il faut retenir : « passée en cours », déjà celui d'`EVENEMENT_CELLULE` pour ce même
fait.
## `meta description` : ne jamais finir sur la clause qui conditionne une promesse (#631)

Viser **~155 caractères** (au-delà, Google tronque l'affichage dans les résultats de
recherche) — mais la longueur n'est **pas** ce qui compte vraiment : la troncature se
mesure en pixels, pas en caractères, donc ce n'est pas mécanisable, d'où sa place ici
plutôt que dans un gate. La règle qui tient réellement : **ne jamais terminer la
description sur la clause qui conditionne une promesse**, parce que c'est
précisément ce qu'une troncature coupe en premier. Cas corrigé (#631) : la
description de `app.html` disait « … utilisable sans connexion une fois installée »
(196 caractères) ; tronquée, elle devenait « utilisable sans connexion », l'inverse
de la prudence que le projet tient partout ailleurs sur le hors-ligne (cf.
[Build & déploiement](build-et-deploiement.md)). Réécrite « Installable pour
travailler sans connexion » (153 caractères) : la condition est portée par
l'adjectif en tête, elle ne peut plus être amputée par une coupe en fin de phrase.

## Ligne d'aménagement lue par l'enfant : dire ce qui reste, pas seulement ce qui change (#630)

Quand un réglage posé par l'adulte **retire** quelque chose à l'enfant dans un contexte
précis (un mode, un écran), la ligne qui le lui annonce — lue par l'enfant, donc en
« tu » — ne s'arrête pas à l'exception : elle nomme aussi ce qui **reste** possible à sa
place, sans quoi le retrait se lit comme une privation sèche. Cas corrigé (avis
`redacteur-contenu-francais`, #630) : la ligne en lecture seule des préférences enfant
annonçait « Les consignes sont lues à voix haute automatiquement, sauf pendant les
sprints » — vrai, mais silencieux sur le fait que le bouton « Écouter » y reste
disponible, l'enfant déclenchant lui-même la lecture. Réécrite « … sauf pendant les
sprints, où le bouton « Écouter » reste disponible » (`ui/preferences.ts`). Ne
s'applique qu'aux lignes **lues par l'enfant** : le toggle de l'espace encadrant
(`ui/encadrant-reglages.ts`), lu par l'adulte, peut se contenter de nommer la portée du
réglage sans reformuler ce que l'enfant retrouve ailleurs.

## JSON-LD `FAQPage` : fusionner des paragraphes visibles ne doit perdre aucune clause (#631)

Quand la réponse à une question de FAQ fusionne plusieurs `<p>` de la page en un seul
`Answer.text`, vérifier qu'aucune clause ne disparaît dans la couture — un renvoi vers
une autre page, une condition, une exception. Le risque est concentré sur les liens
hypertextes : un `<a>` du HTML visible n'a pas d'équivalent naturel en JSON-LD, donc il
est tentant de le retirer avec son contenu plutôt que de le reformuler en texte. Cas
corrigé (#631) : la réponse « Ça marche sans connexion ? » de la vitrine avait perdu le
renvoi « le guide pour les parents explique comment, selon l'appareil » en retirant le
lien qui le portait. Pas mécanisable (cf. [Tests](tests.md), rejet écrit du gate
`seo-decouvrabilite` sur le contenu des réponses) : un rappel est posé en commentaire au
point d'édition réel, juste avant `<div class="v-faq-list">` dans `index.html` et
`guide.html`.
