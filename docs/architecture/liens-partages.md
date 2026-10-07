[← Architecture Ludaskia](../ARCHITECTURE.md)

# Liens partagés (`src/core/partage/`, #734)

Un adulte fige un exercice dans un **lien**, l'enfant le joue, puis renvoie un second
lien qui porte ses réponses. Tout voyage dans le **fragment `#`** de l'URL : rien ne
part vers un serveur, le fragment n'est jamais transmis à celui qui sert la page.
Deux routes : `#envoi/<code>` (l'enfant joue) et `#resultat/<code>` (l'encadrant lit).

Le format est de la **logique pure** (testable sans DOM) et ne porte aucun écran. Les
écrans de l'enfant (`#envoi/<code>`) existent, voir « Côté enfant » ; ceux de
l'encadrant (composer un envoi, lire un résultat) restent à venir : tant qu'aucun écran
ne compose un envoi, un lien ne peut s'obtenir qu'en le fabriquant à la main.

## Principe : un lien est une donnée hostile

N'importe qui peut fabriquer un lien, et ce qu'il contient finit affiché. D'où trois
invariants, qui structurent tout le module :

1. **Jamais de balisage dans un lien.** Une figure SVG ou la vue riche d'un choix de
   QCM ne voyage pas en HTML : elle voyage en **recette** (une `FigureSpec`, un
   numérateur et un dénominateur…), validée à l'arrivée, puis **redessinée par
   l'application**. Le balisage affiché chez l'enfant est toujours celui que les
   fabriques produisent.
2. **Reconstruction champ par champ.** Chaque valeur décodée est rebâtie à partir de
   schémas ; on ne fusionne jamais l'objet reçu, une clé inconnue fait **refuser** le
   lien (ce qui ferme `__proto__` et tout champ « en plus »), les nombres sont finis
   et **bornés**.
3. **Un refus est une valeur, pas une exception.** Aucune fonction de décodage ne
   lève : l'écran traduit une `RaisonRefus` en message clair. Une exception non
   rattrapée serait un écran blanc chez l'enfant.

Les items sont **tirés une fois**, à la création, et voyagent tels quels (ni graine ni
identifiant de banque) : modifier un générateur ou enrichir une banque ne change pas
ce qu'un lien déjà émis affiche. Un envoi n'a ni date limite ni compteur.

## Les fichiers

| Fichier | Rôle |
| --- | --- |
| `codec.ts` | Octets, compression, contrôle : `encoder` / `decoder`, `VERSION_FORMAT`, plafonds. Ne connaît que des octets et du JSON. |
| `schema.ts` | Combinateurs de schémas **bidirectionnels** (`lire` d'un JSON hostile, `ecrire` d'une valeur de confiance), `RefusSchema`. |
| `textes.ts` | Listes blanches : libellé, pseudo, mot de dictée (strictes), `texteFigure` pour les textes de figure, `borner`. |
| `exercices.ts` | Un schéma par format d'`Exercise`, table typée sur `Exercise['type']`. |
| `figures.ts` | Un schéma par `FigureSpec`, table typée sur `FigureSpec['kind']`, paramètres bornés. |
| `fragments.ts` | Recette ↔ fragment : `recetteDe` à l'émission, redessin par les fabriques à la réception. |
| `envoi.ts` | L'`Envoi` (leçon, bilan ou dictée), ses blocs, `encoderEnvoi` / `decoderEnvoi`. |
| `resultat.ts` | Le `Resultat` renvoyé : pseudo, date, une `ReponseItem` par item, statut `juste` / `faux` / `jnsp` / `vide`. |
| `capture.ts` | Capture item par item pendant le passage ; la **première** réponse notée fait foi, un item jamais noté ressort `vide`. |
| `liens.ts` | `fragmentLien`, `lireFragment`, `nouvelIdentifiant` (72 bits aléatoires, ne dérive de rien). |
| `tirage.ts` | `tirerExercices` : tirage d'exercices **distincts** d'une leçon, au niveau et dans le mode donnés. |
| `passage.ts` | Le **passage** de l'enfant : envoi → items de fiche, statut par item, seuil, premier passage gardé. Voir « Côté enfant ». |

Hors du dossier : `core/recette-fragment.ts` (le registre, voir plus bas),
`core/surlignage.ts` (`surligner`) et `core/aides-figure.ts` (`aideFigure`), fabriques
nées de ce lot.

## Format binaire (`codec.ts`)

Avant l'encodage base64url (sans `=`) :

