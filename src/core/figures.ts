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
		circle(CX, CY, 92, { fill: 'var(--paper)', stroke: 'var(--accent)', 'stroke-width': 4 }),
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
			stroke: 'var(--accent)',
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
			fill: 'var(--accent-soft)',
			stroke: 'var(--accent)',
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
		body.push(rect(px(x), px(y), GRID_CELL, GRID_CELL, { fill: 'var(--accent-soft)' }));
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

/* ---------- Figures planes (#100 — reconnaissance) ----------
   Formes pleines (remplissage `--accent-soft` + contour `--accent`) à reconnaître,
   SANS cote. On part de sommets canoniques (carré unité), on tourne autour du
   centre puis on met à l'échelle pour tenir dans une case. Calibrage (avis
   designer + pedagogue) : trait franc (3), losange à diagonales INÉGALES (pas un
   carré tourné), carré incliné ~30-40° (pas 45° → indécidable vs losange),
   monochrome (la couleur ne doit pas être un indice de tri). */

export type PlaneShape =
	| 'carre'
	| 'rectangle'
	| 'triangle'
	| 'triangleRectangle'
	| 'losange'
	| 'cercle'
	| 'parallelogramme'; // distracteur visuel uniquement (jamais à nommer au CE2)

// Sommets canoniques dans le carré unité [0,1]² (y vers le bas ; la rotation gère
// l'orientation, le centrage gère la position). Le cercle est traité à part.
const SHAPE_POINTS: Record<Exclude<PlaneShape, 'cercle'>, Array<[number, number]>> = {
	carre: [
		[0, 0],
		[1, 0],
		[1, 1],
		[0, 1],
	],
	rectangle: [
		[0, 0],
		[1, 0],
		[1, 0.62],
		[0, 0.62],
	],
	triangle: [
		[0.5, 0],
		[1, 1],
		[0, 1],
	],
	triangleRectangle: [
		[0, 0],
		[0, 1],
		[1, 1],
	],
	losange: [
		[0.5, 0.18],
		[1, 0.5],
		[0.5, 0.82],
		[0, 0.5],
	], // diagonales inégales
	parallelogramme: [
		[0.25, 0],
		[1, 0],
		[0.75, 1],
		[0, 1],
	],
};

const SHAPE_FILL = {
	fill: 'var(--accent-soft)',
	stroke: 'var(--accent)',
	'stroke-width': 3,
	'stroke-linejoin': 'round',
} as const;

function rotateAbout([x, y]: [number, number], deg: number): [number, number] {
	const r = (deg * Math.PI) / 180;
	const dx = x - 0.5;
	const dy = y - 0.5;
	return [0.5 + dx * Math.cos(r) - dy * Math.sin(r), 0.5 + dx * Math.sin(r) + dy * Math.cos(r)];
}

/* Une forme remplie, ajustée et centrée dans la case [cx±box/2, cy±box/2]. */
function shapeBody(shape: PlaneShape, cx: number, cy: number, box: number, rotDeg: number): string {
	const inner = box * 0.78; // marge interne ~11 %
	if (shape === 'cercle') return circle(r2(cx), r2(cy), r2(inner / 2), SHAPE_FILL);
	const pts = SHAPE_POINTS[shape].map((p) => rotateAbout(p, rotDeg));
	const xs = pts.map((p) => p[0]);
	const ys = pts.map((p) => p[1]);
	const minX = Math.min(...xs);
	const maxX = Math.max(...xs);
	const minY = Math.min(...ys);
	const maxY = Math.max(...ys);
	const w = maxX - minX || 1;
	const h = maxY - minY || 1;
	const s = inner / Math.max(w, h);
	const offX = cx - (minX + w / 2) * s;
	const offY = cy - (minY + h / 2) * s;
	const fitted = pts.map(([x, y]): [number, number] => [r2(offX + x * s), r2(offY + y * s)]);
	return polygon(fitted, SHAPE_FILL);
}

const PLANE_SIZE = 200;

/** Figure unique à reconnaître (option rotation pour varier l'orientation). */
export function renderFigurePlane(shape: PlaneShape, rotation = 0): string {
	return svgCanvas(
		PLANE_SIZE,
		PLANE_SIZE,
		'Figure géométrique',
		'Figure géométrique',
		'Une figure plane à reconnaître : observe ses côtés et ses angles, puis nomme-la.',
		shapeBody(shape, PLANE_SIZE / 2, PLANE_SIZE / 2, PLANE_SIZE, rotation),
		'figure-plane',
	);
}

/** Scène de plusieurs figures (comptage) : grille régulière, monochrome — la
    couleur ne doit jamais devenir l'indice (on discrimine la FORME). */
