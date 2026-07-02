/* ============================================================
   Primitives bas niveau du moteur de figures SVG (#88).
   Socle PARTAGÉ par toutes les familles de figures (horloge, polygones,
   solides, fractions, symétrie, angles, groupes) : fonctions de tracé
   (`line`, `circle`, `polygon`…), enveloppe accessible (`svgCanvas`),
   utilitaires géométriques (`pointOnCircle`, `polar`, `r2`) et tokens de
   style réutilisés d'une famille à l'autre (`SHAPE_FILL`, `ANGLE_MARK`).
   Aucun accès DOM : chaque fonction renvoie une CHAÎNE de balisage.
   Toute nouvelle figure se COMPOSE avec ces primitives — jamais de SVG
   écrit « à la main » dans une leçon. ============================================================ */
import { escapeHTML } from '../utils';

export type Attrs = Record<string, string | number>;

/** Sérialise un dictionnaire d'attributs SVG (valeurs numériques telles quelles). */
export function attrs(a: Attrs): string {
	return Object.entries(a)
		.map(([k, v]) => `${k}="${v}"`)
		.join(' ');
}

/** Arrondi à 2 décimales (coordonnées SVG propres et déterministes). */
export function r2(n: number): number {
	return Math.round(n * 100) / 100;
}

/** Point sur un cercle : angle en degrés depuis midi (12 h), sens horaire. */
export function pointOnCircle(cx: number, cy: number, r: number, deg: number): [number, number] {
	const rad = (deg * Math.PI) / 180;
	return [cx + r * Math.sin(rad), cy - r * Math.cos(rad)];
}

export function line(x1: number, y1: number, x2: number, y2: number, a: Attrs = {}): string {
	return `<line ${attrs({ x1, y1, x2, y2, ...a })} />`;
}
export function circle(cx: number, cy: number, r: number, a: Attrs = {}): string {
	return `<circle ${attrs({ cx, cy, r, ...a })} />`;
}
export function ellipse(cx: number, cy: number, rx: number, ry: number, a: Attrs = {}): string {
	return `<ellipse ${attrs({ cx, cy, rx, ry, ...a })} />`;
}
export function rect(x: number, y: number, w: number, h: number, a: Attrs = {}): string {
	return `<rect ${attrs({ x, y, width: w, height: h, ...a })} />`;
}
export function polygon(points: Array<[number, number]>, a: Attrs = {}): string {
	const pts = points.map(([x, y]) => `${x},${y}`).join(' ');
	return `<polygon ${attrs({ points: pts, ...a })} />`;
}
export function polyline(points: Array<[number, number]>, a: Attrs = {}): string {
	const pts = points.map(([x, y]) => `${x},${y}`).join(' ');
	return `<polyline ${attrs({ points: pts, ...a })} />`;
}
export function text(x: number, y: number, content: string, a: Attrs = {}): string {
	return `<text ${attrs({ x, y, ...a })}>${escapeHTML(content)}</text>`;
}

/** Point en coordonnées polaires (convention « maths-écran » : 0° = est, sens
    HORAIRE à l'écran car y descend). Distincte de `pointOnCircle` (repère horloge,
    0° = midi) : ici l'angle est mesuré depuis l'horizontale, naturel pour un angle. */
export function polar(cx: number, cy: number, r: number, deg: number): [number, number] {
	const rad = (deg * Math.PI) / 180;
	return [r2(cx + r * Math.cos(rad)), r2(cy + r * Math.sin(rad))];
}

/** Arc de cercle (path SVG) de `deg1` à `deg2` autour de (cx, cy), rayon r — même
    convention d'angle que `polar`. Le sens du tracé suit le signe de l'écart
    (deg2 ≥ deg1 → horaire) ; large-arc au-delà d'un demi-tour. `fill="none"` à poser
    par l'appelant. */
export function arc(
	cx: number,
	cy: number,
	r: number,
	deg1: number,
	deg2: number,
	a: Attrs = {},
): string {
	const [x1, y1] = polar(cx, cy, r, deg1);
	const [x2, y2] = polar(cx, cy, r, deg2);
	const delta = deg2 - deg1;
	const large = Math.abs(delta) > 180 ? 1 : 0;
	const sweep = delta >= 0 ? 1 : 0;
	return `<path d="M ${x1} ${y1} A ${r} ${r} 0 ${large} ${sweep} ${x2} ${y2}" ${attrs(a)} />`;
}

/** Enveloppe SVG accessible : viewBox (w×h), role="img", titre + description.
    `decorative` : SVG purement DÉCORATIF (`aria-hidden`, sans role/label/titre) —
    à n'utiliser que lorsqu'un parent déjà nommé porte le sens (ex. une figure rendue
    DANS un bouton-choix QCM, dont le `aria-label` décrit déjà le choix). */
export function svgCanvas(
	w: number,
	h: number,
	ariaLabel: string,
	title: string,
	desc: string,
	body: string,
	cls = '',
	decorative = false,
): string {
	const klass = `figure-svg${cls ? ' ' + cls : ''}`;
	if (decorative) {
		return (
			`<svg class="${klass}" viewBox="0 0 ${w} ${h}" aria-hidden="true" ` +
			`xmlns="http://www.w3.org/2000/svg">${body}</svg>`
		);
	}
	return (
		`<svg class="${klass}" viewBox="0 0 ${w} ${h}" ` +
		`role="img" aria-label="${escapeHTML(ariaLabel)}" xmlns="http://www.w3.org/2000/svg">` +
		`<title>${escapeHTML(title)}</title><desc>${escapeHTML(desc)}</desc>${body}</svg>`
	);
}

/* ---------- Tokens de style partagés entre familles ----------
   Regroupés ici car réutilisés par plusieurs familles : centraliser garde le
   graphe de dépendances en étoile (chaque famille dépend de primitives, jamais
   d'une autre famille). */

/** Remplissage d'une figure PLEINE : `--accent-soft` + contour `--accent`.
    Partagé par polygones (figures planes, boîtes de solides) et symétrie. */
export const SHAPE_FILL = {
	fill: 'var(--accent-soft)',
	stroke: 'var(--accent)',
	'stroke-width': 3,
	'stroke-linejoin': 'round',
} as const;

/** Trait de CODAGE d'un angle droit (équerre / carré de codage) : `--ink` (robuste à
    tous les thèmes), extrémités arrondies, sans remplissage. Partagé par `renderAngle`
    (angles) et `coinAngleDroit` (codage des figures planes, #326) : même convention
    d'équerre → un seul token pour un rendu cohérent. */
export const ANGLE_MARK = {
	fill: 'none',
	stroke: 'var(--ink)',
	'stroke-width': 2.5,
	'stroke-linecap': 'round',
	'stroke-linejoin': 'round',
} as const;
