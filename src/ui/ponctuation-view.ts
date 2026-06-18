/* ============================================================
   Présentation partagée des signes de ponctuation finale (#204).
   Utilisé par le runner QCM (boutons-symboles de « Quel point à la fin ? ») ET
   par la révision espacée (libellés lisibles). Source unique du mapping
   glyphe → mot, pour éviter toute désynchronisation.
   ============================================================ */
import type { ChoiceView } from '../core/exercise';
import { escapeHTML } from '../core/utils';

/** Mot de chaque signe : libellé accessible des boutons-symboles ET libellé
 *  lisible affiché en révision (un « . » nu serait quasi invisible). */
export const PONCT_MOTS: Record<string, string> = {
	'.': 'point',
	'?': "point d'interrogation",
	'!': "point d'exclamation",
};

/** Vue riche (#200) d'un bouton-symbole : gros glyphe + mot dessous. Le mot porte
 *  le libellé accessible (choiceButtonHTML en fait l'aria-label du bouton). Le
 *  point, minuscule par nature, est grossi via une classe modificatrice. */
export function ponctView(c: string): ChoiceView {
	const mot = PONCT_MOTS[c] ?? c;
	const glyphCls = c === '.' ? 'lqcm-sym-glyph lqcm-sym-glyph--point' : 'lqcm-sym-glyph';
	return {
		html: `<span class="${glyphCls}" aria-hidden="true">${escapeHTML(c)}</span><span class="lqcm-sym-mot">${escapeHTML(mot)}</span>`,
		label: mot,
	};
}
