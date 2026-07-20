/* ---------- Droite graduée (#256 — placer / lire un nombre) ----------
   Renderer GÉNÉRIQUE et agnostique de la matière : une portion de droite graduée
   entre deux valeurs `min`/`max`, découpée en intervalles égaux de `pas`. Seules les
   graduations « majeures » (`bornes`) sont NUMÉROTÉES ; les intermédiaires restent des
   traits muets. Un ou plusieurs `reperes` corail marquent une valeur (repère à lire ou
   correction). Le module NE dépend PAS des fractions ni des décimaux : il reçoit des
   VALEURS déjà positionnées et des LIBELLÉS déjà formatés — au client de choisir sa
   représentation (entiers, centièmes entiers pour les décimaux…), ce qui garde le tracé
   float-safe (positions dérivées de valeurs entières côté clients).

   Modèle de rendu (avis designer-ux-enfant, #256) : toujours une FENÊTRE zoomée d'une
   dizaine d'intervalles entre deux bornes rondes (jamais 0→N en entier) ; libellés en
   police 16 (plancher) ; hauteur viewBox 120 ; repère mobile en corail `--clock-min`
   (sémantique « le repère à poser / à lire »). Tokens `var(--…)` uniquement.

   Deux sorties :
   - `renderDroiteGraduee` : figure STATIQUE `role="img"` (repli bilan/révision/impression,
     révélation de correction, dispatch `FigureSpec`) ;
   - `renderDroiteGradueeInteractif` : coquille INTERACTIVE `role="radiogroup"` (une
     graduation = un `radio` sélectionnable, cible tactile aimantée par pavage de bandes
     verticales). Le runner (ui/lecon-droite-graduee.ts) y branche les événements et
     dessine le repère mobile via `repereMarkup`. */
import { type Attrs, circle, line, r2, rect, svgCanvas, text } from './primitives';
import { escapeHTML } from '../utils';

/* ---------- Géométrie (unités viewBox), FIXE et partagée ---------- */
const DG_W = 320; // largeur viewBox
const DG_H = 120; // hauteur viewBox (~120, avis designer)
const DG_X0 = 24; // début de l'axe
const DG_X1 = 296; // fin de l'axe
const DG_AXIS_Y = 74; // ordonnée de l'axe horizontal
const DG_TICK_BORNE = 16; // longueur d'un trait de borne numérotée (vers le haut)
const DG_TICK_MUET = 10; // longueur d'un trait intermédiaire muet
const DG_MARK_STEM = 32; // hauteur de la tige du repère
const DG_MARK_R = 7; // rayon de la tête du repère
const DG_LABEL_DY = 24; // décalage vertical du libellé de borne (sous l'axe)

const DG_SPAN = DG_X1 - DG_X0;

/* INVARIANT de densité (avis designer + relecteur-accessibilite, #256) : avec DG_W=320 et
   ~272 unités d'axe utiles, ne pas dépasser ~11 intervalles (n ≤ 11) — au-delà, les bandes
   de sélection interactives tombent sous le plancher tactile de 24 px (WCAG 2.5.8) sur petit
   écran. Les deux leçons actuelles fixent toutes n = 10 ; une fenêtre plus dense devrait
   élargir DG_W en conséquence. */

/** État d'un repère (double codage forme + couleur) : à poser/lire (corail),
    correct (vert, plein) ou faux (rouge, tête creuse). */
export type DroiteEtat = 'neutre' | 'correct' | 'faux';

/** Une graduation : sa valeur (unité interne du client) + son libellé déjà formaté. */
export interface DroiteGraduation {
	valeur: number;
	label: string;
}

/** Un repère à dessiner sur la droite (valeur + état de rendu). */
export interface DroiteRepere {
	valeur: number;
	etat?: DroiteEtat;
}

/** Description d'une droite graduée STATIQUE (figure `role="img"`). */
export interface DroiteGradueeSpec {
	min: number;
	max: number;
	pas: number;
	bornes: DroiteGraduation[]; // graduations NUMÉROTÉES (sous-ensemble des graduations)
	reperes?: DroiteRepere[];
	desc?: string; // description a11y — JAMAIS la réponse (position à lire/deviner)
}

/** Description d'une droite graduée INTERACTIVE (coquille `role="radiogroup"`). */
export interface DroiteGradueeInteractif {
	min: number;
	max: number;
	pas: number;
	graduations: DroiteGraduation[]; // TOUTES les graduations sélectionnables (valeur + libellé)
	bornes: DroiteGraduation[]; // celles qui sont numérotées (traits renforcés + libellé)
	ariaLabel: string; // nom accessible du groupe (la consigne)
}

/* ---------- Helpers géométriques PURS (réutilisés par le runner et les tests) ---------- */