export function renderSceneFigures(cells: Array<{ shape: PlaneShape; rotation?: number }>): string {
	const n = cells.length;
	const cols = n <= 2 ? n : n <= 4 ? 2 : 3;
	const rows = Math.ceil(n / cols);
	const cell = 100;
	const W = cols * cell;
	const H = rows * cell;
	const body = cells
		.map((c, i) => {
			const col = i % cols;
			const row = Math.floor(i / cols);
			return shapeBody(
				c.shape,
				col * cell + cell / 2,
				row * cell + cell / 2,
				cell,
				c.rotation ?? 0,
			);
		})
		.join('');
	return svgCanvas(
		W,
		H,
		'Figures à compter',
		'Figures à compter',
		'Plusieurs figures planes : compte celles qui ont la forme demandée.',
		body,
		'figure-scene',
	);
}

/* ---------- Cercle coté (#102 — rayon, diamètre, vocabulaire) ----------
   Cercle avec son centre ; un segment (rayon : centre→bord, ou diamètre :
   bord→bord par le centre) peut être mis en évidence et coté (ou marqué « ? »
   pour une question de vocabulaire). */
export function renderCercle(segment?: 'rayon' | 'diametre', label?: string): string {
	const cx = 100;
	const cy = 100;
	const r = 70;
	const body: string[] = [
		circle(cx, cy, r, { fill: 'var(--accent-soft)', stroke: 'var(--accent)', 'stroke-width': 3 }),
	];
	if (segment === 'diametre')
		body.push(
			line(cx - r, cy, cx + r, cy, {
				stroke: 'var(--clock-min)',
				'stroke-width': 4,
				'stroke-linecap': 'round',
			}),
		);
	else if (segment === 'rayon')
		body.push(
			line(cx, cy, cx + r, cy, {
				stroke: 'var(--clock-min)',
				'stroke-width': 4,
				'stroke-linecap': 'round',
			}),
		);
	body.push(circle(cx, cy, 4, { fill: 'var(--ink)' })); // centre marqué
	if (label) {
		const lx = segment === 'rayon' ? cx + r / 2 : cx;
		body.push(
			text(lx, cy - 10, label, {
				'text-anchor': 'middle',
				'font-family': 'var(--ui)',
				'font-weight': 700,
				'font-size': 14,
				fill: 'var(--ink)',
			}),
		);
	}
	return svgCanvas(
		200,
		200,
		'Cercle',
		'Cercle',
		`Un cercle avec son centre${segment ? ' et un segment mis en évidence' : ''}.`,
		body.join(''),
		'figure-cercle',
	);
}

/* ---------- Solides en perspective (#103 — reconnaissance) ----------
   Schémas en perspective cavalière, SANS arêtes cachées (avis designer) : face
   avant pleine (`--accent-soft` + contour `--accent`), arêtes de profondeur en
   contour atténué (opacité 0,55). Monochrome, orientation STABLE (jamais de
   rotation : un solide retourné devient illisible). Le but est de RECONNAÎTRE
   la silhouette, pas de compter les faces. */
export type Solid = 'cube' | 'pave' | 'cylindre' | 'cone' | 'pyramide' | 'boule';

const SOLID_SIZE = 200;
const DEPTH = {
	fill: 'none',
	stroke: 'var(--accent)',
	'stroke-width': 2,
	opacity: 0.55,
	'stroke-linecap': 'round',
} as const;

/* Boîte (cube / pavé droit) : face avant pleine + 3 arêtes de fuite + 2 arêtes
   arrière visibles (les 3 arêtes du fond cachées sont omises). */
function boite(x: number, y: number, w: number, h: number, ox: number, oy: number): string {
	const TL: [number, number] = [x, y];
	const TR: [number, number] = [x + w, y];
	const BR: [number, number] = [x + w, y + h];
	const BL: [number, number] = [x, y + h];
	const off = (p: [number, number]): [number, number] => [p[0] + ox, p[1] + oy];
	const seg = (a: [number, number], b: [number, number]) => line(a[0], a[1], b[0], b[1], DEPTH);
	return (
		seg(TR, off(TR)) +
		seg(BR, off(BR)) +
		seg(TL, off(TL)) +
		seg(off(TL), off(TR)) +
		seg(off(TR), off(BR)) +
		polygon([TL, TR, BR, BL], SHAPE_FILL) // face avant par-dessus les arêtes
	);
}