| Octets | Contenu |
| --- | --- |
| `[0]` | version du format (`VERSION_FORMAT`) |
| `[1]` | type : `0x45` « E » envoi, `0x52` « R » résultat |
| `[2..5]` | CRC-32 (gros-boutiste) du JSON UTF-8 **non compressé** |
| `[6..]` | JSON compressé en `deflate-raw` (`CompressionStream`) |

Le décodage refuse **au plus tôt**, du moins coûteux au plus coûteux : longueur du code
(`TAILLE_MAX_CODE`), alphabet base64url strict, en-tête (version, type), décompression
**plafonnée en flux** (`TAILLE_MAX_JSON`, une bombe s'arrête au plafond), CRC, UTF-8
strict, JSON, puis schéma. Raisons : `navigateur`, `illisible`, `version`, `type`,
`taille`, `controle`, `schema`. `navigateur` est distinct de « lien altéré » : sur un
appareil sans `deflate-raw`, le lien est peut-être bon.

La compression rend le texte illisible à l'œil. C'est de l'**obfuscation**, pas un
secret : un adulte qui lit le code source décode tout.

### Changer le format

- Tout changement de **disposition** ou de **sens d'un champ** exige d'incrémenter
  `VERSION_FORMAT` : les liens déjà émis sont alors **refusés explicitement**, pas
  interprétés de travers.
- **On ne régénère JAMAIS un code de `tests/partage-references.test.ts` pour faire
  passer le test.** Ces codes commités sont des liens déjà dans une messagerie : un
  rouge veut dire qu'ils ne se décodent plus à l'identique. La réponse est une
  nouvelle version, jamais un nouveau code qui masquerait la rupture.

## Recettes et fabriques de fragments

`core/recette-fragment.ts` tient une `WeakMap` fragment → recette, alimentée par les
**fabriques elles-mêmes** : `renderFigure`, `fractionInlineHTML`, `surligner`,
`aideFigure` et `suite` (qui met des fragments bout à bout et n'a de recette que si
chacune de ses parties en a une). Pourquoi pas un champ sur `SafeHtml` : un fragment
assemblé à la main (`html\`${a}${b}\``) perd sa recette, et la `WeakMap` laisse cette
absence **visible** (`recetteDe` rend `undefined`). L'encodage d'un envoi **échoue
alors bruyamment** plutôt que d'émettre un lien amputé.

Règle pour qui écrit un générateur : toute `figure`, tout `choicesView[].html`
passe par une de ces fabriques (cf. la checklist de
[Contenu & leçons](contenu-et-lecons.md)). Un producteur qui assemble son balisage à la
main fait rougir `tests/partage-gate.test.ts`.

Les recettes sont bornées : `suite` s'imbrique sur trois niveaux au plus, un
surlignage tient en vingt morceaux, une fraction en entiers bornés.

## Ajouter un format ou une figure

- Un nouveau `type` de l'union `Exercise` ou un nouveau `kind` de `FigureSpec` doit
  déclarer son schéma dans `exercices.ts` / `figures.ts`, sinon `npm run typecheck`
  échoue (les tables sont typées sur les unions) **et** `npm test` aussi
  (`partage-gate` relit les unions dans le source).
- `objet` exige un schéma pour **chaque champ** d'un format : un champ ajouté à un
  format existant casse le typecheck au lieu de disparaître du lien.
- Un champ **facultatif** se déclare avec `facultatif(…)`, et le typage refuse
  `facultatif` sur un champ obligatoire.
- Les invariants entre champs (`verifier`) sont ceux que les runners **supposent** (un
  index de mot qui tombe dans la phrase, une réponse parmi les choix) : faux, ils
  lèveraient chez l'enfant au lieu d'un refus propre.
- `ecrire` est aussi **strict** que `lire` : une valeur hors schéma fait échouer
  l'encodage chez l'émetteur, qui peut encore corriger, plutôt qu'un « lien altéré »
  chez le destinataire.

## Le résultat

Il ne contient **aucune donnée de profil** autre que le pseudo saisi : ni UUID, ni
historique, ni niveau du profil. Son identifiant est aléatoire et propre à ce résultat
(il sert au dédoublonnage d'un import). Tout y est du **texte déjà lisible** (énoncé,
saisie, attendu) : la vue de lecture l'affiche échappé, sans rien rejouer. Le texte
saisi par l'enfant est ramené aux bornes du champ par `borner` (contrôles retirés,
troncature en « … ») pour que son lien s'encode quoi qu'il ait collé.

## Côté enfant (`#envoi/<code>`)

