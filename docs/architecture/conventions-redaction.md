[← Architecture Ludaskia](../ARCHITECTURE.md)

# Conventions rédactionnelles

## Voix des libellés (« tu » / « je », #278)

Parti pris de rédaction de l'interface, fondé sur **qui parle** (acté #278 ;
avis `redacteur-contenu-francais` + `pedagogue-primaire`). Quatre cas, à appliquer
dès la création d'un libellé :

- **(a) L'app parle À l'enfant → « tu »** (voix par défaut) : titres d'écran et de
  section, questions de réglage, consignes, encouragements, messages d'état.
  Ex. « Ta prochaine leçon », « Dans quelle matière ? », « Sur quoi veux-tu
  t'entraîner ? », « Bravo ! Tu as fait le tour… ».
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
  encadrant** (`ui/encadrant.ts`), qui n'est pas destiné à l'enfant. Ex. « Entrez
  votre code à 4 chiffres », « Vous regardez les progrès de Léa », « Conservez bien
  cette clé ». Ce basculement « tu → vous » est, avec le retrait du vert de marque,
  le principal signal de rupture « on a quitté l'espace de l'enfant ». Le vouvoiement
  ne déborde **jamais** hors de cet espace.

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