export function renderSolide(solid: Solid): string {
	let body = '';
	switch (solid) {
		case 'cube':
			body = boite(45, 80, 80, 80, 34, -26);
			break;
		case 'pave':
			body = boite(34, 96, 110, 56, 30, -24);
			break;
		case 'cylindre':
			body =
				rect(55, 60, 90, 90, { fill: 'var(--accent-soft)' }) +
				line(55, 60, 55, 150, { stroke: 'var(--accent)', 'stroke-width': 3 }) +
				line(145, 60, 145, 150, { stroke: 'var(--accent)', 'stroke-width': 3 }) +
				ellipse(100, 150, 45, 14, SHAPE_FILL) +
				ellipse(100, 60, 45, 14, SHAPE_FILL);
			break;
		case 'cone':
			body =
				polygon(
					[
						[100, 40],
						[55, 150],
						[145, 150],
					],
					SHAPE_FILL,
				) + ellipse(100, 150, 45, 14, SHAPE_FILL);
			break;
		case 'pyramide': {
			const A: [number, number] = [108, 42];
			const FL: [number, number] = [50, 158];
			const FR: [number, number] = [138, 158];
			const BR: [number, number] = [168, 134];
			const BL: [number, number] = [80, 134];
			body =
				line(A[0], A[1], BR[0], BR[1], DEPTH) +
				line(FR[0], FR[1], BR[0], BR[1], DEPTH) +
				line(BR[0], BR[1], BL[0], BL[1], DEPTH) +
				line(BL[0], BL[1], FL[0], FL[1], DEPTH) +
				line(A[0], A[1], BL[0], BL[1], DEPTH) +
				polygon([A, FL, FR], SHAPE_FILL); // face avant par-dessus
			break;
		}
		case 'boule':
			body =
				circle(100, 100, 60, SHAPE_FILL) +
				ellipse(100, 100, 60, 18, {
					fill: 'none',
					stroke: 'var(--accent)',
					'stroke-width': 2,
					opacity: 0.5,
				});
			break;
	}
	return svgCanvas(
		SOLID_SIZE,
		SOLID_SIZE,
		'Solide',
		'Solide',
		'Un solide dessiné en volume à reconnaître : observe sa forme, puis nomme-le.',
		body,
		'figure-solide',
	);
}

/* ---------- Fractions (#200 — sens, égalités, comparaison, bande graduée) ----------
   Modèle visuel UNIQUE (avis designer-ux-enfant) : la BARRE horizontale divisée en
   colonnes verticales d'égale largeur (métaphore « plaquette de chocolat »), pour
   toutes les fractions (dénominateur 2..12). Les parts sont RIGOUREUSEMENT égales
   (largeur = W/dén, garantie par le code — exigence absolue de l'issue : une part
   inégale serait un contresens). Distinction coloriée / vide par DOUBLE signal (jamais
   la seule couleur) : remplissage `--accent-soft` ET un point plein central `--accent`
   sur les parts coloriées (robuste au daltonisme), contour franc partout. */

const FRAC_W = 320; // largeur viewBox des figures « barre » (plus large que haut)
const FRAC_BAR_X = 20; // marge gauche de la barre
const FRAC_BAR_W = 280; // largeur utile de la barre (parts = FRAC_BAR_W / dén)

/* Une barre divisée en `den` parts égales, les `num` premières coloriées. */
function barre(x0: number, y: number, w: number, h: number, num: number, den: number): string {
	const partW = w / den;
	const parts: string[] = [];
	for (let i = 0; i < den; i++) {
		const x = x0 + i * partW;
		const plein = i < num;
		parts.push(
			rect(r2(x), r2(y), r2(partW), r2(h), {
				fill: plein ? 'var(--accent-soft)' : 'var(--paper)',
				stroke: 'var(--accent)',
				'stroke-width': 2,
			}),
		);
		// Point central : signal de forme redondant (parts pleines lisibles sans la couleur).
		if (plein) parts.push(circle(r2(x + partW / 2), r2(y + h / 2), 3.5, { fill: 'var(--accent)' }));
	}
	return parts.join('');
}

/** Barre unique : `num` parts coloriées sur `den` (« quelle fraction est coloriée ? »). */
export function renderFractionBarre(num: number, den: number): string {
	const H = 140;
	const barH = 70;
	const y0 = (H - barH) / 2;
	return svgCanvas(
		FRAC_W,
		H,
		'Fraction',
		'Fraction',
		// On annonce le nombre de parts (aide le lecteur d'écran à dénombrer) mais
		// JAMAIS le nombre de coloriées : ce serait souffler le numérateur (la réponse).
		`Une barre partagée en ${den} parts égales ; certaines parts sont coloriées.`,
		barre(FRAC_BAR_X, y0, FRAC_BAR_W, barH, num, den),
		'figure-fraction',
	);
}

/** Bande graduée de 0 à 1 (`den` intervalles) avec un repère sur la `num`-ième graduation. */
export function renderFractionBande(num: number, den: number): string {
	const W = FRAC_W;
	const H = 120;
	const x0 = 30;
	const x1 = 290;
	const axisY = 64;
	const span = x1 - x0;
	const body: string[] = [
		line(x0, axisY, x1, axisY, {
			stroke: 'var(--ink)',
			'stroke-width': 2.5,
			'stroke-linecap': 'round',
		}),
	];
	// Graduations : bornes (0 et 1) renforcées, intermédiaires discrètes.
	for (let i = 0; i <= den; i++) {
		const x = x0 + (i * span) / den;
		const borne = i === 0 || i === den;
		const len = borne ? 14 : 9;
		body.push(
			line(r2(x), axisY - len, r2(x), axisY, {
				stroke: borne ? 'var(--ink)' : 'var(--grey)',
				'stroke-width': borne ? 2.5 : 1.5,
				'stroke-linecap': 'round',
			}),
		);
	}
	// Repère (mise en évidence corail : sa fonction officielle dans le moteur).
	const cx = x0 + (num * span) / den;
	body.push(
		line(r2(cx), axisY, r2(cx), axisY - 22, {
			stroke: 'var(--clock-min)',
			'stroke-width': 2.5,
			'stroke-linecap': 'round',
		}),
	);
	body.push(circle(r2(cx), axisY - 22, 6, { fill: 'var(--clock-min)' }));
	// Bornes 0 et 1 (sens de la graduation ; jamais la fraction, qui soufflerait la réponse).
	const lab = {
		'text-anchor': 'middle',
		'font-family': 'var(--ui)',
		'font-weight': 700,
		'font-size': 16,
		fill: 'var(--ink)',
	};
	body.push(text(x0, axisY + 26, '0', lab));
	body.push(text(x1, axisY + 26, '1', lab));
	return svgCanvas(
		W,
		H,
		'Bande graduée',
		'Bande graduée',
		// On annonce le nombre de parts, jamais la position du repère (la réponse).
		`Une bande de 0 à 1 partagée en ${den} parts égales, avec un repère sur une graduation.`,
		body.join(''),
		'figure-fraction-bande',
	);
}