**Route.** `route()` lit le fragment (`lireFragment`) ; `showEnvoiView` (`ui/navigation.ts`)
remet l'écran à zéro, masque le pied de page et délègue à `afficherEnvoi`
(`ui/partage-seance.ts`). Le décodage est asynchrone : un **jeton** jette un résultat
arrivé après que l'enfant a changé d'écran, et `partageCleanup` (appelé à chaque
changement d'écran) oublie la séance. Aucune exception ne finit en écran blanc : tout
échec de décodage, de préparation ou de rendu devient l'écran de refus.

**`passage.ts` (logique, sans DOM).**
- `preparerPassage(envoi)` : un bloc par leçon, un item par exercice, via
  `itemDepuisExercice` (la fabrique du bilan ordinaire). Titre, consigne et items sont
  au niveau de l'**envoi**, jamais celui du profil actif. N'écrit rien : préparer puis
  abandonner ne consomme pas le premier passage. Refus : `lecon` (leçon absente de ce
  catalogue), `format` (une dictée ; pour une leçon, un exercice dont le mode se joue
  dans un runner dédié, table `JEU_PAR_TYPE` / `seJoueEnRunner`). Un **bilan** replie
  tout format en fiche, comme le bilan ordinaire.
- Chaque item porte une capture (énoncé et attendu **lisibles hors de l'appli**, même
  forme que le journal d'erreurs).
- `statutItem` : un statut par item (`juste`, `faux`, `jnsp`, `vide`) ; « je ne sais pas »
  l'emporte ; une opération posée n'est juste que si tous ses chiffres le sont.
- `passageTermine` : au moins `SEUIL_REPONDUS` (60 %) d'items non `vide`.
- `terminerPremierPassage` fige le **premier** passage terminé d'un envoi, par profil,
  sous `ludaskia_partagesRecus` (relue champ par champ via `schemaResultatGarde`, dans une
  `Map` qui ferme `__proto__`). Un second appel rend le premier résultat, sans rien
  recréditer. Il crédite `XP_PARTICIPATION` (5 XP, quel que soit le score) et une entrée
  d'activité `partage` **seulement si le passage a pu être gardé** (écriture refusée par
  le quota : sinon les +5 XP reviendraient à chaque réouverture). Rien d'autre ne bouge :
  ni étoile, ni record, ni statistique de leçon, ni série, ni objectif, ni trophée, ni
  révision.
- `MAX_PASSAGES_GARDES` (30) : au-delà, le passage le plus **ancien par date** est
  oublié ; son lien rouvert redevient un premier passage, **+5 XP compris**. Un passage
  garde tous ses énoncés (un bilan complet pèse plusieurs dizaines de Ko) dans un
  `localStorage` d'environ 5 Mo partagé avec le reste du profil.
- `changerPseudo`, `pseudoValide` (la même liste blanche que le décodage),
  `pseudoParDefaut` (le prénom du profil s'il passe la liste blanche, sinon rien).

**Écrans (`ui/partage-seance.ts`).**
1. **Refus** : titre « Ce lien ne marche pas », la cause (`RaisonRefus` ou
   `RaisonInjouable`) **repliée** sous « Pour l'adulte » : l'enfant n'y peut rien,
   l'adulte doit pouvoir diagnostiquer.
2. **Accueil** : libellé de l'envoi, rappel que l'envoyeur verra les réponses, bouton
   unique « Commencer ». **Déjà fait** : si un premier passage existe, « Recopier mon
   résultat » (même résultat, aucun recrédit) ou « M'entraîner ».
3. **Séance** : repère « Exercice envoyé » (« Entraînement : rien n'est envoyé » en
   rejeu), une fiche par leçon, **pas de chrono**, une case « Je ne sais pas » par
   question, un bouton « J'ai fini ». La correction passe par les mêmes fonctions que la
   fiche ordinaire (`lireSaisies`, `scoreItems`, `marquerChamps`). Le mode de session est
   **`MODE_PARTAGE`** (`'partage'`) : il masque le pied de page et gouverne Entrée.
4. **Fin** : le lien de résultat (pseudo prérempli, lien refait à chaque frappe, copie ou
   partage natif si le navigateur en a un) **remplace** la fiche ; la correction se
   déplie à la demande (« Voir ma correction »). Le résultat est **figé avant** que la
   correction soit posée.
5. **Entraînement** : même séance, sans fige, sans lien, sans XP ni activité.

**Brancher le reste de l'appli.** Type d'activité `partage` (`progress.ts`,
`recordActivitePartage`) : contrairement aux autres sessions il **ne pose pas la borne
des paliers** (`marquerDebutSuivi`), puisqu'il n'écrit aucune statistique de leçon dont
elle daterait le suivi. Il a son segment dans le graphe d'activité de l'encadrant
(`--cat-partage`, ambre). Les erreurs sont journalisées avec le mode `MODE_PARTAGE`,
que le journal encadrant affiche « séance partagée ». Quitter une séance **en cours**
demande confirmation (`partageEnCours`, `main.ts` `quittingLosesProgress`, comme le
sprint) : rien n'est repris.

### Décisions

Écrites une fois, pour que le prochain relecteur ne les remonte pas de nouveau.

1. **« Je ne sais pas » COMPTE comme répondu pour le seuil de 60 %** (avis
   `specialiste-troubles-apprentissage`) : c'est l'information la plus utile à l'adulte,
   et l'enfant honnête ne doit pas rester bloqué. Écart assumé avec la fiche ordinaire,
   qui ne connaît pas « je ne sais pas ». Conséquence : tout cocher termine le passage et
   donne les +5 XP.
2. **Sous le seuil, « J'ai fini » ne fige rien** et mène à la première question sans
   réponse : un passage terminé est un passage au seuil, et aucune correction n'est
   posée avant que le résultat soit figé.
3. **Entrée sur le dernier champ ne termine PAS la séance** (`verify`, `ui/session.ts`,
   donne le focus au bouton) : terminer fige le premier passage, ce qu'aucune touche ne
   doit faire par mégarde.
4. **Un QCM se joue en boutons radio DANS une fiche**, réservé à la séance partagée. Le
   bilan ordinaire n'a aucun champ pour un item QCM (limite préexistante de
   `renderItem` : 39 couples leçon × niveau ont un QCM pour mode par défaut). Le corriger
   dans le bilan ordinaire changerait le jeu libre, d'où l'exception.
5. **L'entraînement journalise les erreurs** (règle #391 : tout chemin qui corrige
   journalise), mais ne rapporte ni XP ni résultat.
