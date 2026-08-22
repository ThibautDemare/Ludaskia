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
  Le gabarit y neutralise aussi l'espace, la tabulation, `=` et le backquote ;
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

On marque donc la sortie de son **point d'entrée unique** (`renderFigure`), une fois,
plutôt que de convertir 3 000 lignes de composition. Convertir le moteur serait une
réécriture, pas un garde-fou, et le SVG a ses propres contextes (`<text>`, `viewBox`,
`d`) que le gabarit HTML ne modélise pas. Ce que le marquage apporte quand même : tout
ce qui **consomme** une figure (`Item.figure`, `figureBlock`, les runners) est typé,
donc plus personne ne peut y glisser une chaîne quelconque.

**C'est un rejet écrit, pas un oubli** (règle #585) : inutile de le re-remonter en
relecture. Ce qui le ferait rouvrir : une figure qui accepterait un jour du texte
saisi par un enfant.

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
- une valeur **destinée au stockage** (journal d'erreurs, instantané de reprise) reste
  du `string` : un `SafeHtml` y serait sérialisé `{"balisage":"…"}`.

## Ce qui tient la règle

| Garde | Ce qu'il attrape |
| --- | --- |
| Le **type** | Une fonction de rendu qui renvoie du texte brut ; du texte passé à `wrapGrandsNombres` / `stackFractions`. |
| La **règle ESLint** | Une affectation `.innerHTML` dont la valeur n'est pas un fragment. |
| `tests/html-gabarit.test.ts` | Le contrat du gabarit, position par position. |
| `tests/echappement-chemins-sensibles.test.ts` | Les chemins nommés par #614 (nom de profil, valeur de tuile, libellés, `aria-label`) restent échappés. |
| `e2e/echappement-rendu.spec.ts` | Rien ne s'affiche **en clair** sur les quatre familles de rendu (double échappement, `[object Object]`). |
