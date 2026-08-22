/* ============================================================
   Consigne renforcée (#203) — markup partagé.
   ------------------------------------------------------------
   Ligne en gras précédée d'un picto décoratif (« ↔ » contraire, « = » sens
   proche…), affichée AU-DESSUS de l'énoncé pour donner l'ACTION attendue (« Quel
   mot veut dire le contraire ? »). Le picto est `aria-hidden` : le sens est porté
   par le texte, jamais par le seul glyphe (double codage).

   Source unique réutilisée par le runner leçon (ui/lecon-qcm.ts) ET le mode
   révision (ui/revision.ts, #265) : les deux rendaient un fragment identique.
   La ligne porte la lecture vocale GLOBALE (consigne + phrase) via `ttsText` —
   l'appelant retire alors le `data-tts` de l'énoncé pour éviter un second bouton
   « Écouter ».
   ============================================================ */

import { ttsAttr } from '../core/tts-text';
import { html, type SafeHtml, VIDE } from '../core/html';

/** Markup de la consigne renforcée, ou '' si la leçon n'en fournit pas. */
export function consigneRenforceeHTML(
	consigne: string | undefined,
	picto: string | undefined,
	ttsText: string,
): SafeHtml {
	if (!consigne) return VIDE;
	const pictoHTML = picto
		? html`<span class="lqcm-picto" aria-hidden="true">${picto}</span>`
		: VIDE;
	return html`<div class="lqcm-consigne"${ttsAttr(ttsText)}>${pictoHTML}<span class="lqcm-consigne-txt">${consigne}</span></div>`;
}
