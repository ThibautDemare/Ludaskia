/* ---------- Figures planes : polygones cotés, quadrillages, reconnaissance, cercle ----------
   Toutes les figures 2D « à plat » (par opposition aux solides en volume) :
   - polygone coté et quadrillage (#99 — périmètre) ;
   - figures planes à reconnaître, avec codage optionnel des côtés égaux et angles
     droits (#100 / #242 / #326) ;
   - cercle coté (#102 — rayon, diamètre, vocabulaire).
   Se composent avec les primitives (jamais de SVG « à la main »). */
import {
	ANGLE_MARK,
	SHAPE_FILL,
	circle,
	line,
	polygon,
	polyline,
	r2,
	rect,
	svgCanvas,
	text,
} from './primitives';

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
		'Figure cotée',
		'Figure avec la mesure de chaque côté ; calcule le périmètre (le tour).',
		body.join(''),
		'figure-polygone',
		'Figure géométrique cotée',
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
	| 'triangleEquilateral' // 3 côtés égaux (marqués), angles 60° (CM1, #242)
	| 'triangleIsocele' // 2 côtés égaux (marqués), franchement non-équilatéral (CM1, #242)
	| 'triangleQuelconque' // scalène ~3:4:5,5, aucun angle droit — contre-exemple (CM1, #242)
	| 'losange'
	| 'cercle'
	| 'parallelogramme'; // jamais tiré au CE2 (déclaré dans NOM) ; réponse de reconnaissance au CM1 (#242)

// Sommets canoniques dans le carré unité [0,1]² (y vers le bas ; la rotation gère
// l'orientation, le centrage gère la position). Le cercle est traité à part.
// `shapeBody` met TOUT à l'échelle de façon UNIFORME (même facteur en x et y) → les
// longueurs et les angles sont préservés : un côté « égal par construction » le reste
// à l'écran (exigence #242 : la distinction ne repose pas sur le seul coup d'œil).
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
	// Équilatéral : base 1, hauteur √3/2 ≈ 0,866 → les 3 côtés mesurent 1 (angles 60°).
	triangleEquilateral: [
		[0.5, 0],
		[1, 0.866],
		[0, 0.866],
	],
	// Isocèle FRANC : apex ~40° (élancé), base 1, hauteur 1,37 → AB = AC ≈ 1,46, base 1.
	// Loin de l'équilatéral (60°) ET de la zone 55-70° à éviter (avis designer #242).
	triangleIsocele: [
		[0.5, 0],
		[1, 1.37],
		[0, 1.37],
	],
	// Quelconque/scalène : côtés 3:4:5,5 (angle opposé au plus long ≈ 102°, AUCUN angle
	// droit). Sert de contre-exemple / distracteur (aucune marque de côté égal).
	triangleQuelconque: [
		[0, 2.13],
		[5.5, 2.13],
		[3.39, 0],
	],
	losange: [
		[0.5, 0.18],
		[1, 0.5],
		[0.5, 0.82],
		[0, 0.5],
	], // diagonales inégales
	// Parallélogramme (#242) : côté oblique incliné ~28° de la verticale (décalage du
	// haut ≈ 0,53 pour base 1) et ratio longueur/largeur ~1,9 (rectangle penché allongé,
	// pas quasi-carré). Hauteur 1, base 1,9 → décalage horizontal 0,53.
	parallelogramme: [
		[0.53, 0],
		[2.43, 0],
		[1.9, 1],
		[0, 1],
	],
};

/* CODAGE DES FIGURES (#326 — attendu CM1 « coder un angle droit, des longueurs égales »).
   Dessiné UNIQUEMENT sur demande explicite (`codage`, donc CM1 seulement) : le moteur est
   partagé avec le CE2, qui dessine aussi carré/rectangle/losange/triangle rectangle SANS
   codage (CE2 gelé). Le codage rend la reconnaissance ÉQUITABLE (losange vs parallélogramme
   indécidables « à l'œil » sans lui), sans curer les distracteurs.

   Côtés à MARQUER par forme, en index de côté `points[i]→points[i+1]`, avec le NOMBRE de
   tirets : 1 et 2 distinguent DEUX familles de longueurs (un même nombre de tirets = côtés
   égaux). La marque est CONCORDANTE avec le tracé (côtés réellement égaux par construction).
   - équilatéral : 3 côtés (1 tiret) ; isocèle : les 2 obliques égaux (1 tiret) ;
   - carré / losange : 4 côtés égaux (1 tiret) ;
   - rectangle / parallélogramme : 2 longueurs (1 tiret) + 2 largeurs (2 tirets). */
const SHAPE_MARQUES_COTES: Partial<
	Record<Exclude<PlaneShape, 'cercle'>, Array<[cote: number, tirets: number]>>