/** Deux barres de MÊME longueur empilées (égalités / comparaison) : alignées à gauche
    pour que la comparaison des longueurs coloriées soit visuellement honnête. */
export function renderFractionPaire(haut: [number, number], bas: [number, number]): string {
	const H = 180;
	const barH = 55;
	const yHaut = 30;
	const yBas = yHaut + barH + 20;
	return svgCanvas(
		FRAC_W,
		H,
		'Deux fractions',
		'Deux fractions',
		'Deux barres de même longueur partagées en parts égales ; compare les parts coloriées.',
		barre(FRAC_BAR_X, yHaut, FRAC_BAR_W, barH, haut[0], haut[1]) +
			barre(FRAC_BAR_X, yBas, FRAC_BAR_W, barH, bas[0], bas[1]),
		'figure-fraction-paire',
	);
}

/** Somme de deux fractions de même dénominateur : les deux termes empilés, séparés
    par un « + » (on additionne les numérateurs, le dénominateur ne change pas). */
export function renderFractionSomme(a: [number, number], b: [number, number]): string {
	const H = 180;
	const barH = 55;
	const yHaut = 30;
	const yBas = yHaut + barH + 20;
	const plus = text(FRAC_W / 2, (yHaut + barH + yBas) / 2, '+', {
		'text-anchor': 'middle',
		'dominant-baseline': 'central',
		'font-family': 'var(--ui)',
		'font-weight': 800,
		'font-size': 22,
		fill: 'var(--ink)',
	});
	return svgCanvas(
		FRAC_W,
		H,
		'Addition de deux fractions',
		'Addition de fractions',
		'Deux fractions de même dénominateur à additionner, illustrées par deux barres.',
		barre(FRAC_BAR_X, yHaut, FRAC_BAR_W, barH, a[0], a[1]) +
			plus +
			barre(FRAC_BAR_X, yBas, FRAC_BAR_W, barH, b[0], b[1]),
		'figure-fraction-somme',
	);
}

/** Collection de `den × parGroupe` jetons rangés en `den` groupes égaux, `num` coloriés
    (sens partitif sur le discret : « 1/2 de 8 », `num` paquets sur `den`). */
export function renderFractionCollection(num: number, den: number, parGroupe: number): string {
	const cols = parGroupe <= 2 ? 1 : 2;
	const rows = Math.ceil(parGroupe / cols);
	const dotR = 7;
	const dotGap = 22;
	const pad = 9;
	const groupGap = 12;
	const margin = 16;
	const boxW = cols * dotGap + 2 * pad;
	const boxH = rows * dotGap + 2 * pad;
	const W = 2 * margin + den * boxW + (den - 1) * groupGap;
	const H = 2 * margin + boxH;
	const body: string[] = [];
	for (let g = 0; g < den; g++) {
		const gx = margin + g * (boxW + groupGap);
		const plein = g < num;
		body.push(
			rect(r2(gx), margin, r2(boxW), r2(boxH), {
				rx: 8,
				fill: plein ? 'var(--accent-soft)' : 'var(--paper)',
				// Contour des groupes vides en `--grey` (≥ 3:1 sur blanc) plutôt que `--muted`
				// (sous le seuil WCAG 1.4.11) : le contour code l'état vide/plein, il doit rester
				// perceptible en basse vision (le jeton creux n'est qu'un second signal).
				stroke: plein ? 'var(--accent)' : 'var(--grey)',
				'stroke-width': 2,
			}),
		);
		for (let d = 0; d < parGroupe; d++) {
			const c = d % cols;
			const r = Math.floor(d / cols);
			const cx = gx + pad + dotGap / 2 + c * dotGap;
			const cy = margin + pad + dotGap / 2 + r * dotGap;
			// Jetons pleins (accent) dans les groupes coloriés ; contour seul ailleurs.
			body.push(
				circle(r2(cx), r2(cy), dotR, {
					fill: plein ? 'var(--accent)' : 'var(--paper)',
					stroke: plein ? 'var(--accent)' : 'var(--grey)',
					'stroke-width': 1.5,
				}),
			);
		}
	}
	return svgCanvas(
		W,
		H,
		'Collection en parts égales',
		'Collection',
		// On annonce la structure (groupes × jetons), jamais le nombre de groupes coloriés.
		`Des jetons rangés en ${den} groupes égaux de ${parGroupe} ; certains groupes sont coloriés.`,
		body.join(''),
		'figure-fraction-collection',
	);
}

