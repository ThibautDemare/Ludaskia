/* ============================================================
   RECETTE d'un fragment de balisage (#734) — de quoi le REDESSINER plutôt que le recopier.

   Un exercice porte parfois du balisage : une figure SVG, la vue riche d'un choix de
   QCM (fraction empilée, terminaison surlignée). Ce balisage est de confiance tant
   qu'il est fabriqué par l'application ; dans un lien partagé, il ne l'est plus —
   n'importe qui peut écrire un lien. On ne transporte donc JAMAIS de balisage : on
   transporte la RECETTE qui l'a produit (une `FigureSpec`, un numérateur et un
   dénominateur…), validée à l'arrivée, puis l'application refait le dessin
   (`core/partage/fragments.ts`).

   Le registre est une `WeakMap` du fragment vers sa recette, alimentée par les
   fabriques elles-mêmes (`renderFigure`, `fractionInlineHTML`, `surligner`,
   `aideFigure`, `suite`). Pourquoi pas un champ sur `SafeHtml` : un fragment
   reconstruit à la main (`html\`${a}${b}\``) perdrait sa recette sans rien dire,
   alors que la `WeakMap` laisse l'absence visible — `recetteDe` rend `undefined`, et
   l'encodage d'un envoi échoue bruyamment plutôt que d'émettre un lien amputé.
   `tests/partage-gate.test.ts` fait l'aller-retour de tout le catalogue : un
   générateur qui assemblerait sa figure à la main y rougit.
   ============================================================ */
import { joindre, type SafeHtml } from './html';
import type { FigureSpec } from './figures';

/** Aides textuelles attachées à une figure (bulles de la leçon sur les angles). Leur
 *  texte vit dans `core/aides-figure.ts` ; la recette n'en porte que l'identifiant. */
export type IdAide = 'angle-aigu' | 'angle-nommer';

export type Recette =
	| { k: 'figure'; spec: FigureSpec }
	| { k: 'fraction'; num: number; den: number }
	/** Texte découpé en morceaux, les morceaux `true` surlignés (`.term`). */
	| { k: 'surlignage'; morceaux: [string, boolean][] }
	| { k: 'aide'; id: IdAide }
	/** Fragments mis bout à bout. */
	| { k: 'suite'; parts: Recette[] };

const RECETTES = new WeakMap<SafeHtml, Recette>();

/** Attache une recette à un fragment et rend le fragment (pour s'écrire en ligne). */
export function marquer<T extends SafeHtml>(fragment: T, recette: Recette): T {
	RECETTES.set(fragment, recette);
	return fragment;
}

/** Recette d'un fragment, ou `undefined` s'il a été assemblé hors des fabriques. */
export function recetteDe(fragment: SafeHtml): Recette | undefined {
	return RECETTES.get(fragment);
}

/** Met des fragments bout à bout en gardant de quoi les refaire : la suite n'a de
 *  recette que si CHACUNE de ses parties en a une. */
export function suite(...parts: SafeHtml[]): SafeHtml {
	const fragment = joindre(parts);
	const recettes = parts.map(recetteDe);
	if (recettes.every((r): r is Recette => r !== undefined))
		marquer(fragment, { k: 'suite', parts: recettes });
	return fragment;
}
