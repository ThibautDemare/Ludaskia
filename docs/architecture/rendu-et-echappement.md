[← Architecture Ludaskia](../ARCHITECTURE.md)

# Rendu & échappement HTML (#614)

Tout le rendu de Ludaskia passe par `.innerHTML`. La question n'est donc pas
« faut-il échapper » mais **qui s'en souvient**. Avant #614, personne : une chaîne de
texte et un fragment de balisage étaient tous deux des `string`, et un `${}` oublié
passait la relecture sans que rien ne rougisse.

État des lieux au moment du changement (22/08/2026) : **169** affectations
`.innerHTML` dans `src/`, **90** avec un littéral gabarit sur **36** fichiers,
**354** appels `escapeHTML` dans 62 fichiers, **40** fonctions exportées `*HTML()`
toutes typées `string`. Aucune faille connue — l'objet du lot est d'**empêcher
l'oubli futur**, pas de réparer un existant fautif.

## Les trois pièces (`src/core/html.ts`)

| Pièce | Rôle |
| --- | --- |
| `SafeHtml` | Un **objet enveloppe** : `{ readonly balisage: string }`. Ce qui porte ce type a été construit ici. |
| `` html`…` `` | Le gabarit balisé. Échappe chaque interpolation **selon sa position d'insertion**, laisse passer les `SafeHtml`. |
| `brut(s)` | La porte de sortie, explicite et cherchable. Chaque appel dit **en commentaire** d'où vient la confiance. |

Compléments : `VIDE` (fragment vide), `joindre(fragments, sep?)` (équivalent typé de
`.join('')`), `attribut(nom, valeur)` et `drapeau(nom)` pour les fragments
d'attributs.

### Pourquoi un objet, et pas une chaîne marquée

`html` doit distinguer, **à l'exécution**, un fragment qu'il a produit (à laisser
passer) d'un texte (à échapper). Une chaîne primitive ne porte aucune marque :

- un registre de chaînes **fuirait** — rien ne permet de tenir faiblement une chaîne ;
- une chaîne **boxée** déguisée en `string` mentirait au typechecker : un fragment
  vide deviendrait truthy, `frag === 'x'` toujours faux, `typeof` vaudrait `'object'`.

L'objet enveloppe coûte un `.balisage` au point d'insertion. En échange, la règle
ESLint peut exiger cette forme, ce qui rend la provenance **vérifiable
mécaniquement** — plus fort que le contrôle « pas de littéral gabarit » initialement
envisagé.

**Le piège à connaître** : un fragment **vide** est un objet, donc *truthy*, là où la
chaîne vide qu'il remplace était *falsy*. `if (frag)`, `frag ? … : …` changent de sens
sans que rien ne le dise. Tester `frag.balisage`. Trois sites étaient concernés à la
conversion (`figureBlock`, `capterErreur`, le bandeau du sprint) ; le quatrième,
`ligneRevelation`, avait un test qui couvrait le cas vide — c'est lui qui a révélé la
classe entière.

### Échappement par contexte

`escapeHTML` couvre le contexte TEXTE. C'est insuffisant dans deux positions que ce
dépôt produit réellement :

- **valeur d'attribut NON QUOTÉE** (`<i class=${c}>`) : l'espace passe, donc une
  valeur peut ajouter un second attribut (`a onmouseover=…`) sans le moindre chevron.
  Le gabarit y neutralise `=`, le backquote, l'antislash et **tout ce que `\s` de
  JavaScript capture**, en référence numérique. Le sur-ensemble est délibéré : `\s`
  est plus large que l'espace blanc HTML (tabulation verticale, insécable,
  U+2028/2029, espace idéographique, BOM), les analyseurs ne s'accordent pas sur ces
  caractères, et les échapper ne coûte rien. Une première version tenait une **table**
  de sept caractères avec un repli `?? c` : la regex qui la pilotait capturant plus
  large, le repli laissait passer le reste **en silence**. C'est le balayage
  exhaustif qui l'a montré, pas la relecture ;
- **URL** (`href`, `src`, `formaction`, `xlink:href`…) : aucun échappement ne rend
  `javascript:alert(1)` inoffensif — le danger est le **schéma**. Une telle valeur est
  **refusée**, même déclarée par `brut()`.

Les positions que l'automate ne sait pas trancher sont refusées, pas devinées :
interpolation **entre deux attributs** (une chaîne y poserait des attributs
arbitraires — utiliser `drapeau()` / `attribut()`), dans un `<script>`/`<style>`, dans
un nom d'attribut ou un commentaire. Seule exception : la **chaîne vide**, qui ne peut
rien injecter où que ce soit.

## La règle ESLint

