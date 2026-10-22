/* ============================================================
   Présentation partagée des signes de ponctuation finale (#204).
   Utilisé par le runner QCM (boutons-symboles de « Quel point à la fin ? ») ET
   par la révision espacée (libellés lisibles). Le mapping glyphe → mot vit dans le
   noyau (`core/erreur-representation.ts`) depuis que la correction différée du bilan
   (#777, `core/bilan-parcours.ts`) en a besoin sans DOM ; il est réexporté ici pour
   les écrans qui l'importaient déjà.
   ============================================================ */
import type { ChoiceView } from '../core/exercise';
import { PONCT_MOTS } from '../core/erreur-representation';

import { html } from '../core/html';

export { PONCT_MOTS };

/** Vue riche (#200) d'un bouton-symbole : gros glyphe + mot dessous. Le mot porte
 *  le libellé accessible (choiceButtonHTML en fait l'aria-label du bouton). Le
 *  point, minuscule par nature, est grossi via une classe modificatrice. */
export function ponctView(c: string): ChoiceView {
	const mot = PONCT_MOTS[c] ?? c;
	const glyphCls = c === '.' ? 'lqcm-sym-glyph lqcm-sym-glyph--point' : 'lqcm-sym-glyph';
	return {
		html: html`<span class="${glyphCls}" aria-hidden="true">${c}</span><span class="lqcm-sym-mot">${mot}</span>`,
		label: mot,
	};
}
