/* ============================================================
   Moteur de figures SVG génératives (#88).
   Module PUR (aucun accès DOM) : chaque fonction renvoie une CHAÎNE
   de balisage (SVG + éventuelle légende), insérée telle quelle dans le
   HTML d'un exercice. C'est `figureBlock` (core/items.ts) qui l'enveloppe
   d'un conteneur ; l'impression la conserve, les runners la réaffichent.

   POINT D'EXTENSION — ce module est le socle RÉUTILISABLE du rendu de
   figures pour les leçons de « Grandeurs et mesures » et de « Géométrie ».
   La première figure est l'horloge (lecture de l'heure, #88) ; viendront
   rectangles cotés et figures en L (périmètre, #99), polygones et
   quadrillages (figures planes, #99/#100), cercle coté (#102), schémas de
   solides (#103). Pour ajouter une figure :
     1. la COMPOSER avec les primitives bas niveau ci-dessous (`svgCanvas`,
        `line`, `circle`, `polygon`, `polyline`, `rect`, `text`,
        `pointOnCircle`) — jamais de SVG écrit « à la main » dans une leçon ;
     2. exposer une fonction `renderXxx(...)` qui renvoie le fragment complet ;
     3. (optionnel) ajouter un variant à `FigureSpec` + un cas à `renderFigure`
        si la leçon préfère DÉCRIRE la figure par des données plutôt que
        d'appeler le renderer directement (utile pour sérialiser/tester).
   Toutes les figures partagent : un `viewBox` carré, `role="img"` +
   `<title>`/`<desc>` et un `aria-label` pour l'accessibilité, et des tokens
   de couleur CSS (`var(--…)`, jamais de couleur en dur). ============================================================ */
import { escapeHTML } from './utils';

/* ---------- Primitives bas niveau (réutilisables par toutes les figures) ---------- */

type Attrs = Record<string, string | number>;

