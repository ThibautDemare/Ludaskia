[← Architecture Ludaskia](../ARCHITECTURE.md)

# Liens partagés (`src/core/partage/`, #734)

Un adulte fige un exercice dans un **lien**, l'enfant le joue, puis renvoie un second
lien qui porte ses réponses. Tout voyage dans le **fragment `#`** de l'URL : rien ne
part vers un serveur, le fragment n'est jamais transmis à celui qui sert la page.
Deux routes : `#envoi/<code>` (l'enfant joue) et `#resultat/<code>` (l'encadrant lit).

Le format est de la **logique pure** (testable sans DOM) et ne porte aucun écran. Les
écrans de l'enfant (`#envoi/<code>`) sont décrits à « Côté enfant » ; ceux de
l'encadrant (composer un envoi, lire un résultat, l'ajouter à un suivi) à « Côté
encadrant ». Aujourd'hui, un envoi se compose pour les leçons jouées en fiche et les
bilans ; les leçons « une question à la fois » et les dictées n'ont pas encore leur écran.

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
| `composition.ts` | **Composer** un envoi (leçon ou bilan), niveau explicite, avec la garantie qu'il passe `preparerPassage`. Voir « Côté encadrant ». |
| `envois-crees.ts` | « Vos envois » : les codes des liens déjà créés, clé globale `ludaskia_envois`. |
| `import.ts` | **Ajouter** un résultat reçu au suivi d'un profil, par UUID. |

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

## Côté encadrant

Deux surfaces : l'onglet **Envois** de l'espace (composer, retrouver) et la vue
`#resultat/<code>` (lire, importer). Le code de lien, l'URL, la copie, l'annonce et les
causes de refus (`causeRefus`, communes aux deux côtés) vivent dans `ui/lien-partage.ts`.

**Composer (`core/partage/composition.ts`, `ui/encadrant-envois.ts`).**
- `composerLecon` (une fiche, dans un mode) et `composerBilan` (une série par leçon, sans
  mode : chaque format se replie en fiche). Le **niveau est toujours choisi** par l'adulte
  (le profil consulté ne fait que le présélectionner) ; aucune fonction du module ne lit le
  profil actif. Le tirage a lieu ici, une fois.
- **Garantie** : un envoi `ok` passe `preparerPassage` (la fonction même qui le prépare chez
  l'enfant, pas une seconde règle) **et** s'encode (`envoiEnJson`). Refus : `libelle`,
  `vide`, `trop-grand` (`MAX_BLOCS`, `MAX_ITEMS`), `format`.
- **Ce qu'on peut envoyer** : `modesEnvoyables(lesson, niveau)` ne garde que les modes qui
  se jouent en fiche (mémorisé), `niveauxEnvoyables` les niveaux où il en reste un.
- **Bilans** : `bilanCategorie` (express **sans pondération** par les statistiques, qui
  sont celles d'un profil, ou complet), `bilanFavori` (favori du profil consulté ; les
  leçons absentes au niveau choisi sont écartées et **comptées**, l'écran le dit) ;
  `niveauxFavori`, car un favori ne garde pas de niveau.
- **Libellé** : même liste blanche que le décodage (`libelleValide`), préremplie par
  `libelleParDefaut`. Un libellé écrit par l'adulte survit aux changements de choix.
- L'écran montre aussi ce que contiendra le **résultat** (critère 5), le lien, « Copier le
  lien » et « Partager » (partage natif si le navigateur en a un). L'état de vue vit en
  module ; le profil consulté changé invalide le favori retenu.

**Envois créés (`envois-crees.ts`).** On garde le **code** du lien (jamais de quoi le
refaire : un nouveau tirage serait un autre exercice), pour recopier un lien à
l'identique. Clé **globale** `ludaskia_envois`, comme le code d'accès : elle appartient à
l'adulte, pas à un profil, et la sauvegarde des profils ne la contient pas. `MAX_ENVOIS_GARDES`
(50) ; relue champ par champ, une entrée illisible est oubliée ; `garderEnvoiCree` relit
après écriture et rend `false` si le stockage refuse (l'écran dit alors que l'envoi n'est
pas gardé). Oublier un envoi n'invalide pas son lien.

**Vue d'un résultat (`ui/partage-resultat.ts`, route `#resultat/<code>`).**
- Lecture **sans code d'accès** : le lien est déjà la trace complète. Rien du profil actif
  (la barre d'outils masque XP et avatar), ni pourcentage ni note. Tout texte du résultat
  passe par `html` (échappé).
- **N'écrit rien** tant qu'on n'importe pas. `main.ts` n'affiche aucune modale d'accueil
  (classe, tour) par-dessus un lien partagé (`lireFragment`).
- `resultatCleanup` + jeton : un décodage arrivé après un changement d'écran est jeté ; un
  échec devient l'écran de refus, jamais un écran blanc.

**Import (`import.ts`).** Optionnel : l'encadrant choisit le profil, aucun identifiant
d'enfant ne voyage ; `profilCorrespondant` (nom = pseudo, casse/accents/espaces près,
jamais partiel) ne fait que **cocher d'avance**.
- Ce qui entre dans le profil, et rien d'autre : les erreurs du résultat (`faux` et `jnsp`,
  datées du passage, insérées **en tête** du journal), une entrée d'activité `partage`, et
  l'id du résultat dans `ludaskia_resultatsImportes` (par profil, `MAX_IMPORTS_RETENUS` =
  500). Ni XP, ni étoile, ni record, ni statistique, ni série, ni objectif, ni trophée.
