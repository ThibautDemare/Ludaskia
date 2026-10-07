[← Architecture Ludaskia](../ARCHITECTURE.md)

# Liens partagés (`src/core/partage/`, #734)

Un adulte fige un exercice dans un **lien**, l'enfant le joue, puis renvoie un second
lien qui porte ses réponses. Tout voyage dans le **fragment `#`** de l'URL : rien ne
part vers un serveur, le fragment n'est jamais transmis à celui qui sert la page.
Deux routes : `#envoi/<code>` (l'enfant joue) et `#resultat/<code>` (l'encadrant lit).

Le module est de la **logique pure** (testable sans DOM). Il ne porte aucun écran :
les routes et les vues se branchent dessus sans que le format change.

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
| `e2e/csp.spec.ts` | La CSP qui n'est pas appliquée pour de bon (dev **et** build). |