`ECHAPPEMENT_INNERHTML` (`eslint.config.js`) exige que toute affectation à
`.innerHTML` soit de la forme `X.balisage` — ou le littéral `''`, qui **vide**
l'élément sans rien y injecter. Sa **liste d'exemptions est vide** : la conversion a
été faite en un seul lot (décision de cadrage du 22/08/2026), contrairement au patron
incrémental de #580 et #511.

Elle ne couvre pas `insertAdjacentHTML`, `outerHTML` ni `document.write` : aucun n'est
utilisé dans `src/` aujourd'hui, et les interdire reviendrait à refuser des formes que
personne n'écrit.

## Limite assumée : le moteur de figures SVG

`src/core/figures/` compose du SVG à partir de `FigureSpec`, une donnée **fermée**
construite par l'application (nombres, énumérations, libellés de leçon) — jamais une
saisie d'enfant ni un contenu importé. Les rares figures qui interpolent du texte
libre (droite graduée, diagramme, tableau de données) l'échappent chez elles.

On marque donc sa SORTIE, plutôt que de convertir 3 000 lignes de composition.
Convertir le moteur serait une réécriture, pas un garde-fou, et le SVG a ses propres
contextes (`<text>`, `viewBox`, `d`) que le gabarit HTML ne modélise pas. Ce que le
marquage apporte quand même : tout ce qui **consomme** une figure (`Item.figure`,
`figureBlock`, les runners) est typé, donc plus personne ne peut y glisser une chaîne
quelconque.

**Attention, le moteur n'a pas un point d'entrée mais plusieurs.** `renderFigure`
couvre les figures décrites par un `FigureSpec`, mais deux runners appellent le moteur
en direct (`renderDroiteGraduee`, `renderDroiteGradueeInteractif`), et le moteur
exporte une vingtaine de `render*` en `string`. **Chaque appel doit donc être marqué
par `brut()` à l'appel.** Un seul oubli et la figure entière part en texte échappé : le
`brut()` manquant sur `renderDroiteGradueeInteractif` a fait que la leçon de droite
graduée ne se rendait plus du tout, avec `typecheck`, `lint` et les tests unitaires au
vert. C'est ce que garde la classe 4 de `tests/html-positions-gate.test.ts`.

**C'est un rejet écrit, pas un oubli** (règle #585) : inutile de le re-remonter en
relecture. Ce qui le ferait rouvrir : une figure qui accepterait un jour du texte
saisi par un enfant.

## Ce que le gabarit ne promet PAS (rejets écrits)

Remontés à la relecture de #614, écartés en connaissance de cause. Inutile de les
re-remonter : ce qui les rouvrirait est dit à chaque fois.

- **`attribut('onclick', v)` est accepté.** La fonction valide la *syntaxe* du nom
  d'attribut, pas sa nature : elle ne refuse pas les gestionnaires d'événements. La
  valeur est alors échappée pour le contexte ATTRIBUT, pas pour JavaScript, ce qui ne
  la rend pas sûre dans un `on*`. Écarté parce qu'aucun appel n'écrit de gestionnaire
  en HTML (tout passe par `addEventListener` et la délégation), et qu'une liste noire
  `on*` donnerait l'illusion d'une garantie qui reste fausse pour `style` ou pour un
  attribut inventé. Ce qui rouvrirait : un premier `on*` posé en balisage.
- **Le séparateur de `joindre` n'échappe pas.** C'est voulu, et c'est pour ça qu'il
  est typé `SafeHtml` depuis #614 : il *est* du balisage (`` html`<br>` ``), pas du
  texte. Avant, c'était une `string` insérée telle quelle, seule valeur non échappée
  de l'API publique.
- **Un nombre court-circuite l'échappement** (`rendre` le convertit sans passer par
  `echapper`). Éprouvé : `String(n)` ne produit jamais d'espace, de guillemet ni de
  chevron, bornes comprises. L'incohérence visible est ailleurs : `${42}` passe entre
  deux attributs là où `${'42'}` est refusé. Sans conséquence, et aligner les deux
  ferait échouer des gabarits corrects.
- **`</SCRIPT>` en majuscules ne referme pas le contexte `<script>`** pour
  l'automate : toutes les interpolations suivantes sont donc refusées. Direction sûre
  (on refuse trop, jamais trop peu), et le dépôt n'écrit pas de `<script>` dans un
  gabarit.

## Prettier

`embeddedLanguageFormatting` est **désactivé** (`.prettierrc.json`). Prettier
reconnaît les gabarits taggés `html` et reformate le balisage qu'ils contiennent :
il réindenterait les 90 sites d'appel et réécrirait les guillemets d'attributs, ce
qui change le rendu (espaces significatifs entre éléments en ligne).

## Écrire du rendu, en pratique