> = {
	triangleEquilateral: [
		[0, 1],
		[1, 1],
		[2, 1],
	],
	triangleIsocele: [
		[0, 1],
		[2, 1],
	],
	carre: [
		[0, 1],
		[1, 1],
		[2, 1],
		[3, 1],
	],
	losange: [
		[0, 1],
		[1, 1],
		[2, 1],
		[3, 1],
	],
	rectangle: [
		[0, 1],
		[2, 1],
		[1, 2],
		[3, 2],
	],
	parallelogramme: [
		[0, 1],
		[2, 1],
		[1, 2],
		[3, 2],
	],
};

/* Sommets portant un carré de codage d'angle droit (index de sommet). Carré & rectangle :
   les 4 angles droits (convention des manuels ; n'en coder qu'un laisserait croire qu'un
   seul angle est droit — avis pedagogue). Triangle rectangle : l'unique angle droit
   (sommet 1, où se rencontrent les deux côtés perpendiculaires). */
const SHAPE_ANGLES_DROITS: Partial<Record<Exclude<PlaneShape, 'cercle'>, number[]>> = {
	carre: [0, 1, 2, 3],
	rectangle: [0, 1, 2, 3],
	triangleRectangle: [1],
};

function rotateAbout([x, y]: [number, number], deg: number): [number, number] {
	const r = (deg * Math.PI) / 180;
	const dx = x - 0.5;
	const dy = y - 0.5;
	return [0.5 + dx * Math.cos(r) - dy * Math.sin(r), 0.5 + dx * Math.sin(r) + dy * Math.cos(r)];
}

/* Marque de « côté égal » (#242/#326) : `tirets` courts traits PERPENDICULAIRES au milieu
   d'un côté `a → b` (1 = une famille de longueur, 2 = une autre famille). Couleur `--ink`
   (robuste à tous les thèmes), trait ~2,3, longueur ~9 px (viewBox 200), bouts arrondis.
   Les côtés portant la MÊME marque sont égaux par construction → signal concordant
   (figure + tiret). Le double tiret est rendu par deux traits parallèles répartis le long
   du côté autour du milieu. */
const MARQUE_EGAL = {
	stroke: 'var(--ink)',
	'stroke-width': 2.3,
	'stroke-linecap': 'round',
	'stroke-linejoin': 'round',
} as const;
const MARQUE_LEN = 9; // demi-longueur du tiret de chaque côté du milieu (viewBox 200)
// Écart entre les deux traits d'un double tiret (le long du côté). 7 (et non 5) pour que
// l'espace inter-traits reste > l'épaisseur du trait → double tiret lisiblement « double »,
// même agrandi / en basse vision (avis relecteur-accessibilite + designer #326). N'affecte
// QUE le double tiret (le simple est centré, écart nul).
const MARQUE_ECART = 7;

function marqueEgal(a: [number, number], b: [number, number], tirets = 1): string {
	const mx = (a[0] + b[0]) / 2;
	const my = (a[1] + b[1]) / 2;
	const dx = b[0] - a[0];
	const dy = b[1] - a[1];
	const len = Math.hypot(dx, dy) || 1;
	const tx = dx / len; // unité tangente (le long du côté)
	const ty = dy / len;
	const nx = -ty; // unité normale (perpendiculaire au côté)
	const ny = tx;
	let out = '';
	for (let k = 0; k < tirets; k++) {
		const d = (k - (tirets - 1) / 2) * MARQUE_ECART; // décalage le long du côté, centré
		const ox = mx + tx * d;
		const oy = my + ty * d;
		out += line(
			r2(ox - nx * MARQUE_LEN),
			r2(oy - ny * MARQUE_LEN),
			r2(ox + nx * MARQUE_LEN),
			r2(oy + ny * MARQUE_LEN),
			MARQUE_EGAL,
		);
	}
	return out;
}

const COIN_DROIT_LEN = 13; // côté du carré de codage d'angle droit DANS une figure (viewBox 200)

/* Carré de codage d'un angle droit au sommet `V` d'un polygone, logé DANS le coin et orienté
   le long des deux côtés adjacents (V→P et V→N) → il SUIT la rotation de la figure (#326).
   Réutilise la convention de l'équerre de `renderAngle` (token partagé `ANGLE_MARK`).
   La taille est bornée à 30 % du plus court côté adjacent (figures/côtés courts). */
function coinAngleDroit(V: [number, number], P: [number, number], N: [number, number]): string {
	const uLen = Math.hypot(P[0] - V[0], P[1] - V[1]) || 1;
	const wLen = Math.hypot(N[0] - V[0], N[1] - V[1]) || 1;
	const ux = (P[0] - V[0]) / uLen;
	const uy = (P[1] - V[1]) / uLen;
	const wx = (N[0] - V[0]) / wLen;
	const wy = (N[1] - V[1]) / wLen;
	const L = Math.min(COIN_DROIT_LEN, 0.3 * Math.min(uLen, wLen));
	return polyline(
		[
			[r2(V[0] + ux * L), r2(V[1] + uy * L)],
			[r2(V[0] + (ux + wx) * L), r2(V[1] + (uy + wy) * L)],
			[r2(V[0] + wx * L), r2(V[1] + wy * L)],
		],
		ANGLE_MARK,
	);
}