/* ---------- Symétrie axiale (#201 — reconnaître) ----------
   Toutes les interactions sont en RECONNAISSANCE (jamais tracer, cf. attendu
   CE2). Deux renderers, selon le format de question :
   - `renderSymJuger(shape, axis?)` : une figure seule (format 1 « a-t-elle un
     axe ? ») ou une figure surmontée d'un axe proposé en pointillé (format 2
     « cet axe est-il correct ? ») ;
   - `renderSymReflet(motif, axis, cells)` : trois propositions A/B/C, chacune
     montrant une figure et son image de l'autre côté du « miroir » (l'axe) ;
     l'enfant désigne le vrai REFLET (format 3, cœur de la leçon).
   Partis pris (avis pedagogue-primaire + gamification-enfant) :
   - symétrie EXACTE par construction : le reflet est calculé par réflexion des
     points placés (pixel-perfect), jamais dessiné « à la main » ;
   - distracteurs FORMATEURS au format 3 : une figure « glissée » (translation,
     même sens) et une « tournée » (rotation d'un demi-tour) à distinguer du
     reflet (retourné) → les motifs sont FRANCHEMENT asymétriques (chiraux) ;
   - axe en pointillé corail, jamais SEUL indice : c'est le pliage/la forme qui
     décide ; l'habillage « miroir » est porté par la consigne, pas par un décor. */

/** Figures du format 1/2 : on JUGE un axe. Symétriques (carré, rectangle…,
    papillon, cœur, lettres A/H/T) ou non (triangle scalène, fanion, F, L). */
export type SymShape =
	| 'carre'
	| 'rectangle'
	| 'triangleIso'
	| 'losange'
	| 'papillon'
	| 'coeur'
	| 'lettreA'
	| 'lettreH'
	| 'lettreT'
	| 'triangleScalene'
	| 'fanion'
	| 'lettreF'
	| 'lettreL';

/** Orientation d'un axe : vertical, horizontal, diagonale « \ » (d1), diagonale « / » (d2). */
export type SymAxis = 'v' | 'h' | 'd1' | 'd2';
/** Motifs chiraux du format 3 (asymétriques dans les deux sens). */
export type SymMotif = 'drapeau' | 'botte';
/** Transformation appliquée au motif pour fabriquer une proposition. */
export type SymTransform = 'reflet' | 'glisse' | 'tourne';

type SymPt = [number, number];
type SymPlace = (ux: number, uy: number) => SymPt;

const SYM_SIZE = 200;
const SYM_PAD = 26;

const SYM_DASH = {
	stroke: 'var(--clock-min)',
	'stroke-width': 3.5,
	'stroke-dasharray': '8 6',
	'stroke-linecap': 'round',
} as const;

/* Halo `--paper` SOUS le pointillé corail : garantit le contraste ≥ 3:1 (WCAG
   1.4.11) là où l'axe traverse le remplissage clair d'une figure (avis
   relecteur-accessibilite, #201). Halo lui-même pointillé (même motif, un peu
   plus large) → on ne « bouche » pas les espaces : l'indice non chromatique
   (les tirets) reste lisible et la figure transparaît entre les tirets. */
const SYM_HALO = {
	stroke: 'var(--paper)',
	'stroke-width': 6.5,
	'stroke-dasharray': '8 6',
	'stroke-linecap': 'round',
} as const;

/* Segment d'axe en pointillé corail, halo blanc dessous (contraste garanti). */
function symDashedSeg(a: SymPt, b: SymPt): string {
	return line(a[0], a[1], b[0], b[1], SYM_HALO) + line(a[0], a[1], b[0], b[1], SYM_DASH);
}

/* Parts pleines d'une figure « à juger », composées dans le carré unité [0,1]²
   (y vers le bas). `P` place un point unité dans le viewBox, `s` est l'échelle
   (longueur d'une unité, pour les rayons). Symétrie assurée PAR CONSTRUCTION
   (les formes à axe vertical sont définies symétriques autour de x = 0,5). */