6. **Pas d'annonce de passage de niveau** si les +5 XP en franchissent un : aucune modale
   pendant la séance. Le niveau, dérivé de l'XP, est simplement à jour.
7. **Le journal d'erreurs (150 entrées) peut saturer** si un grand bilan est passé en
   « je ne sais pas ». Assumé : même comportement qu'un bilan complet ordinaire.
8. **Pas de bouton « Écouter » par question de QCM** : parité avec la fiche ordinaire,
   où seule la consigne en a un.
9. **Deux vocabulaires, par choix** : l'enfant lit « Exercice envoyé », l'adulte
   « séance partagée » (journal et graphe de l'encadrant).
10. **Consigne d'un bloc de bilan dont la leçon se joue normalement dans un runner**
    (ex. « clique sur le mot ») : la consigne du type (« Clique sur… ») précède des
    items repliés en texte (« Recopie… »). Écart **préexistant**, identique dans le bilan
    complet ordinaire ; non corrigé ici.

## Les gardes

Voir [Tests](tests.md) (« Séance partagée par lien ») et
[Rendu & échappement](rendu-et-echappement.md) (CSP, règle ESLint, limite du moteur de
figures).

| Garde | Ce qu'il attrape |
| --- | --- |
| Le **type** des tables | Un format ou une figure sans schéma, un champ non déclaré. |
| `tests/partage-gate.test.ts` | Clés des tables différentes de celles des unions ; aller-retour de **tout le catalogue** (leçon × niveau × mode × trois tirages), dictées prédéfinies et bilan compris. |
| `tests/partage-references.test.ts` | Un lien de référence commité qui ne décode plus à l'identique. |
| `tests/partage-tirage.test.ts` | Un tirage qui ignore le niveau ou le mode demandés, sert deux fois la même question, ou boucle sur une leçon à peu de variantes. |
| `tests/recette-balisage.test.ts` | Un producteur migré vers une fabrique à recette dont le balisage ne serait plus identique, au caractère près, à celui d'avant. |
| `tests/securite-liens-gate.test.ts` | La règle ESLint qui ne voit plus `outerHTML` / `insertAdjacentHTML`, une CSP absente ou affaiblie. |
| `tests/partage-passage.test.ts` | La préparation d'un envoi, les statuts, le seuil, le premier passage figé (XP, plafond, stockage corrompu). |
| `e2e/partage-seance.spec.ts` | Le parcours enfant de bout en bout, sur de vrais liens fabriqués par `e2e/partage-fixtures.ts`. |
| `e2e/csp.spec.ts` | La CSP qui n'est pas appliquée pour de bon (dev **et** build). |
