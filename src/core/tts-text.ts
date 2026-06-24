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

// Unités lues en toutes lettres (un enfant dyscalculique a besoin de la
// verbalisation pleine ; « cm » épelé « cé-èm » n'est que du bruit). On ne
// substitue que des tokens NON ambigus précédés d'un espace : on évite les
// lettres seules « m », « c », « h », « L » qui se confondraient avec du texte.
const UNITES: [RegExp, string][] = [
	[/ €/g, ' euros'],
	[/\bcentim(?:è|e)tres?\b/gi, 'centimètres'], // garde-fou si déjà en toutes lettres
	[/ cm\b/g, ' centimètres'],
	[/ mm\b/g, ' millimètres'],
	[/ dm\b/g, ' décimètres'],
	[/ km\b/g, ' kilomètres'],
	[/ kg\b/g, ' kilogrammes'],
	[/ min\b/g, ' minutes'],
];

// Grands nombres (#240) : entre deux chiffres, on COLLE les classes séparées par
// l'espace fine insécable U+202F (ou l'insécable U+00A0) — « 1 002 050 » → « 1002050 »
// — pour que le moteur vocal lise un ENTIER (« un million deux mille cinquante »)
// plutôt que d'épeler les groupes. Les séparateurs sont désignés par leur CODE
// (String.fromCharCode), jamais écrits en clair : invisibles et fragiles à l'édition.
const SEP_MILLIERS = new RegExp('([0-9])[' + String.fromCharCode(0x202f, 0x00a0) + ']([0-9])', 'g');

/** Transforme un énoncé affiché en texte à lire à voix haute. */
export function texteParle(raw: string): string {
	if (!raw) return '';
	let t = raw
		.replace(/<[^>]*>/g, ' ') // une consigne peut contenir du HTML (gras…)
		.replace(/&amp;/g, '&')
		.replace(/&lt;/g, '<')
		.replace(/[·—–]/g, ' ') // séparateurs purement visuels (puce, tirets longs)
		.replace(/→/g, ' ') // flèche « devient » : muette (souvent suivie du trou)
		.replace(/@/g, ' ') // le trou à remplir : silence, pas « arobase »
		.replace(SEP_MILLIERS, '$1$2'); // colle les classes des grands nombres (avant le \s+ final)
	for (const [re, mot] of OPERATEURS) t = t.replace(re, mot);
	for (const [re, mot] of UNITES) t = t.replace(re, mot);
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