/** Nombre d'intervalles entre `min` et `max` au pas `pas` (arrondi, robuste au float). */
export function nbIntervalles(min: number, max: number, pas: number): number {
	return Math.round((max - min) / pas);
}

/** Liste ordonnée des valeurs de graduation (min, min+pas, …, max). */
export function valeursGraduations(min: number, max: number, pas: number): number[] {
	const n = nbIntervalles(min, max, pas);
	return Array.from({ length: n + 1 }, (_, i) => min + i * pas);
}

/** Abscisse viewBox d'une valeur (position horizontale sur l'axe). */
export function xDeValeur(valeur: number, min: number, max: number): number {
	return DG_X0 + ((valeur - min) * DG_SPAN) / (max - min);
}

/** Index de la graduation la PLUS PROCHE d'une abscisse viewBox (aimantation). */
export function indexDepuisX(xViewBox: number, min: number, max: number, pas: number): number {
	const n = nbIntervalles(min, max, pas);
	const i = Math.round(((xViewBox - DG_X0) / DG_SPAN) * n);
	return Math.max(0, Math.min(n, i));
}

/** Géométrie exposée (runner : conversion pointeur → viewBox ; tests). */
export const DROITE_GEOM = {
	W: DG_W,
	H: DG_H,
	X0: DG_X0,
	X1: DG_X1,
	axisY: DG_AXIS_Y,
} as const;

/* ---------- Fragments de tracé ---------- */

const AXE_ATTRS: Attrs = {
	stroke: 'var(--ink)',
	'stroke-width': 2.5,
	'stroke-linecap': 'round',
};
const LABEL_ATTRS: Attrs = {
	'text-anchor': 'middle',
	'font-family': 'var(--ui)',
	'font-weight': 700,
	'font-size': 16, // plancher (ne pas descendre, avis designer)
	fill: 'var(--ink)',
};

/** Couleur d'un repère selon son état. */
function couleurEtat(etat: DroiteEtat): string {
	return etat === 'correct' ? 'var(--ok)' : etat === 'faux' ? 'var(--ko)' : 'var(--clock-min)';
}

/** Marque (tige + tête) d'un repère à l'abscisse `x`. Tête PLEINE pour « neutre »/
    « correct », CREUSE (fond papier + contour) pour « faux » : la forme double la couleur
    (robuste au daltonisme). Exporté : le runner l'injecte dans le groupe `.dg-repere`. */
export function repereMarkup(x: number, etat: DroiteEtat = 'neutre'): string {
	const couleur = couleurEtat(etat);
	const cy = DG_AXIS_Y - DG_MARK_STEM;
	const tige = line(r2(x), DG_AXIS_Y, r2(x), cy, {
		stroke: couleur,
		'stroke-width': 3,
		'stroke-linecap': 'round',
	});
	// `data-etat` : sélecteur stable pour les tests de révélation (distinguer le repère
	// juste du faux sans compter les cercles) — cf. auteur-tests-e2e.
	const tete =
		etat === 'faux'
			? circle(r2(x), cy, DG_MARK_R, {
					fill: 'var(--paper)',
					stroke: couleur,
					'stroke-width': 3,
					'data-etat': etat,
				})
			: circle(r2(x), cy, DG_MARK_R, { fill: couleur, 'data-etat': etat });
	return tige + tete;
}

/** Corps commun : axe + graduations (bornes renforcées / intermédiaires muettes) +
    libellés des bornes. `min`/`max`/`pas` fixent le pavage, `bornes` les graduations
    numérotées. */
function corpsAxe(min: number, max: number, pas: number, bornes: DroiteGraduation[]): string {
	const n = nbIntervalles(min, max, pas);
	const bornesVals = new Set(bornes.map((b) => b.valeur));
	const parts: string[] = [line(DG_X0, DG_AXIS_Y, DG_X1, DG_AXIS_Y, AXE_ATTRS)];
	for (let i = 0; i <= n; i++) {
		const v = min + i * pas;
		const x = DG_X0 + (i * DG_SPAN) / n;
		const borne = bornesVals.has(v);
		parts.push(
			line(r2(x), DG_AXIS_Y - (borne ? DG_TICK_BORNE : DG_TICK_MUET), r2(x), DG_AXIS_Y, {
				stroke: borne ? 'var(--ink)' : 'var(--grey)',
				'stroke-width': borne ? 2.5 : 1.5,
				'stroke-linecap': 'round',
			}),
		);
	}
	for (const b of bornes) {
		parts.push(
			text(r2(xDeValeur(b.valeur, min, max)), DG_AXIS_Y + DG_LABEL_DY, b.label, LABEL_ATTRS),
		);
	}
	return parts.join('');
}

const DESC_DEFAUT = 'Une droite graduée : quelques valeurs sont écrites, un repère est posé.';