function symShapeBody(shape: SymShape, P: SymPlace, s: number): string {
	const pol = (pts: SymPt[]): string =>
		polygon(
			pts.map(([x, y]) => P(x, y)),
			SHAPE_FILL,
		);
	const ur = (x: number, y: number, w: number, h: number): string => {
		const [px, py] = P(x, y);
		return rect(px, py, r2(w * s), r2(h * s), SHAPE_FILL);
	};
	const ci = (cx: number, cy: number, rr: number): string => {
		const [px, py] = P(cx, cy);
		return circle(px, py, r2(rr * s), SHAPE_FILL);
	};
	const el = (cx: number, cy: number, rx: number, ry: number): string => {
		const [px, py] = P(cx, cy);
		return ellipse(px, py, r2(rx * s), r2(ry * s), SHAPE_FILL);
	};
	switch (shape) {
		case 'carre':
			return pol([
				[0.08, 0.08],
				[0.92, 0.08],
				[0.92, 0.92],
				[0.08, 0.92],
			]);
		case 'rectangle':
			return pol([
				[0.04, 0.28],
				[0.96, 0.28],
				[0.96, 0.72],
				[0.04, 0.72],
			]);
		case 'triangleIso':
			return pol([
				[0.5, 0.07],
				[0.92, 0.93],
				[0.08, 0.93],
			]);
		case 'losange':
			return pol([
				[0.5, 0.06],
				[0.86, 0.5],
				[0.5, 0.94],
				[0.14, 0.5],
			]);
		case 'papillon':
			return (
				el(0.31, 0.37, 0.17, 0.13) +
				el(0.69, 0.37, 0.17, 0.13) +
				el(0.34, 0.65, 0.13, 0.1) +
				el(0.66, 0.65, 0.13, 0.1) +
				ur(0.47, 0.28, 0.06, 0.46)
			);
		case 'coeur':
			return (
				ci(0.32, 0.36, 0.2) +
				ci(0.68, 0.36, 0.2) +
				pol([
					[0.12, 0.42],
					[0.88, 0.42],
					[0.5, 0.93],
				])
			);
		case 'lettreA':
			return (
				pol([
					[0.4, 0.08],
					[0.52, 0.08],
					[0.28, 0.92],
					[0.12, 0.92],
				]) +
				pol([
					[0.6, 0.08],
					[0.48, 0.08],
					[0.72, 0.92],
					[0.88, 0.92],
				]) +
				ur(0.3, 0.58, 0.4, 0.14)
			);
		case 'lettreH':
			return ur(0.16, 0.08, 0.18, 0.84) + ur(0.66, 0.08, 0.18, 0.84) + ur(0.16, 0.41, 0.68, 0.18);
		case 'lettreT':
			return ur(0.1, 0.08, 0.8, 0.2) + ur(0.4, 0.08, 0.2, 0.84);
		case 'triangleScalene':
			return pol([
				[0.08, 0.92],
				[0.92, 0.92],
				[0.66, 0.1],
			]);
		case 'fanion':
			return pol([
				[0.2, 0.06],
				[0.34, 0.06],
				[0.9, 0.28],
				[0.34, 0.46],
				[0.34, 0.94],
				[0.2, 0.94],
			]);
		case 'lettreF':
			return ur(0.22, 0.08, 0.18, 0.84) + ur(0.22, 0.08, 0.5, 0.18) + ur(0.22, 0.4, 0.38, 0.16);
		case 'lettreL':
			return ur(0.28, 0.08, 0.18, 0.84) + ur(0.28, 0.74, 0.5, 0.18);
	}
}

/* Trait d'axe (pointillé corail) débordant légèrement la figure, selon l'orientation. */
function symAxisLine(axis: SymAxis, P: SymPlace): string {
	let a: SymPt, b: SymPt;
	switch (axis) {
		case 'v':
			a = P(0.5, -0.08);
			b = P(0.5, 1.08);
			break;
		case 'h':
			a = P(-0.08, 0.5);
			b = P(1.08, 0.5);
			break;
		case 'd1': // « \ »
			a = P(-0.04, -0.04);
			b = P(1.04, 1.04);
			break;
		case 'd2': // « / »
			a = P(1.04, -0.04);
			b = P(-0.04, 1.04);
			break;
	}
	return symDashedSeg(a, b);
}

/** Format 1 (sans `axis`) / format 2 (avec `axis`) : une figure à juger, et,
    le cas échéant, l'axe proposé en pointillé. Description NEUTRE (ne souffle
    pas la réponse). */
export function renderSymJuger(shape: SymShape, axis?: SymAxis): string {
	const S = SYM_SIZE - 2 * SYM_PAD;
	const P: SymPlace = (ux, uy) => [r2(SYM_PAD + ux * S), r2(SYM_PAD + uy * S)];
	const body = symShapeBody(shape, P, S) + (axis ? symAxisLine(axis, P) : '');
	const desc = axis
		? 'Une figure et un trait proposé en pointillé : ce trait est-il un axe de symétrie ?'
		: 'Une figure : possède-t-elle un axe de symétrie ?';
	return svgCanvas(
		SYM_SIZE,
		SYM_SIZE,
		'Figure de symétrie',
		'Figure',
		desc,
		body,
		'figure-symetrie',
	);
}

/* Motifs chiraux du format 3, dans le carré unité [0,1]². Asymétriques dans les
   DEUX sens (aucun axe, aucune symétrie de rotation) : indispensable pour que
   « reflet », « glissé » et « tourné » donnent trois images distinctes. */
