/* ============================================================
   Normalisation « texte affiché → texte parlé » (#42).
   Les énoncés sont écrits pour l'ŒIL (marqueur `@` du trou à remplir, signes
   d'opération `+ - × ÷ =`, balises de rendu) ; lus tels quels par la synthèse
   vocale, ils sonneraient faux ou muets. Cette couche, PURE et testable hors
   DOM, en produit une version pour l'OREILLE. Réutilisée par tout bouton
   « Écouter la consigne ». Voir docs/design-orthographe.md (§ Accessibilité).
   ============================================================ */
import { escapeHTML } from './utils';

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

// Chiffres épelés pour la lecture des décimales (#246, nombres décimaux CM1).
const CHIFFRE_MOT = [
	'zéro',
	'un',
	'deux',
	'trois',
	'quatre',
	'cinq',
	'six',
	'sept',
	'huit',
	'neuf',
];

/* Décimaux (#246) : une VIRGULE ENTRE DEUX CHIFFRES est le séparateur décimal (jamais
   un séparateur de milliers, qui est une fine insécable U+202F). On la lit « virgule »
   PUIS on épelle la partie décimale CHIFFRE À CHIFFRE, pour qu'un moteur vocal
   n'« avale » pas le zéro médian (« 3,04 » → « trois virgule zéro quatre », et non
   « trois virgule quatre »). La partie entière reste lue comme un entier (seul le
   dernier de ses chiffres est capturé par `(\d)` puis réémis intact). La virgule
   d'énumération (« 3, puis 4 », suivie d'une espace) n'est jamais touchée : le motif
   exige chiffre-virgule-chiffre, sans espace. */
function epelerDecimales(t: string): string {
	return t.replace(
		// `(?!\d)` force `\d+` à capturer TOUTE la partie décimale (pas de repli qui
		// couperait « 50 » en « 5 »). `(?!\s*€)` laisse les MONTANTS en euros à leur
		// lecture native (« 1,50 € » → « 1,50 euros », pas « un virgule cinq zéro ») :
		// la monnaie CM1 (monnaie.ts) ne doit pas être épelée par ce moteur global.
		/(\d),(\d+)(?!\d)(?!\s*€)/g,
		(_m, ent: string, frac: string) =>
			`${ent} virgule ${[...frac].map((c) => CHIFFRE_MOT[Number(c)]).join(' ')}`,
	);
}

/** Transforme un énoncé affiché en texte à lire à voix haute. */
export function texteParle(raw: string): string {
	if (!raw) return '';
	let t = raw
		.replace(/<[^>]*>/g, ' ') // une consigne peut contenir du HTML (gras…)
		// Les entités que `escapeHTML` sait produire, ramenées à leur caractère : sans ça, le
		// moteur vocal reçoit « &amp;amp; » et lit la suite de lettres au lieu du signe. Les
		// cinq, donc, et non les deux d'origine : ce jeu appariait l'ancienne version de
		// `escapeHTML`, et l'écart se serait vu au premier énoncé portant une des trois autres.
		// Ramener au caractère n'est pas le VERBALISER : seule la table OPERATEURS le fait, et
		// elle ne couvre pas `<`/`>` (un énoncé de comparaison affiché avec des chevrons serait
		// donc muet à l'écoute — limite connue, verrouillée dans tests/tts-text.test.ts).
		// `&amp;` en DERNIER, sinon « &amp;lt; » (une esperluette littérale suivie de « lt; »)
		// se décoderait deux fois et ressortirait en « < ».
		.replace(/&lt;/g, '<')
		.replace(/&gt;/g, '>')
		.replace(/&quot;/g, '"')
		.replace(/&#39;/g, "'")
		.replace(/&amp;/g, '&')
		.replace(/[·—–]/g, ' ') // séparateurs purement visuels (puce, tirets longs)
		.replace(/→/g, ' ') // flèche « devient » : muette (souvent suivie du trou)
		.replace(/@/g, ' ') // le trou à remplir : silence, pas « arobase »
		.replace(SEP_MILLIERS, '$1$2'); // colle les classes des grands nombres (avant le \s+ final)
	t = epelerDecimales(t); // épelle la partie décimale (après avoir collé les milliers)
	for (const [re, mot] of OPERATEURS) t = t.replace(re, mot);
	for (const [re, mot] of UNITES) t = t.replace(re, mot);
	return t.replace(/\s+/g, ' ').trim();
}

/** Attribut `data-tts` prêt à coller dans un template (vide si rien à lire) :
 *  l'élément de consigne le porte, le composant ui/consigne-tts greffe le bouton.
 *  L'échappement passe par `escapeHTML`, qui couvre désormais les guillemets : ce module
 *  gardait sa propre copie faute de quoi la valeur d'attribut se serait refermée. */
export function ttsAttr(raw: string): string {
	const t = texteParle(raw);
	return t ? ` data-tts="${escapeHTML(t)}"` : '';
}
