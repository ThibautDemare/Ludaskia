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

/** Une figure rectiligne sur quadrillage, décrite par ses cases pleines. Sert à la
    PAIRE à comparer (aire ↔ périmètre, #253). */
export interface QuadFig {
	cols: number;
	rows: number;
	cells: Array<[number, number]>;
}

/** Mode de dessin d'un quadrillage (#253) — deux « grammaires visuelles » distinctes :
    - `perimetre` (CE2, #99) : contour CORAIL épais, grille interne masquée sous le
      remplissage → on compte les CÔTÉS de carreaux du tour ;
    - `aire` (CM1) : cases teintées AVEC la grille interne visible PAR-DESSUS et un contour
      d'accent (pas de corail) → on compte les CARREAUX qui remplissent la figure. */
export type QuadrillageMode = 'perimetre' | 'aire';

export function renderQuadrillage(
	cols: number,
	rows: number,
	cells: Array<[number, number]>,
	mode: QuadrillageMode = 'perimetre',
	opts: { intrinsic?: boolean; ariaLabel?: string } = {},
): string {
	const W = cols * GRID_CELL + 2 * GRID_PAD;
	const H = rows * GRID_CELL + 2 * GRID_PAD;
	const px = (c: number) => GRID_PAD + c * GRID_CELL;
	const grille = (stroke: string, width: number): string[] => {
		const out: string[] = [];
		for (let i = 0; i <= cols; i++)
			out.push(
				line(px(i), px(0), px(i), GRID_PAD + rows * GRID_CELL, { stroke, 'stroke-width': width }),
			);
		for (let j = 0; j <= rows; j++)
			out.push(
				line(
					px(0),
					GRID_PAD + j * GRID_CELL,
					GRID_PAD + cols * GRID_CELL,
					GRID_PAD + j * GRID_CELL,
					{
						stroke,
						'stroke-width': width,
					},
				),
			);
		return out;
	};
	const cellules = (): string[] =>
		cells.map(([x, y]) => rect(px(x), px(y), GRID_CELL, GRID_CELL, { fill: 'var(--accent-soft)' }));
	// `join` (linejoin round) UNIQUEMENT en mode aire : le chemin `perimetre` reste
	// byte-identique au rendu CE2 de `mes-perimetre-quadrillage` (segments `<line>` sans
	// linejoin — un attribut de plus changerait la chaîne, même si sans effet visuel).
	const contour = (stroke: string, width: number, join: boolean): string[] =>
		boundaryEdges(cells).map(([[ax, ay], [bx, by]]) =>
			line(px(ax), px(ay), px(bx), px(by), {
				stroke,
				'stroke-width': width,
				'stroke-linecap': 'round',
				...(join ? { 'stroke-linejoin': 'round' } : {}),
			}),
		);

	const body: string[] = [];
	let desc: string;
	if (mode === 'aire') {
		// AIRE (#253) : compter les CASES → remplissage d'abord, PUIS la grille interne
		// PAR-DESSUS (visible pour compter, en --accent lisible sur le fond teinté : ≥ 3:1
		// tous thèmes), et un contour en --accent (délimite la figure, sans corail).
		body.push(
			...cellules(),
			...grille('var(--accent)', 1.25),
			...contour('var(--accent)', 2.75, true),
		);
		desc = 'Figure rectiligne sur un quadrillage ; compte les carreaux qui la remplissent.';
	} else {
		// PÉRIMÈTRE (CE2, #99) : grille discrète d'abord, cases par-dessus (grille interne
		// masquée sous le remplissage), contour CORAIL épais (on compte les côtés du tour).
		body.push(
			...grille('var(--muted)', 1),
			...cellules(),
			...contour('var(--clock-min)', 4, false),
		);
		desc = 'Figure rectiligne sur un quadrillage ; compte les côtés de carreaux qui font le tour.';
	}
	return svgCanvas(
		W,
		H,
		'Figure sur quadrillage',
		desc,
		body.join(''),
		'figure-quadrillage',
		opts.ariaLabel ?? 'Figure sur quadrillage',
		false,
		opts.intrinsic ?? false,
	);
}

/* ---------- Paire de quadrillages à comparer (#253 — aire ↔ périmètre) ----------
   Deux figures CÔTE À CÔTE pour les comparer (« même aire ? » / « même périmètre ? »).
   La taille de case est COMMUNE aux deux (`intrinsic` → width/height = viewBox) : une 6×6
   paraît donc plus grande qu'une 3×3, ce qui EST une information pour l'aire — on ne force
   PAS une largeur identique. Chaque cadran porte une ÉTIQUETTE textuelle « A » / « B » HORS
   du SVG, qui DOUBLE l'aria-label de chaque figure (jamais d'info par la seule position).
   Le mode (`aire`/`perimetre`) désigne la grandeur comparée (grille teintée = aire ; trait
   corail = périmètre). Le plafond d'enveloppe est posé en CSS (`.quad-pair-item`). */
