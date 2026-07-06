/* ============================================================
   Signes de comparaison « < = > » (#380).

   Sur tablette, les claviers virtuels enfouissent ces signes dans des
   sous-claviers : quand la réponse attendue d'un item est un signe, le mode
   saisie affiche un PAVÉ de trois boutons co-localisé avec l'énoncé (un tap
   remplit le champ), et le sprint pose la question en QCM à trois choix.
   Décisions croisées designer-ux-enfant / spécialiste dys (#380) :
   - boutons AU PLUS PRÈS de chaque énoncé (pas de barre partagée « champ
     actif » : charge de mémoire de travail, geste indirect — avis dys) ;
   - ordre FIXE « < = > », identique aux tuiles (ancrage spatial) ;
   - gros glyphe + mot-légende court (double codage non chromatique, même
     langage visuel que les boutons-symboles de ponctuation, #204) ;
   - le champ reste un vrai <input> rempli par le tap (pipeline de correction
     .ans/.mark inchangé) ; la frappe au clavier physique reste possible.
   Le comportement (clic → remplissage) vit dans ui/pave-signes.ts.
   ============================================================ */
import { escapeHTML } from './utils';
import type { ChoiceView } from './exercise';

/* Ordre d'affichage FIGÉ (« < = > ») : le même que les tuiles des leçons de
   comparaison — position stable = ancrage moteur (avis dys, ne pas mélanger). */
export const SIGNES_COMPARAISON = ['<', '=', '>'] as const;
export type SigneComparaison = (typeof SIGNES_COMPARAISON)[number];

/* Mot-légende court (UN mot : tient sous le glyphe sans retour à la ligne) et
   libellé accessible complet (aria-label, vocabulaire CE2 « plus petit que »,
   pas « inférieur à »). Records STRICTS : étendre SIGNES_COMPARAISON sans
   compléter ces deux tables casse la compilation (pas de repli silencieux). */
const SIGNE_MOTS: Record<SigneComparaison, string> = { '<': 'petit', '=': 'égal', '>': 'grand' };
const SIGNE_LABELS: Record<SigneComparaison, string> = {
	'<': 'plus petit que',
	'=': 'égal à',
	'>': 'plus grand que',
};

/* La réponse attendue d'un item est-elle un signe de comparaison ? (Aiguille le
   rendu du champ + pavé dans renderItem et le QCM du sprint.) */
export function estSigneComparaison(answer: number | string): boolean {
	return (
		typeof answer === 'string' && (SIGNES_COMPARAISON as readonly string[]).includes(answer.trim())
	);
}

/* Vue riche d'un bouton-signe : gros glyphe + mot dessous. Mêmes classes que les
   boutons-symboles de ponctuation (#204, stylées dans lecon-mode.scss) — un seul
   langage visuel « symbole ambigu » dans l'appli. Le libellé accessible complet
   est porté par le bouton (aria-label via choiceButtonHTML / paveSignesHTML). */
export function signeView(signe: SigneComparaison): ChoiceView {
	return {
		html:
			`<span class="lqcm-sym-glyph" aria-hidden="true">${escapeHTML(signe)}</span>` +
			`<span class="lqcm-sym-mot" aria-hidden="true">${escapeHTML(SIGNE_MOTS[signe])}</span>`,
		label: SIGNE_LABELS[signe],
	};
}

/* Pavé de trois boutons-signes rattachés au champ `forId`, rendu SOUS l'énoncé
   (propre rangée via CSS). `screen-only` : jamais imprimé (le chemin impression
   dédié ne le rend pas, mais le bouton 🖨 imprime l'écran courant tel quel).
   aria-pressed reflète le signe présent dans le champ (synchronisé par
   ui/pave-signes.ts, aussi quand on tape au clavier physique). */
export function paveSignesHTML(forId: string): string {
	const boutons = SIGNES_COMPARAISON.map((s) => {
		const v = signeView(s);
		return (
			`<button type="button" class="pave-signe" data-for="${forId}" ` +
			`data-signe="${escapeHTML(s)}" aria-pressed="false" aria-label="${escapeHTML(v.label)}">` +
			`${v.html}</button>`
		);
	}).join('');
	return `<span class="pave-signes screen-only" role="group" aria-label="Choisis le signe">${boutons}</span>`;
}