const SYM_MOTIFS: Record<SymMotif, SymPt[]> = {
	drapeau: [
		[0.2, 0.1],
		[0.34, 0.1],
		[0.86, 0.3],
		[0.34, 0.46],
		[0.34, 0.9],
		[0.2, 0.9],
	],
	botte: [
		[0.22, 0.1],
		[0.46, 0.1],
		[0.46, 0.62],
		[0.82, 0.62],
		[0.82, 0.9],
		[0.22, 0.9],
	],
};

/** Format 3 : trois propositions étiquetées (A/B/C). Dans chaque cellule, le
    motif d'origine et son image de l'autre côté du miroir (axe `v` ou `h`).
    `cells[i].t` décrit la transformation de l'image (le runner ne connaît que
    le label correct, calculé côté données). */
export function renderSymReflet(
	motif: SymMotif,
	axis: 'v' | 'h',
	cells: Array<{ t: SymTransform; label: string }>,
): string {
	const cw = 160;
	const labelH = 30;
	const W = cells.length * cw;
	const H = cw + labelH;
	const unit = SYM_MOTIFS[motif];
	const body: string[] = [];

	cells.forEach((cell, i) => {
		const ox0 = i * cw;
		// Région du motif d'origine (gauche si axe vertical, haut si horizontal).
		const reg =
			axis === 'v'
				? { x: 16, y: 22, w: cw / 2 - 28, h: cw - 44 }
				: { x: 22, y: 16, w: cw - 44, h: cw / 2 - 28 };
		const S = Math.min(reg.w, reg.h);
		const sx = reg.x + (reg.w - S) / 2;
		const sy = reg.y + (reg.h - S) / 2;
		// Points du motif d'origine, en coordonnées LOCALES à la cellule.
		const base: SymPt[] = unit.map(([ux, uy]) => [sx + ux * S, sy + uy * S]);
		const xc = sx + S / 2;
		const yc = sy + S / 2;
		// Image selon la transformation, toujours dans la région MIROIR de `base`.
		const img: SymPt[] = base.map(([x, y]) => {
			if (axis === 'v') {
				const dx = cw - 2 * xc; // translation vers la région droite
				if (cell.t === 'reflet') return [cw - x, y]; // retourné (vrai miroir)
				if (cell.t === 'glisse') return [x + dx, y]; // même sens (translation)
				return [2 * xc - x + dx, 2 * yc - y]; // demi-tour (rotation)
			}
			const dy = cw - 2 * yc;
			if (cell.t === 'reflet') return [x, cw - y];
			if (cell.t === 'glisse') return [x, y + dy];
			return [2 * xc - x, 2 * yc - y + dy];
		});
		// Mappage LOCAL → GLOBAL (décalage de cellule + arrondi).
		const G = ([x, y]: SymPt): SymPt => [r2(ox0 + x), r2(y)];
		// Miroir (axe en pointillé corail).
		const mline: [SymPt, SymPt] =
			axis === 'v'
				? [G([cw / 2, 10]), G([cw / 2, cw - 10])]
				: [G([10, cw / 2]), G([cw - 10, cw / 2])];
		body.push(symDashedSeg(mline[0], mline[1]));
		body.push(polygon(base.map(G), SHAPE_FILL));
		body.push(polygon(img.map(G), SHAPE_FILL));
		// Étiquette A/B/C sous la cellule.
		const [lx, ly] = G([cw / 2, cw + 18]);
		body.push(
			text(lx, ly, cell.label, {
				'text-anchor': 'middle',
				'dominant-baseline': 'central',
				'font-family': 'var(--ui)',
				'font-weight': 800,
				'font-size': 22,
				fill: 'var(--ink)',
			}),
		);
	});

	return svgCanvas(
		W,
		H,
		'Trois propositions de reflet',
		'Reflets dans le miroir',
		'Trois propositions A, B et C : dans chacune, une figure et une image de l’autre côté du miroir. Trouve l’image qui est le vrai reflet.',
		body.join(''),
		'figure-symetrie-reflet',
	);
}

/* ---------- Dispatch par données (point d'extension) ---------- */

/* ---------- Groupes de jetons (#104, division par le sens) ----------
   Montre la SITUATION DE DÉPART d'un partage : la collection (jetons en vrac)
   au-dessus, et les contenants VIDES (paniers) en dessous. La figure porte le
   SENS (« répartir cette collection dans ces paniers »), jamais le RÉSULTAT (les
   paniers restent vides → l'enfant calcule, il ne compte pas une réponse déjà
   posée). Avis pedagogue-primaire (#104). Total dessiné plafonné ~12 (lisibilité).
   Calibré pour la plage réellement tirée : `paniers` 2..6, `total` 4..12 (la
   disposition suppose un petit nombre de paniers — au-delà, `bw` se resserrerait). */