/** Sérialise un dictionnaire d'attributs SVG (valeurs numériques telles quelles). */
function attrs(a: Attrs): string {
	return Object.entries(a)
		.map(([k, v]) => `${k}="${v}"`)
		.join(' ');
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

/** Enveloppe SVG accessible : viewBox (w×h), role="img", titre + description. */
export function svgCanvas(
	w: number,
	h: number,
	ariaLabel: string,
	title: string,
	desc: string,
	body: string,
	cls = '',
): string {
	return (
		`<svg class="figure-svg${cls ? ' ' + cls : ''}" viewBox="0 0 ${w} ${h}" ` +
		`role="img" aria-label="${escapeHTML(ariaLabel)}" xmlns="http://www.w3.org/2000/svg">` +
		`<title>${escapeHTML(title)}</title><desc>${escapeHTML(desc)}</desc>${body}</svg>`
	);
}

/** Arrondi à 2 décimales (coordonnées SVG propres et déterministes). */
function r2(n: number): number {
	return Math.round(n * 100) / 100;
}

/* ---------- Horloge à aiguilles (#88) ----------
   Calibrage (avis designer-ux-enfant + pedagogue-primaire) :
   - distinction des aiguilles par TROIS canaux redondants (longueur,
     épaisseur, couleur) : petite/heures = courte, ÉPAISSE, bleue ;
     grande/minutes = longue, fine, corail (`--clock-min`) ;
   - aiguille des heures PROPORTIONNELLE aux minutes (angle = h×30 + m×0,5)
     pour ne jamais enseigner une lecture fausse (à X h 30 elle est à
     mi-chemin entre deux chiffres) ;
   - repères 12/3/6/9 renforcés ; pas de trotteuse ; pas de minutes chiffrées
     (béquille qui court-circuite la conversion « grande aiguille sur 3 → 15 »). */

const CLOCK_SIZE = 200;
const CX = 100;
const CY = 100;

export function renderHorloge(heures: number, minutes: number): string {
	const h12 = ((heures % 12) + 12) % 12; // 12 h ↦ 0 pour le calcul d'angle
	const minuteAngle = minutes * 6;
	const hourAngle = h12 * 30 + minutes * 0.5;

	const parts: string[] = [];

	// Cadran : disque papier cerné de bleu.
	parts.push(
		circle(CX, CY, 92, { fill: 'var(--paper)', stroke: 'var(--blue)', 'stroke-width': 4 }),
	);

	// Graduations : 60 traits, gros aux heures (multiples de 5), fins ailleurs.
	for (let i = 0; i < 60; i++) {
		const isHour = i % 5 === 0;
		const rOuter = 88;
		const len = isHour ? 10 : 5;
		const [x1, y1] = pointOnCircle(CX, CY, rOuter, i * 6);
		const [x2, y2] = pointOnCircle(CX, CY, rOuter - len, i * 6);
		parts.push(
			line(x1, y1, x2, y2, {
				stroke: isHour ? 'var(--grey)' : 'var(--muted)',
				'stroke-width': isHour ? 3.5 : 1.2,
				'stroke-linecap': 'round',
			}),
		);
	}

	// Chiffres 1–12 (12/3/6/9 renforcés : ancres mentales des quarts/demies).
	// Rayon 62 : nettement à l'intérieur des graduations (qui descendent jusqu'à
	// r≈78) pour que les chiffres ne « mordent » pas dessus.
	for (let n = 1; n <= 12; n++) {
		const [x, y] = pointOnCircle(CX, CY, 62, n * 30);
		const cardinal = n % 3 === 0;
		parts.push(
			text(x, y, String(n), {
				'text-anchor': 'middle',
				'dominant-baseline': 'central',
				'font-family': 'var(--ui)',
				'font-weight': cardinal ? 800 : 700,
				'font-size': cardinal ? 18 : 14,
				fill: 'var(--ink)',
			}),
		);
	}

	// Aiguille des minutes : longue, fine, corail.
	const [mx, my] = pointOnCircle(CX, CY, 80, minuteAngle);
	parts.push(
		line(CX, CY, mx, my, {
			stroke: 'var(--clock-min)',
			'stroke-width': 5.5,
			'stroke-linecap': 'round',
		}),
	);
	// Aiguille des heures : courte, épaisse, bleue.
	const [hx, hy] = pointOnCircle(CX, CY, 52, hourAngle);
	parts.push(
		line(CX, CY, hx, hy, {
			stroke: 'var(--blue)',
			'stroke-width': 8.5,
			'stroke-linecap': 'round',
		}),
	);
	// Moyeu central : couvre proprement la jonction des aiguilles.
	parts.push(circle(CX, CY, 6, { fill: 'var(--ink)' }));

	// Accessibilité : description NEUTRE (ne souffle pas l'heure à lire).
	const svg = svgCanvas(
		CLOCK_SIZE,
		CLOCK_SIZE,
		'Horloge à aiguilles',
		'Horloge',
		"Cadran d'horloge à aiguilles : lis l'heure indiquée par la petite et la grande aiguille.",
		parts.join(''),
		'figure-horloge-svg',
	);

	// Légende (jamais l'info par la seule couleur) : rappelle le rôle des aiguilles.
	const legende =
		`<p class="clock-legend">` +
		`<span class="cl-dot cl-h" aria-hidden="true">●</span> petite&nbsp;= heures ` +
		`· <span class="cl-dot cl-m" aria-hidden="true">●</span> grande&nbsp;= minutes</p>`;

	return `<div class="figure-horloge">${svg}${legende}</div>`;
}

/* ---------- Polygone coté (#99 — périmètre) ----------
   Polygone (rectangle, triangle, figure en L…) dessiné À L'ÉCHELLE depuis ses
   sommets (coordonnées « maths », y vers le haut), chaque côté portant sa mesure
   à l'extérieur du contour. Les sommets sont fournis dans l'ordre du parcours ;
   `labels[i]` cote le côté `points[i] → points[i+1]` (une chaîne vide = côté non
   coté, ex. dimensions déduites). Mise à l'échelle automatique dans le viewBox. */
const POLY_SIZE = 200;
const POLY_PAD = 32; // marge pour loger les cotes hors du contour

export function renderPolygoneCote(points: Array<[number, number]>, labels: string[]): string {
	const xs = points.map((p) => p[0]);
	const ys = points.map((p) => p[1]);
	const minX = Math.min(...xs);
	const maxX = Math.max(...xs);
	const minY = Math.min(...ys);
	const maxY = Math.max(...ys);
	const w = maxX - minX || 1;
	const h = maxY - minY || 1;
	const scale = Math.min((POLY_SIZE - 2 * POLY_PAD) / w, (POLY_SIZE - 2 * POLY_PAD) / h);
	const offX = (POLY_SIZE - w * scale) / 2;
	const offY = (POLY_SIZE - h * scale) / 2;
	// Repère maths (y haut) → SVG (y bas), centré.
	const T = ([x, y]: [number, number]): [number, number] => [
		r2(offX + (x - minX) * scale),
		r2(offY + (maxY - y) * scale),
	];
	const tp = points.map(T);
	const cx = tp.reduce((s, p) => s + p[0], 0) / tp.length;
	const cy = tp.reduce((s, p) => s + p[1], 0) / tp.length;

	const body: string[] = [
		polygon(tp, {
			fill: 'var(--blue-soft)',
			stroke: 'var(--blue)',
			'stroke-width': 2.5,
			'stroke-linejoin': 'round',
		}),
	];
	for (let i = 0; i < tp.length; i++) {
		const lab = labels[i];
		if (!lab) continue; // côté non coté
		const a = tp[i];
		const b = tp[(i + 1) % tp.length];
		const mx = (a[0] + b[0]) / 2;
		const my = (a[1] + b[1]) / 2;
		// Normale au côté, orientée vers l'EXTÉRIEUR (à l'opposé du centre).
		let nx = -(b[1] - a[1]);
		let ny = b[0] - a[0];
		const len = Math.hypot(nx, ny) || 1;
		nx /= len;
		ny /= len;
		if ((mx - cx) * nx + (my - cy) * ny < 0) {
			nx = -nx;
			ny = -ny;
		}
		body.push(
			text(r2(mx + nx * 15), r2(my + ny * 15), lab, {
				'text-anchor': 'middle',
				'dominant-baseline': 'central',
				'font-family': 'var(--ui)',
				'font-weight': 700,
				'font-size': 13,
				fill: 'var(--ink)',
			}),
		);
	}
	return svgCanvas(
		POLY_SIZE,
		POLY_SIZE,
		'Figure géométrique cotée',
		'Figure cotée',
		'Figure avec la mesure de chaque côté ; calcule le périmètre (le tour).',
		body.join(''),
		'figure-polygone',
	);
}

/* ---------- Quadrillage (#99 — périmètre sur grille) ----------
   Figure rectiligne posée sur un quadrillage : cellules remplies + CONTOUR
   surligné (on compte les côtés de carreaux du tour). `cells` = cases pleines
   en coordonnées grille (x = colonne, y = ligne depuis le haut). */

/** Côtés unitaires formant le contour d'un ensemble de cases (segments en
    coordonnées de coins de grille). Sa longueur = périmètre en côtés de carreaux. */
export function boundaryEdges(
	cells: Array<[number, number]>,
): Array<[[number, number], [number, number]]> {
	const set = new Set(cells.map(([x, y]) => `${x},${y}`));
	const has = (x: number, y: number) => set.has(`${x},${y}`);
	const edges: Array<[[number, number], [number, number]]> = [];
	for (const [x, y] of cells) {
		if (!has(x, y - 1))
			edges.push([
				[x, y],
				[x + 1, y],
			]); // haut
		if (!has(x + 1, y))
			edges.push([
				[x + 1, y],
				[x + 1, y + 1],
			]); // droite
		if (!has(x, y + 1))
			edges.push([
				[x + 1, y + 1],
				[x, y + 1],
			]); // bas
		if (!has(x - 1, y))
			edges.push([
				[x, y + 1],
				[x, y],
			]); // gauche
	}
	return edges;
}

const GRID_CELL = 22; // côté d'une case (unités viewBox)
const GRID_PAD = 8;

export function renderQuadrillage(
	cols: number,
	rows: number,
	cells: Array<[number, number]>,
): string {
	const W = cols * GRID_CELL + 2 * GRID_PAD;
	const H = rows * GRID_CELL + 2 * GRID_PAD;
	const px = (c: number) => GRID_PAD + c * GRID_CELL;
	const body: string[] = [];
	// Trame du quadrillage (discrète).
	for (let i = 0; i <= cols; i++)
		body.push(
			line(px(i), px(0), px(i), GRID_PAD + rows * GRID_CELL, {
				stroke: 'var(--muted)',
				'stroke-width': 1,
			}),
		);
	for (let j = 0; j <= rows; j++)
		body.push(
			line(px(0), GRID_PAD + j * GRID_CELL, GRID_PAD + cols * GRID_CELL, GRID_PAD + j * GRID_CELL, {
				stroke: 'var(--muted)',
				'stroke-width': 1,
			}),
		);
	// Cases pleines.
	for (const [x, y] of cells)
		body.push(rect(px(x), px(y), GRID_CELL, GRID_CELL, { fill: 'var(--blue-soft)' }));
	// Contour surligné (on compte CES côtés).
	for (const [[ax, ay], [bx, by]] of boundaryEdges(cells))
		body.push(
			line(px(ax), px(ay), px(bx), px(by), {
				stroke: 'var(--clock-min)',
				'stroke-width': 4,
				'stroke-linecap': 'round',
			}),
		);
	return svgCanvas(
		W,
		H,
		'Figure sur quadrillage',
		'Figure sur quadrillage',
		'Figure rectiligne sur un quadrillage ; compte les côtés de carreaux qui font le tour.',
		body.join(''),
		'figure-quadrillage',
	);
}

/* ---------- Dispatch par données (point d'extension) ---------- */

/** Description d'une figure par données. Étendre l'union + le switch ci-dessous
    pour chaque nouvelle figure (cercle coté #102, solide #103…). */
export type FigureSpec =
	| { kind: 'horloge'; heures: number; minutes: number }
	| { kind: 'polygoneCote'; points: Array<[number, number]>; labels: string[] }
	| { kind: 'quadrillage'; cols: number; rows: number; cells: Array<[number, number]> };

export function renderFigure(spec: FigureSpec): string {
	switch (spec.kind) {
		case 'horloge':
			return renderHorloge(spec.heures, spec.minutes);
		case 'polygoneCote':
			return renderPolygoneCote(spec.points, spec.labels);
		case 'quadrillage':
			return renderQuadrillage(spec.cols, spec.rows, spec.cells);
	}
}
