/* ============================================================
   Fractions — libellé verbal (#42) et rendu typographique empilé (#200).
   Module PUR (core) : pas d'accès DOM, renvoie des chaînes.

   Au CE2, la fraction s'écrit avec une BARRE HORIZONTALE (numérateur au-dessus,
   dénominateur en-dessous) — pas en ligne « 6/8 » (avis pedagogue-primaire :
   l'oblique se confond avec une division et n'est pas l'écriture du manuel). La
   donnée garde la clé plate « num/den » (réponse + comparaison QCM) ; `mathInline`
   transforme cette clé EN AFFICHAGE empilé au moment du rendu.
   ============================================================ */
import { escapeHTML } from './utils';
import { nombreEnMots } from './nombres';
import type { ChoiceView } from './exercise';

// Noms du dénominateur au SINGULIER : 2,3,4 sont spéciaux (demi/tiers/quart) ;
// au-delà, ordinal en « -ième ». Couvre les dénominateurs du périmètre CE2, plus
// le CENTIÈME (#247, fractions décimales : n/100) — même mot que decimaux.ts (#246).
const NOM_DEN: Record<number, string> = {
	2: 'demi',
	3: 'tiers',
	4: 'quart',
	5: 'cinquième',
	6: 'sixième',
	8: 'huitième',
	10: 'dixième',
	12: 'douzième',
	100: 'centième',
};

/** Nom du dénominateur (« demi », « tiers », « cinquième »…), au singulier ou au pluriel.
    « tiers » reste invariable, « quart » → « quarts », « cinquième » → « cinquièmes ». */
export function nomDenominateur(den: number, pluriel = false): string {
	const base = NOM_DEN[den] ?? `${den}ième`;
	if (!pluriel || base.endsWith('s')) return base;
	return `${base}s`;
}

/** Libellé parlé d'une fraction : « un demi », « trois quarts », « deux cinquièmes ».
    Le dénominateur prend la marque du pluriel quand le numérateur > 1 (« tiers »
    reste invariable, « quart » → « quarts », « cinquième » → « cinquièmes »). */
export function nomFraction(num: number, den: number): string {
	if (num === 1) return `un ${nomDenominateur(den)}`;
	return `${nombreEnMots(num)} ${nomDenominateur(den, true)}`;
}

/** Fraction empilée (barre horizontale) accessible : `role="img"` + `aria-label`
    verbal (« six huitièmes »), pour ne jamais faire lire « six slash huit ». */
export function fractionInlineHTML(num: number, den: number): string {
	return (
		`<span class="frac" role="img" aria-label="${escapeHTML(nomFraction(num, den))}">` +
		`<span class="frac-num">${num}</span><span class="frac-den">${den}</span></span>`
	);
}

/** Remplace les fractions « num/den » d'un texte DÉJÀ échappé par leur rendu empilé. */
export function stackFractions(escaped: string): string {
	return escaped.replace(/(\d+)\/(\d+)/g, (_m, n: string, d: string) =>
		fractionInlineHTML(Number(n), Number(d)),
	);
}

/** Échappe un texte puis empile ses fractions (énoncés libres de QCM/fiche). */
export function mathInline(text: string): string {
	return stackFractions(escapeHTML(text));
}

/** Vues riches de choix de QCM faits de notations « num/den » : chaque choix devient
    une fraction empilée (html) + son libellé parlé (label). Aligné par index sur les
    valeurs passées (qui restent la clé de comparaison du QCM). */
export function fractionChoiceViews(choices: string[]): ChoiceView[] {
	return choices.map((c) => {
		const [n, d] = c.split('/').map(Number);
		return { html: fractionInlineHTML(n, d), label: nomFraction(n, d) };
	});
}