```ts
// Un écran
el.innerHTML = html`<p class="nom">${profil.name}</p>`.balisage;

// Une liste
const items = joindre(mots.map((m) => html`<li>${m}</li>`));

// Un attribut booléen, ou une classe conditionnelle
html`<button${actif ? drapeau('disabled') : ''} class="btn${actif ? ' on' : ''}">…</button>`;

// Un fragment de confiance (dire POURQUOI)
// SVG servi par le site lui-même, pas une donnée :
el.innerHTML = brut(svg).balisage;
```

Deux réflexes :

- une fonction qui **produit du balisage** renvoie `SafeHtml`, jamais `string` ;
- une valeur **destinée au stockage** reste du `string`. Le journal d'erreurs, les
  réponses, tout ce qu'un encadrant relit : de la donnée, pas du balisage.

### L'exception : l'instantané de reprise

Elle mérite d'être connue, parce qu'elle a coûté un écran. L'instantané de reprise
(#498) persiste les **questions du runner en cours**, et une question porte parfois sa
`figure`, donc un `SafeHtml`. Un aller-retour JSON en faisait un objet nu :
`instanceof SafeHtml` échouait, le gabarit refusait la valeur, et **reprendre une leçon
à figures plantait**. Le défaut ne se voyait ni au typage (le champ est `unknown[]`),
ni aux tests unitaires, ni au premier lancement — seulement à la reprise.

D'où `SafeHtml.toJSON()`, qui sérialise en `{ __html: "…" }`, et `revivreFragments()`,
appliqué **une seule fois** dans `restaurerRunner` plutôt que dans les dix
restaurateurs. Ce n'est pas une invitation à ranger du balisage dans de la donnée
métier : seul un instantané, qui rejoue un rendu, a une raison d'en porter.

## Les trois fautes que ni le type ni le linter ne voient

Elles ont toutes compilé, passé ESLint et passé les tests unitaires pendant la
conversion. Elles ne se voyaient qu'à l'écran, et c'est ce qui les rend dangereuses :

1. **Interpolation à une position refusée** (`<p ${' aria-current="page"'}>`). Le
   gabarit lève, donc l'écran entier ne se rend plus. Cinq sites ont ainsi cassé
   `renderEspace`, c'est-à-dire tout l'espace encadrant, et seule la suite Playwright
   complète les a montrés — une heure plus tard.
2. **Balisage écrit en chaîne** (`${cond ? '<span>…</span>' : ''}`). Le gabarit fait
   son travail, échappe, et l'enfant lit `<span>…` en clair.
3. **Fragment sorti de son gabarit** : interpolé dans un gabarit **non balisé**,
   concaténé au `+`, ou `.join('')` sur un tableau de fragments. `SafeHtml` n'ayant
   pas de `toString()`, ça rend `[object Object]`. `join` acceptant n'importe quel
   type d'élément, rien ne rougit : **111 sites** étaient concernés.

`tests/html-positions-gate.test.ts` les attrape toutes les trois, en ~2 s, au
`npm test`. Il construit un programme TypeScript sur `src/` et interroge le
**typechecker** — pas une heuristique de noms : une première version reconnaissait
les fabriques par leur nom (`html`, `attribut`, `brut`…) et criait sur **45 sites
sains**, faute de savoir que `ttsAttr(…)` ou `marqueCase(…)` rendent déjà un
fragment. Un gate qui se trompe trois fois sur quatre finit contourné.

Pour la classe 1, le gate rejoue `analyserPositions` — **la fonction du moteur**,
pas une copie, qui divergerait.

## Ce qui tient la règle

| Garde | Ce qu'il attrape |
| --- | --- |
| Le **type** | Une fonction de rendu qui renvoie du texte brut ; du texte passé à `wrapGrandsNombres` / `stackFractions`. |
| La **règle ESLint** | Une affectation `.innerHTML` dont la valeur n'est pas un fragment. |
| `tests/html-positions-gate.test.ts` | Les trois fautes ci-dessus, sur tout `src/`. |
| `tests/html-gabarit.test.ts` | Le contrat du gabarit, position par position. |
| `tests/html-injection-balayage.test.ts` | Les codes 1..255 (plus les espaces Unicode) sur les trois positions, **l'analyseur DOM pour arbitre** — c'est lui qui a trouvé le repli inopérant de l'attribut non quoté. Ses **contrôles négatifs** vérifient d'abord que l'oracle sait voir une injection : sans eux, le balayage passerait aussi bien si l'analyseur ne voyait rien. |
| `tests/echappement-chemins-sensibles.test.ts` | Les chemins nommés par #614 (nom de profil, valeur de tuile, libellés, `aria-label`) restent échappés. |
| `e2e/echappement-rendu.spec.ts` | Rien ne s'affiche **en clair** sur les quatre familles de rendu (double échappement, `[object Object]`). |