- Tout s'écrit **par UUID**, sans changer le profil actif : `journaliserErreursFor`,
  `recordActivitePartageFor`, `touchProfile`.
- **Refus** : `deja` (id déjà importé, **ou** `passageJoueIci` : ce profil a joué ce
  passage lui-même, ses erreurs sont déjà au journal), `profil` (UUID inconnu), `stockage`.
- **Un import à moitié écrit est défait** : le journal, l'activité et les ids sont
  photographiés avant, restaurés si une écriture est refusée (sinon le nouvel essai
  doublerait les erreurs). `lsSetRaw` taisant le refus, l'écriture est vérifiée par relecture.
- **Code d'accès** : l'import passe derrière celui de l'espace (`accesVerrouille` /
  `marquerDeverrouille` d'`encadrant-pin.ts`, partagés : un déverrouillage vaut pour les
  deux). Le profil n'est écrit qu'à la **confirmation**.
- `creerProfilImporte` : `addProfile(nom, emoji, { activer: false })`, donc le profil actif
  ne bouge ; classe confirmée par l'adulte (préremplie par l'envoi). Si l'import échoue, le
  profil créé est **retiré** (`deleteProfile`).
- « Voir le suivi » ouvre l'espace sur ce profil : `consulterALaProchaineEntree` (lu une
  fois, puis oublié, `prendreProfilAConsulter`).

## Décisions

Écrites une fois, pour que le prochain relecteur ne les remonte pas de nouveau. Les
points 1 à 10 concernent le côté enfant, 11 à 15 le côté encadrant.

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
11. **Le sondage `modesEnvoyables` tire trois exercices par mode et avale une exception de
    fabrique** : la garantie vient de `composerLecon`, qui vérifie chaque exercice tiré ;
    un générateur cassé est attrapé par ses propres tests, pas ici.
12. **Pas de test unitaire de `causeRefus`** : textes constants ; les refus des deux côtés
    sont joués en e2e.
13. **`encadrant-envois.ts` n'est pas découpé** (environ 750 lignes) : à découper si les
    PR 4 et 5 le font grossir.
14. **À 320 px de large, « Programme » se coupe sur deux lignes** dans la barre d'onglets :
    repli voulu (zoom 200 %), largeur rare.
15. **Le titre visible de l'espace est « Espace encadrants »** (pluriel) : les textes qui le
    nomment suivent ce titre.

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
| `tests/partage-composition.test.ts` | Un envoi composé qui ne passerait pas `preparerPassage`, un niveau pris ailleurs que dans le choix, un libellé hors liste blanche. |
| `tests/partage-envois-crees.test.ts` | La liste « Vos envois » : plafond, entrées corrompues, refus du stockage. |
| `tests/partage-import.test.ts` | L'import : ce qui entre dans le profil et rien d'autre, doublon, import à moitié écrit défait, profil correspondant. |
| `e2e/partage-encadrant.spec.ts` | Le parcours encadrant : composer, retrouver un envoi, lire un résultat, l'importer, et la chaîne complète (créer, jouer, lire). |
| `e2e/csp.spec.ts` | La CSP qui n'est pas appliquée pour de bon (dev **et** build). |
