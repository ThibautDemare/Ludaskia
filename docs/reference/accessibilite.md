# Cache de référence — Accessibilité (WCAG 2.2 AA)

**Version de WCAG visée :** 2.2 (Recommandation W3C du 5 octobre 2023)
**Sources normatives :** [WCAG 2.2](https://www.w3.org/TR/WCAG22/) · [Understanding WCAG 2.2](https://www.w3.org/WAI/WCAG22/Understanding/) · [WAI Techniques](https://www.w3.org/WAI/WCAG22/Techniques/)
**Équivalence française :** [RGAA 4.1.2](https://accessibilite.numerique.gouv.fr/doc/RGAA-v4.1.2.pdf) (basé sur WCAG 2.1 AA — critères WCAG 2.2 non encore intégrés au RGAA)
**Date de récupération :** 2026-06-25
**Nature du document :** extrait ciblé sur les besoins de Ludaskia (contraste, cibles tactiles, ARIA/SVG, navigation clavier, TTS) — se référer aux sources pour le détail normatif complet.

---

## Convention : source locale d'abord

Avant de fetcher w3.org, consulter ce fichier. Compléter en ligne uniquement si un critère n'est pas couvert ici.

Pour **mesurer un contraste** (plutôt qu'un outil web), utiliser l'outil local :
`node tools/contrast/contrast.mjs "#1a2b3c" "#ffffff"` — il rend le ratio + le verdict AA/AAA (texte, grand texte, non-texte).

Et pour ne pas dépendre du fait qu'on ait *pensé* à le lancer : les couples de tokens
constatés dans les feuilles sont vérifiés **sur les six thèmes** par
`tests/contraste-tokens.test.ts` (#582), qui partage sa formule avec cet outil. Une nouvelle
couleur de token qui casse un couple existant fait échouer `npm test` ; un nouveau couple,
lui, n'est gardé que s'il est **ajouté à la table** du test.

---

## 1. Contraste — texte (SC 1.4.3, niveau AA)

| Catégorie | Ratio minimum |
|-----------|--------------|
| Texte normal (< 18 pt ou < 14 pt gras) | **4,5:1** |
| Grand texte (≥ 18 pt ou ≥ 14 pt gras) | **3:1** |

**Définition du « grand texte »** : au moins 18 pt (≈ 24 px CSS) sans gras, ou au moins 14 pt (≈ 18,5 px CSS) en gras. Conversion : 1 pt ≈ 1,333 px CSS.

**Exceptions** (pas de seuil) :
- texte faisant partie d'un logo ou d'une marque ;
- texte purement décoratif (aucune information transmise) ;
- texte incrusté dans une image contenant d'autres éléments visuels significatifs.

**RGAA correspondant :** thème 3 « Couleurs » (critères 3.2 et 3.3 pour le contraste texte).

---

## 2. Contraste — composants non textuels (SC 1.4.11, niveau AA)

Ratio minimum **3:1** entre l'élément et les couleurs adjacentes pour :

- **Composants d'interface** : bordures de champs, états des boutons, cases à cocher, icônes interactives — tout ce qui permet d'identifier un contrôle et son état.
- **Objets graphiques porteurs d'information** : parties d'icônes, lignes de courbes, symboles visuels indispensables à la compréhension (ex. : angles droits, marques d'égalité sur des figures géométriques).

**Exceptions** :
- composants désactivés (`disabled`) ;
- présentation essentielle (logos, drapeaux, photos) ;
- contenu purement décoratif.

> Note pratique Ludaskia : les arêtes des solides géométriques et les marques d'angle/égalité sur les figures SVG sont des **objets graphiques porteurs d'information** → ratio 3:1 requis contre l'arrière-plan.

---

## 3. Information par la couleur (SC 1.4.1, niveau A)

La couleur ne doit **pas** être le seul moyen de transmettre une information, signaler une action ou distinguer un élément visuel. Toujours doubler d'un texte, d'une icône, d'un motif ou d'une forme.

Exemples Ludaskia : état correct/incorrect d'une réponse doit être indiqué par un texte ou une icône en plus de la couleur verte/rouge.

**RGAA :** critère 3.1.

---

## 4. Tailles des cibles tactiles (SC 2.5.8 et 2.5.5)

### SC 2.5.8 — Taille minimale (niveau AA, nouveau dans WCAG 2.2)

Chaque cible de pointeur doit mesurer au moins **24 × 24 px CSS**.

**Alternative à la taille** : si la cible fait moins de 24 px dans une dimension, un cercle de 24 px de diamètre centré dessus ne doit chevaucher aucune autre cible ni son cercle.

**Exceptions** (la contrainte ne s'applique pas) :
- cibles **inline** dans une phrase (hauteur contrainte par la typographie environnante) ;
- taille déterminée par le **navigateur** et non modifiée par l'auteur (ex. scrollbars natifs) ;
- une **alternative conforme** est disponible ;
- taille **essentielle** à l'information (cartes denses, visualisations de données).

### SC 2.5.5 — Taille améliorée (niveau AAA)

Cible au moins **44 × 44 px CSS** — recommandé pour les contrôles principaux.

### Recommandation pour enfants / mobile

Pour Ludaskia (enfants 7–10 ans, majorité tablette/smartphone) : viser **44 × 44 px CSS** pour tous les boutons d'action principaux (valider, naviguer, choisir une réponse). Le plancher AA de 24 px est un minimum normatif, pas une cible de confort.

---

## 5. Navigation clavier et focus

### SC 2.1.1 — Clavier (niveau A)

Toutes les fonctionnalités doivent être accessibles au clavier sans nécessiter de timing particulier sur les frappes. Exception : les fonctionnalités dont la trajectoire du pointeur est essentielle (dessin libre).

### SC 2.4.7 — Focus visible (niveau AA)

Tout composant opérable au clavier doit avoir un indicateur de focus visible. Ne pas supprimer l'outline CSS sans le remplacer.

### SC 2.4.13 — Apparence du focus (niveau AAA, WCAG 2.2)

L'indicateur de focus doit couvrir une surface **≥ périmètre × 2 px CSS** du composant, et présenter un **contraste ≥ 3:1** entre l'état focalisé et non focalisé.
> Ce critère est AAA (non obligatoire pour AA) mais constitue la bonne pratique à cibler.

---

## 6. Nom, rôle, valeur (SC 4.1.2, niveau A)

Tout composant d'interface doit exposer un **nom**, un **rôle** et sa **valeur / état** déterminables par programmation pour les technologies d'assistance (lecteurs d'écran, etc.).

- Utiliser les éléments HTML natifs sémantiques quand possible.
- Si un composant custom est utilisé, fournir les attributs ARIA correspondants (`role`, `aria-label` ou `aria-labelledby`, `aria-checked`, `aria-disabled`, etc.).

**RGAA :** critère 1.2 et 1.3 (images/alternatives), 2.1 (cadres), 11.x (formulaires).

---

## 7. ARIA pour les figures SVG — pattern Ludaskia

### SVG porteur d'information (figure géométrique, schéma, horloge…)

```html
<svg role="img" aria-labelledby="titre-svg-1 desc-svg-1">
  <title id="titre-svg-1">Nom court de la figure</title>
  <desc id="desc-svg-1">Description détaillée si nécessaire</desc>
  <!-- contenu SVG -->
</svg>
```

- `role="img"` : déclare le SVG comme image autonome (améliore le support AT cross-browser).
- `<title>` : nom accessible court (équivalent `alt`).
- `<desc>` : description longue facultative.
- `aria-labelledby` référençant les deux `id` : concatène titre et description dans le nom accessible.
- Si la description longue est inutile, omettre `<desc>` et `aria-labelledby` peut pointer sur le seul `<title>`, ou utiliser `aria-label` directement :

```html
<svg role="img" aria-label="Triangle rectangle isocèle">
  <!-- contenu SVG -->
</svg>
```

### SVG décoratif (séparateur, fond, ornement)

```html
<svg aria-hidden="true" focusable="false">
  <!-- contenu décoratif -->
</svg>
```

`aria-hidden="true"` retire l'élément de l'arbre d'accessibilité.
`focusable="false"` empêche le focus clavier dans IE/Edge legacy.

### Règle critique Ludaskia — ne pas divulguer la réponse

Le libellé ARIA d'une figure d'exercice **ne doit pas** contenir la réponse attendue.

- **À faire** : `aria-label="Figure géométrique — identifie la forme"` (neutre).
- **À éviter** : `aria-label="Triangle rectangle — c'est un triangle rectangle"` (trahit la réponse d'un QCM).

Si la figure *est* la réponse, préférer `aria-hidden="true"` et fournir l'alternative dans la consigne ou via un bouton « Écouter ».

---

## 8. TTS / audio — bonnes pratiques pour « Écouter la consigne »

### Ce qui doit être lu

- La **consigne complète** telle qu'elle s'affiche à l'écran (texte + nombre si présent).
- Les **termes mathématiques** doivent être formulés pour être intelligibles à l'oral (ex. « deux fois trois » et non « 2 × 3 »).

### Ce qui ne doit pas être lu

- La **réponse attendue** ou un indice direct vers elle.
- Le contenu des **champs de saisie** déjà remplis par l'élève (ne pas relire la réponse en cours).
- Les **éléments décoratifs** (icônes, séparateurs, animations) → s'assurer qu'ils portent `aria-hidden="true"`.

### Cas particulier des figures SVG dans une consigne

Si la consigne contient une figure géométrique et que la forme de cette figure *est* la réponse, le TTS doit lire la consigne textuelle uniquement. La figure doit être masquée au TTS (`aria-hidden="true"`) et son rôle d'illustration précisé dans le texte sans trahir la réponse.

---

## 9. Messages de statut (SC 4.1.3, niveau AA)

Un changement de contenu qui informe sans déplacer le focus (validation, score, mode
terminé…) doit être annoncé par une technologie d'assistance sans recevoir le focus lui-même.
Pattern Ludaskia : `role="status"` + `aria-live="polite"` + `aria-atomic="true"` posé sur un
`<p>` (visible ou `.sr-only`) mis à jour au moment de l'événement — utilisé dans une
vingtaine d'endroits du projet (`ui/sprint.ts`, `ui/revision.ts`, les runners
`lecon-*.ts`, `ui/ortho-runner.ts`…).

**Checklist — région posée sur un écran qui peut immédiatement ouvrir une modale.**
Une région `role="status"` rendue au même tick qu'un chemin qui peut ensuite ouvrir une
modale (récompense, montée de niveau, confettis) est à **vérifier au lecteur d'écran
réel**, pas seulement en lisant le code : `lockBackground` (`src/ui/modal-a11y.ts`) rend
l'arrière-plan `inert` dans le **même tick** que le rendu de la modale, ce qui peut
avaler l'annonce du `role="status"` posé juste avant elle. Cas concret : la pause de
séance d'orthographe (`renderPause`, `ui/ortho-runner.ts`, #641) pose son message « mode
terminé » en `role="status"`, puis peut enchaîner sur `annoncerRecompensesFin`, qui peut
ouvrir une modale de récompense. **Non automatisable** : rien ne mesure en CI le timing
réel d'annonce d'une technologie d'assistance (dépend du navigateur, du lecteur d'écran,
et du moment exact où `inert` est posé) — d'où une checklist et non un gate.

## Note de maintenance

Les critères WCAG sont stables entre révisions majeures. Re-vérifier uniquement si :
- W3C publie WCAG 2.3 ou une nouvelle recommandation ;
- une notion semble absente ou contredite par une source normative récente.

En cas de mise à jour, conserver les en-têtes source + date et mettre à jour la date de récupération.
