/* ============================================================
   Normalisation « texte affiché → texte parlé » (#42).
   Les énoncés sont écrits pour l'ŒIL (marqueur `@` du trou à remplir, signes
   d'opération `+ - × ÷ =`, balises de rendu) ; lus tels quels par la synthèse
   vocale, ils sonneraient faux ou muets. Cette couche, PURE et testable hors
   DOM, en produit une version pour l'OREILLE. Réutilisée par tout bouton
   « Écouter la consigne ». Voir docs/design-orthographe.md (§ Accessibilité).
   ============================================================ */

// Signes d'opération entourés d'espaces (les énoncés calcul sont « 7 + 8 = @ »)
// → mots. On exige l'espacement pour ne pas toucher un tiret interne (« porte-clé »).
const OPERATEURS: [RegExp, string][] = [
	[/\s\+\s/g, ' plus '],
	[/\s[-−]\s/g, ' moins '],
	[/\s[×x*]\s/g, ' fois '],
	[/\s[÷/]\s/g, ' divisé par '],
	[/\s=\s/g, ' égale '],
];

/** Transforme un énoncé affiché en texte à lire à voix haute. */
export function texteParle(raw: string): string {
	if (!raw) return '';
	let t = raw
		.replace(/<[^>]*>/g, ' ') // une consigne peut contenir du HTML (gras…)
		.replace(/&amp;/g, '&')
		.replace(/&lt;/g, '<')
		.replace(/@/g, ' '); // le trou à remplir : silence, pas « arobase »
	for (const [re, mot] of OPERATEURS) t = t.replace(re, mot);
	return t.replace(/\s+/g, ' ').trim();
}

/** Échappement pour une valeur d'attribut HTML (escapeHTML n'échappe pas `"`). */
function escAttr(s: string): string {
	return s
		.replace(/&/g, '&amp;')
		.replace(/</g, '&lt;')
		.replace(/>/g, '&gt;')
		.replace(/"/g, '&quot;');
}

/** Attribut `data-tts` prêt à coller dans un template (vide si rien à lire) :
 *  l'élément de consigne le porte, le composant ui/consigne-tts greffe le bouton. */
export function ttsAttr(raw: string): string {
	const t = texteParle(raw);
	return t ? ` data-tts="${escAttr(t)}"` : '';
}