export function renderGroupes(paniers: number, total: number): string {
	const W = 260;
	const H = 200;
	const body: string[] = [];

	// Collection à partager : `total` jetons en vrac (corail), en 1 ou 2 rangées.
	// Contour `--ink` (neutre, INDÉPENDANT du thème) : sur les thèmes chauds
	// (`--accent` rouge/rouille) un contour d'accent se confondrait avec le corail
	// du remplissage → délimitation < 3:1 (avis relecteur-accessibilite, #104).
	const R = 9;
	const perRow = Math.min(total, 6);
	const rows = Math.ceil(total / perRow);
	const stepX = (W - 60) / Math.max(perRow, 1);
	const topY = 30;
	let placed = 0;
	for (let r = 0; r < rows; r++) {
		const inRow = Math.min(perRow, total - placed);
		const startX = (W - inRow * stepX) / 2 + stepX / 2;
		for (let c = 0; c < inRow; c++) {
			body.push(
				circle(r2(startX + c * stepX), r2(topY + r * (2 * R + 6)), R, {
					fill: 'var(--clock-min)',
					stroke: 'var(--ink)',
					'stroke-width': 1.5,
				}),
			);
		}
		placed += inRow;
	}

	// Contenants vides : `paniers` paniers (trapèzes + anse), alignés en bas.
	const margin = 18;
	const bw = Math.min(56, (W - 2 * margin) / paniers - 8);
	const bh = 46;
	const gap = paniers > 1 ? (W - 2 * margin - paniers * bw) / (paniers - 1) : 0;
	const by = H - bh - 16;
	for (let i = 0; i < paniers; i++) {
		const bx = margin + i * (bw + gap);
		body.push(
			polygon(
				[
					[r2(bx), by],
					[r2(bx + bw), by],
					[r2(bx + bw - 6), by + bh],
					[r2(bx + 6), by + bh],
				],
				{
					fill: 'var(--accent-soft)',
					stroke: 'var(--accent)',
					'stroke-width': 2,
					'stroke-linejoin': 'round',
				},
			),
		);
		body.push(
			polyline(
				[
					[r2(bx + 8), by],
					[r2(bx + bw / 2), by - 12],
					[r2(bx + bw - 8), by],
				],
				{ fill: 'none', stroke: 'var(--accent)', 'stroke-width': 2, 'stroke-linecap': 'round' },
			),
		);
	}

	return svgCanvas(
		W,
		H,
		`${total} jetons à partager dans ${paniers} paniers`,
		'Partage de jetons',
		`${total} jetons en vrac, à répartir équitablement dans ${paniers} paniers vides.`,
		body.join(''),
		'figure-groupes',
	);
}

/** Description d'une figure par données. Étendre l'union + le switch ci-dessous
    pour chaque nouvelle figure. */
export type FigureSpec =
	| { kind: 'horloge'; heures: number; minutes: number }
	| { kind: 'polygoneCote'; points: Array<[number, number]>; labels: string[] }
	| { kind: 'quadrillage'; cols: number; rows: number; cells: Array<[number, number]> }
	| { kind: 'figurePlane'; shape: PlaneShape; rotation?: number }
	| { kind: 'sceneFigures'; cells: Array<{ shape: PlaneShape; rotation?: number }> }
	| { kind: 'cercle'; segment?: 'rayon' | 'diametre'; label?: string }
	| { kind: 'solide'; solid: Solid }
	| { kind: 'groupes'; paniers: number; total: number }
	| { kind: 'fractionBarre'; num: number; den: number }
	| { kind: 'fractionBande'; num: number; den: number }
	| { kind: 'fractionPaire'; haut: [number, number]; bas: [number, number] }
	| { kind: 'fractionSomme'; a: [number, number]; b: [number, number] }
	| { kind: 'fractionCollection'; num: number; den: number; parGroupe: number }
	| { kind: 'symJuger'; shape: SymShape; axis?: SymAxis }
	| {
			kind: 'symReflet';
			motif: SymMotif;
			axis: 'v' | 'h';
			cells: Array<{ t: SymTransform; label: string }>;
	  };

export function renderFigure(spec: FigureSpec): string {
	switch (spec.kind) {
		case 'horloge':
			return renderHorloge(spec.heures, spec.minutes);
		case 'polygoneCote':
			return renderPolygoneCote(spec.points, spec.labels);
		case 'quadrillage':
			return renderQuadrillage(spec.cols, spec.rows, spec.cells);
		case 'figurePlane':
			return renderFigurePlane(spec.shape, spec.rotation);
		case 'sceneFigures':
			return renderSceneFigures(spec.cells);
		case 'cercle':
			return renderCercle(spec.segment, spec.label);
		case 'solide':
			return renderSolide(spec.solid);
		case 'groupes':
			return renderGroupes(spec.paniers, spec.total);
		case 'fractionBarre':
			return renderFractionBarre(spec.num, spec.den);
		case 'fractionBande':
			return renderFractionBande(spec.num, spec.den);
		case 'fractionPaire':
			return renderFractionPaire(spec.haut, spec.bas);
		case 'fractionSomme':
			return renderFractionSomme(spec.a, spec.b);
		case 'fractionCollection':
			return renderFractionCollection(spec.num, spec.den, spec.parGroupe);
		case 'symJuger':
			return renderSymJuger(spec.shape, spec.axis);
		case 'symReflet':
			return renderSymReflet(spec.motif, spec.axis, spec.cells);
	}
}