/* Une forme remplie, ajustée et centrée dans la case [cx±box/2, cy±box/2]. Quand `codage`
   est demandé (#326, CM1 uniquement — voir SHAPE_MARQUES_COTES / SHAPE_ANGLES_DROITS), la
   forme reçoit en plus son CODAGE : tirets de côtés égaux (1 ou 2 familles) et carrés
   d'angle droit. Sans `codage` (CE2, défaut), seul le polygone est dessiné — rendu CE2
   inchangé. */
function shapeBody(
	shape: PlaneShape,
	cx: number,
	cy: number,
	box: number,
	rotDeg: number,
	codage = false,
): string {
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
	const s = inner / Math.max(w, h); // échelle UNIFORME (préserve angles et égalités)
	const offX = cx - (minX + w / 2) * s;
	const offY = cy - (minY + h / 2) * s;
	const fitted = pts.map(([x, y]): [number, number] => [r2(offX + x * s), r2(offY + y * s)]);
	let body = polygon(fitted, SHAPE_FILL);
	if (codage) {
		const n = fitted.length;
		for (const [i, tirets] of SHAPE_MARQUES_COTES[shape] ?? []) {
			body += marqueEgal(fitted[i], fitted[(i + 1) % n], tirets);
		}
		for (const i of SHAPE_ANGLES_DROITS[shape] ?? []) {
			body += coinAngleDroit(fitted[i], fitted[(i - 1 + n) % n], fitted[(i + 1) % n]);
		}
	}
	return body;
}

const PLANE_SIZE = 200;

/** Figure unique à reconnaître (option rotation pour varier l'orientation). `codage`
    (#326, CM1) ajoute le codage des côtés égaux et des angles droits ; absent au CE2. */
export function renderFigurePlane(shape: PlaneShape, rotation = 0, codage = false): string {
	return svgCanvas(
		PLANE_SIZE,
		PLANE_SIZE,
		'Figure géométrique',
		'Une figure plane à reconnaître : observe ses côtés et ses angles, puis nomme-la.',
		shapeBody(shape, PLANE_SIZE / 2, PLANE_SIZE / 2, PLANE_SIZE, rotation, codage),
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
		'Plusieurs figures planes : compte celles qui ont la forme demandée.',
		body,
		'figure-scene',
	);
}

/* ---------- Cercle coté (#102 — rayon, diamètre, vocabulaire) ----------
   Cercle avec son centre ; un segment (rayon : centre→bord, ou diamètre :
   bord→bord par le centre) peut être mis en évidence et coté (ou marqué « ? »
   pour une question de vocabulaire). */
const CERCLE_SIZE = 200; // viewBox carré du cercle coté

export function renderCercle(segment?: 'rayon' | 'diametre', label?: string): string {
	const cx = CERCLE_SIZE / 2;
	const cy = CERCLE_SIZE / 2;
	const r = 70; // rayon du disque
	const centreR = 4; // rayon du point marquant le centre
	const segW = 4; // épaisseur du rayon/diamètre mis en évidence
	const labelDy = 10; // décalage vertical du libellé au-dessus du segment
	const body: string[] = [
		circle(cx, cy, r, { fill: 'var(--accent-soft)', stroke: 'var(--accent)', 'stroke-width': 3 }),
	];
	if (segment === 'diametre')
		body.push(
			line(cx - r, cy, cx + r, cy, {
				stroke: 'var(--clock-min)',
				'stroke-width': segW,
				'stroke-linecap': 'round',
			}),
		);
	else if (segment === 'rayon')
		body.push(
			line(cx, cy, cx + r, cy, {
				stroke: 'var(--clock-min)',
				'stroke-width': segW,
				'stroke-linecap': 'round',
			}),
		);
	body.push(circle(cx, cy, centreR, { fill: 'var(--ink)' })); // centre marqué
	if (label) {
		const lx = segment === 'rayon' ? cx + r / 2 : cx;
		body.push(
			text(lx, cy - labelDy, label, {
				'text-anchor': 'middle',
				'font-family': 'var(--ui)',
				'font-weight': 700,
				'font-size': 14,
				fill: 'var(--ink)',
			}),
		);
	}
	return svgCanvas(
		CERCLE_SIZE,
		CERCLE_SIZE,
		'Cercle',
		`Un cercle avec son centre${segment ? ' et un segment mis en évidence' : ''}.`,
		body.join(''),
		'figure-cercle',
	);
}
