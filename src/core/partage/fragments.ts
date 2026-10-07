/* ============================================================
   Séance partagée (#734) — les FRAGMENTS de balisage d'un exercice, en recette.

   Côté émetteur, un fragment est remplacé par sa recette (`recetteDe`) ; un fragment
   sans recette fait échouer l'encodage, plutôt que de partir amputé. Côté
   récepteur, la recette est validée PUIS redessinée par les fabriques de
   l'application : le balisage affiché chez l'enfant est toujours celui que
   l'application produit, jamais un texte venu du lien.
   ============================================================ */
import type { SafeHtml } from '../html';
import { renderFigure } from '../figures';
import { fractionInlineHTML } from '../fraction-text';
import { surligner } from '../surlignage';
import { aideFigure } from '../aides-figure';
import { recetteDe, suite, type IdAide, type Recette } from '../recette-fragment';
import {
	booleen,
	chaine,
	differe,
	entier,
	liste,
	objet,
	parmi,
	refuser,
	transforme,
	tuple,
	union,
	type Schema,
} from './schema';
import { schemaFigure } from './figures';

type R<K extends Recette['k']> = Extract<Recette, { k: K }>;

/** Profondeur d'imbrication des `suite` : une figure et sa bulle d'aide n'en demandent
 *  qu'une. La borne coupe court à un lien qui empilerait des milliers de niveaux. */
const PROFONDEUR_MAX = 3;

/** Morceau d'une vue surlignée : un bout de mot, ou l'espace entre deux mots. */
const morceau = chaine({ max: 40, motif: /^[\p{L}\p{M}' -]*$/u });

const schemaRecette: Schema<Recette> = union<'k', Recette>('k', {
	figure: objet<R<'figure'>>({ k: parmi('figure'), spec: schemaFigure }),
	// Une fraction DÉCIMALE peut dépasser l'unité de loin (« 1033/100 » pour 10,33).
	fraction: objet<R<'fraction'>>({
		k: parmi('fraction'),
		num: entier(0, 1_000_000),
		den: entier(1, 1_000_000),
	}),
	surlignage: objet<R<'surlignage'>>({
		k: parmi('surlignage'),
		morceaux: liste(tuple<[string, boolean]>(morceau, booleen), { min: 1, max: 20 }),
	}),
	aide: objet<R<'aide'>>({
		k: parmi('aide'),
		id: parmi<IdAide[]>('angle-aigu', 'angle-nommer'),
	}),
	suite: objet<R<'suite'>>({
		k: parmi('suite'),
		parts: liste(
			differe(() => recetteImbriquee),
			{ min: 1, max: 4 },
		),
	}),
});

/** La profondeur se lit sur le chemin, AVANT de descendre : la vérifier après coup
 *  laisserait la lecture récursive épuiser la pile sur un lien malveillant. */
const recetteImbriquee: Schema<Recette> = {
	lire(v, chemin) {
		if ((chemin.match(/\.parts\[/g) ?? []).length > PROFONDEUR_MAX)
			refuser(chemin, 'recette trop imbriquée');
		return schemaRecette.lire(v, chemin);
	},
	ecrire: (v) => schemaRecette.ecrire(v),
};

/** Redessine un fragment à partir d'une recette VALIDÉE. */
export function rebatir(r: Recette): SafeHtml {
	switch (r.k) {
		case 'figure':
			return renderFigure(r.spec);
		case 'fraction':
			return fractionInlineHTML(r.num, r.den);
		case 'surlignage':
			return surligner(r.morceaux);
		case 'aide':
			return aideFigure(r.id);
		case 'suite':
			return suite(...r.parts.map(rebatir));
	}
}

/** Un fragment dans un lien : sa recette à l'aller, son redessin au retour. */
export const fragment: Schema<SafeHtml> = transforme(
	schemaRecette,
	(r) => rebatir(r),
	(f) => {
		const r = recetteDe(f);
		if (!r)
			throw new Error(
				'partage : fragment sans recette (assemblé hors des fabriques) — il ne peut pas voyager',
			);
		return r;
	},
);