/** Figure STATIQUE `role="img"` : axe gradué + repère(s) éventuel(s). Sert au repli
    (bilan / révision / impression), à la révélation de correction et au dispatch
    `FigureSpec`. La description ne révèle JAMAIS la valeur repérée (position à lire). */
export function renderDroiteGraduee(spec: DroiteGradueeSpec): string {
	const reperes = (spec.reperes ?? [])
		.map((rp) => repereMarkup(xDeValeur(rp.valeur, spec.min, spec.max), rp.etat ?? 'neutre'))
		.join('');
	return svgCanvas(
		DG_W,
		DG_H,
		'Droite graduée',
		spec.desc ?? DESC_DEFAUT,
		corpsAxe(spec.min, spec.max, spec.pas, spec.bornes) + reperes,
		'figure-droite-graduee',
	);
}

/** Coquille INTERACTIVE `role="radiogroup"` : chaque graduation est un `radio`
    (bande verticale transparente `.dg-hit` PAVANT l'axe → aimantation d'un tap sur la
    graduation la plus proche, cible tactile confortable en hauteur). Le runner écoute
    les clics / le clavier, coche le bon radio et dessine le repère mobile dans le groupe
    `.dg-repere` (laissé VIDE ici). Aucun `role="img"` (le groupe interactif porte le
    sens via `aria-label` + les libellés des radios). */
export function renderDroiteGradueeInteractif(spec: DroiteGradueeInteractif): string {
	const { min, max, pas, graduations, bornes, ariaLabel } = spec;
	const n = nbIntervalles(min, max, pas);
	const xIndex = (i: number): number => DG_X0 + (i * DG_SPAN) / n;
	const bornesVals = new Set(bornes.map((b) => b.valeur));
	// Nom accessible d'une graduation (lecteur d'écran). Les BORNES numérotées disent leur
	// valeur (déjà visible pour l'enfant voyant) ; les graduations MUETTES ne la révèlent PAS
	// (ce serait souffler la réponse) → position RELATIVE « N graduations après la borne
	// chiffrée d'en dessous », soit le même comptage de crans que fait l'enfant voyant (parité
	// a11y, avis relecteur-accessibilite #256). Vocabulaire « graduation » unifié (pedagogue).
	const nomGraduation = (valeur: number, label: string): string => {
		if (bornesVals.has(valeur)) return `graduation ${label}`;
		const inf = bornes
			.filter((b) => b.valeur <= valeur)
			.reduce((a, b) => (b.valeur > a.valeur ? b : a));
		const crans = Math.round((valeur - inf.valeur) / pas);
		return `${crans} ${crans > 1 ? 'graduations' : 'graduation'} après ${inf.label}`;
	};
	// Bandes de sélection PAVANT toute la largeur (aimantation) : chaque bande couvre de
	// mi-distance à mi-distance de ses voisines ; les bandes de bord vont jusqu'aux bords
	// du canvas (tap facile en extrémité).
	const hits = graduations
		.map((g, i) => {
			const xc = xIndex(i);
			const gauche = i === 0 ? 0 : (xIndex(i - 1) + xc) / 2;
			const droite = i === n ? DG_W : (xc + xIndex(i + 1)) / 2;
			const label = escapeHTML(g.label);
			return rect(r2(gauche), 0, r2(droite - gauche), DG_H, {
				class: 'dg-hit',
				role: 'radio',
				focusable: 'true', // défensif (anciens moteurs SVG) — coût nul
				'aria-checked': 'false',
				'aria-label': escapeHTML(nomGraduation(g.valeur, g.label)),
				tabindex: i === 0 ? 0 : -1,
				'data-index': i,
				'data-valeur': g.valeur,
				'data-label': label,
				fill: 'transparent',
			});
		})
		.join('');
	// Ordre de peinture (a11y, #256) : les bandes `.dg-hit` D'ABORD → leur `fill` de focus se
	// pose SOUS l'axe et les libellés (sinon la teinte de focus masque le chiffre d'une borne
	// visée au clavier) ; puis l'axe en `pointer-events:none` (les taps traversent jusqu'aux
	// bandes) ; enfin le repère mobile, par-dessus tout.
	return (
		`<svg class="figure-svg figure-droite-graduee dg-interactif" viewBox="0 0 ${DG_W} ${DG_H}" ` +
		`role="radiogroup" aria-label="${escapeHTML(ariaLabel)}" ` +
		`data-min="${min}" data-max="${max}" data-pas="${pas}" data-n="${n}" ` +
		`xmlns="http://www.w3.org/2000/svg">` +
		hits +
		`<g class="dg-axe" pointer-events="none">${corpsAxe(min, max, pas, bornes)}</g>` +
		`<g class="dg-repere"></g>` +
		`</svg>`
	);
}