export function renderQuadrillagePaire(
	a: QuadFig,
	b: QuadFig,
	mode: QuadrillageMode = 'aire',
	labels: [string, string] = ['A', 'B'],
): string {
	const item = (fig: QuadFig, label: string): string => {
		const svg = renderQuadrillage(fig.cols, fig.rows, fig.cells, mode, {
			intrinsic: true,
			ariaLabel: `Figure ${label}`,
		});
		return `<div class="quad-pair-item"><span class="quad-pair-label" aria-hidden="true">${label}</span>${svg}</div>`;
	};
	return `<div class="quad-pair">${item(a, labels[0])}${item(b, labels[1])}</div>`;
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
	| 'parallelogramme' // jamais tiré au CE2 (déclaré dans NOM) ; réponse de reconnaissance au CM1 (#242)
	| 'quadrilatereQuelconque'; // 4 côtés irréguliers : aucun angle droit, aucun côté égal, aucun côté parallèle — contre-exemple (#253)

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
	// Quadrilatère QUELCONQUE (#253) : 4 côtés convexes de longueurs toutes DIFFÉRENTES
	// (≈ 0,93 / 0,79 / 0,83 / 0,66), aucune paire de côtés parallèles, aucun angle droit.
	// Contre-exemple indispensable de « côtés opposés parallèles » (aucune marque de codage).
	quadrilatereQuelconque: [
		[0.1, 0],
		[1, 0.25],
		[0.75, 1],
		[0, 0.65],
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

/* CODAGE DU PARALLÉLISME (#253 — attendu enrichi) : chevrons « › » posés le long des côtés
   PARALLÈLES, sur le même principe que les tirets (nombre de chevrons = famille : une paire
   de côtés opposés porte un chevron simple, l'autre paire un chevron double). Le parallélisme
   n'a de sens que pour les QUADRILATÈRES : réservé aux carré / rectangle / losange /
   parallélogramme (2 paires de côtés opposés parallèles). ABSENT du quadrilatère quelconque
   (aucun côté parallèle) et de TOUS les triangles (jamais de côtés parallèles). Opt-in via
   `parallelisme` (comme `codage`) : n'affecte que les leçons qui le demandent. */
const SHAPE_MARQUES_PARALLELES: Partial<
	Record<Exclude<PlaneShape, 'cercle'>, Array<[cote: number, chevrons: number]>>
> = {
	carre: [
		[0, 1],
		[2, 1],
		[1, 2],
		[3, 2],
	],
	rectangle: [
		[0, 1],
		[2, 1],
		[1, 2],
		[3, 2],
	],
	losange: [
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

/* Marque de « côtés parallèles » (#253) : chevron(s) « › » posés LE LONG d'un côté `a → b`
   (pointe dans le sens du côté), 1 ou 2 selon la famille. Même style/couleur que les tirets
   d'égalité (`MARQUE_EGAL`). DÉCALÉ du milieu (voir `decal`) pour ne pas se superposer au
   tiret d'égalité, qui, lui, est centré (un côté de rectangle/parallélogramme porte les DEUX
   marques). */
const CHEVRON_LONG = 6.5; // demi-extension le long du côté (viewBox 200)
const CHEVRON_LARGE = 5.5; // demi-largeur (perpendiculaire) des ailes du chevron
const CHEVRON_ECART = 6; // écart entre deux chevrons (double), le long du côté

function marqueParallele(a: [number, number], b: [number, number], chevrons = 1): string {
	const mx = (a[0] + b[0]) / 2;
	const my = (a[1] + b[1]) / 2;
	const dx = b[0] - a[0];
	const dy = b[1] - a[1];
	const len = Math.hypot(dx, dy) || 1;
	const tx = dx / len; // tangente (le long du côté)
	const ty = dy / len;
	const nx = -ty; // normale (perpendiculaire au côté)
	const ny = tx;
	// Centre du groupe de chevrons décalé du milieu (borné) → à l'écart du tiret d'égalité.
	const decal = Math.min(0.22 * len, 22);
	const gx = mx + tx * decal;
	const gy = my + ty * decal;
	let out = '';
	for (let k = 0; k < chevrons; k++) {
		const d = (k - (chevrons - 1) / 2) * CHEVRON_ECART; // position le long du côté (double)
		const ox = gx + tx * d;
		const oy = gy + ty * d;
		// « › » : deux ailes en retrait (−tangente) de part et d'autre, se rejoignant à la
		// pointe (+tangente). Un polyline aile → pointe → aile.
		out += polyline(
			[
				[
					r2(ox - tx * CHEVRON_LONG + nx * CHEVRON_LARGE),
					r2(oy - ty * CHEVRON_LONG + ny * CHEVRON_LARGE),
				],
				[r2(ox + tx * CHEVRON_LONG), r2(oy + ty * CHEVRON_LONG)],
				[
					r2(ox - tx * CHEVRON_LONG - nx * CHEVRON_LARGE),
					r2(oy - ty * CHEVRON_LONG - ny * CHEVRON_LARGE),
				],
			],
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
	parallelisme = false,
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
	// Codage du parallélisme (#253) : opt-in indépendant du codage d'égalité/angles ; ne
	// concerne que les quadrilatères listés (jamais un triangle → pas d'entrée dans la table).
	if (parallelisme) {
		const n = fitted.length;
		for (const [i, chevrons] of SHAPE_MARQUES_PARALLELES[shape] ?? []) {
			body += marqueParallele(fitted[i], fitted[(i + 1) % n], chevrons);
		}
	}
	return body;
}

const PLANE_SIZE = 200;

/** Figure unique à reconnaître (option rotation pour varier l'orientation). `codage`
    (#326, CM1) ajoute le codage des côtés égaux et des angles droits ; `parallelisme`
    (#253, CM1) ajoute les chevrons de côtés parallèles (quadrilatères seulement). Les deux
    sont absents au CE2 (opt-in). */
export function renderFigurePlane(
	shape: PlaneShape,
	rotation = 0,
	codage = false,
	parallelisme = false,
): string {
	return svgCanvas(
		PLANE_SIZE,
		PLANE_SIZE,
		'Figure géométrique',
		'Une figure plane à reconnaître : observe ses côtés et ses angles, puis nomme-la.',
		shapeBody(shape, PLANE_SIZE / 2, PLANE_SIZE / 2, PLANE_SIZE, rotation, codage, parallelisme),
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
