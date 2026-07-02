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
import { SHAPE_FILL, attrs, ellipse, line, polygon, r2, rect, svgCanvas } from './primitives';

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
export type SymMotif = 'drapeau' | 'botte' | 'lettreF' | 'poisson' | 'chaussure';
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
		case 'coeur': {
			// Cœur en UN seul chemin, SYMÉTRIQUE PAR CONSTRUCTION : chaque courbe de
			// droite est le miroir exact de la courbe gauche autour de x = 0,5. L'ancien
			// tracé (2 cercles + triangle, formes séparées et contourées) laissait des
			// contours internes et un artefact de recouvrement au creux central — le
			// cœur paraissait asymétrique alors que la réponse attendue est « Oui ».
			const pt = (x: number, y: number): string => P(x, y).join(' ');
			const d =
				`M ${pt(0.5, 0.32)} ` +
				`C ${pt(0.42, 0.16)} ${pt(0.18, 0.16)} ${pt(0.12, 0.34)} ` +
				`C ${pt(0.07, 0.46)} ${pt(0.2, 0.56)} ${pt(0.5, 0.93)} ` +
				`C ${pt(0.8, 0.56)} ${pt(0.93, 0.46)} ${pt(0.88, 0.34)} ` +
				`C ${pt(0.82, 0.16)} ${pt(0.58, 0.16)} ${pt(0.5, 0.32)} Z`;
			return `<path d="${d}" ${attrs(SHAPE_FILL)} />`;
		}
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
	// #286 (variété visuelle) — 3 motifs chiraux supplémentaires (aucun axe ni
	// symétrie de demi-tour), cadrés par designer-ux-enfant : branches larges,
	// déséquilibre haut/bas franc, reconnaissables en aplat à petite taille.
	// Lettre F : hampe à gauche, barre du haut plus longue que celle du milieu,
	// rien en bas → chiral dans les deux sens (exemple canonique).
	lettreF: [
		[0.26, 0.1],
		[0.74, 0.1],
		[0.74, 0.28],
		[0.46, 0.28],
		[0.46, 0.46],
		[0.66, 0.46],
		[0.66, 0.64],
		[0.46, 0.64],
		[0.46, 0.9],
		[0.26, 0.9],
	],
	// Poisson de profil : bouche pointue à gauche, nageoire dorsale en haut, queue
	// triangulaire échancrée à droite → silhouette chirale sans détail interne.
	poisson: [
		[0.1, 0.5],
		[0.3, 0.36],
		[0.44, 0.34],
		[0.5, 0.24],
		[0.56, 0.34],
		[0.7, 0.4],
		[0.92, 0.3],
		[0.8, 0.5],
		[0.92, 0.7],
		[0.7, 0.6],
		[0.3, 0.64],
	],
	// Chaussure de profil : talon haut à l'arrière (gauche), pointe relevée à
	// l'avant (droite), semelle plate en bas → repères gauche/droite et haut/bas nets.
	chaussure: [
		[0.14, 0.84],
		[0.14, 0.56],
		[0.34, 0.48],
		[0.5, 0.54],
		[0.7, 0.52],
		[0.88, 0.6],
		[0.88, 0.84],
	],
};

const SYM_CELL = 160; // côté du carré (question « miroir » et chaque scène-choix)

/* Décor commun d'une scène de miroir : le motif de DÉPART placé d'un côté de l'axe
   (gauche si axe vertical, haut si horizontal), l'axe (« miroir ») au centre, et
   le côté opposé laissé libre (le reflet y prendra place). Échelle/placement
   IDENTIQUES pour la question et pour chaque choix → seule l'image-reflet change. */
function symSceneBase(
	motif: SymMotif,
	axis: 'v' | 'h',
): { base: SymPt[]; xc: number; yc: number; mline: [SymPt, SymPt] } {
	const cw = SYM_CELL;
	const reg =
		axis === 'v'
			? { x: 16, y: 16, w: cw / 2 - 28, h: cw - 32 }
			: { x: 16, y: 16, w: cw - 32, h: cw / 2 - 28 };
	const S = Math.min(reg.w, reg.h);
	const sx = reg.x + (reg.w - S) / 2;
	const sy = reg.y + (reg.h - S) / 2;
	const base: SymPt[] = SYM_MOTIFS[motif].map(([ux, uy]) => [sx + ux * S, sy + uy * S]);
	const mline: [SymPt, SymPt] =
		axis === 'v'
			? [
					[cw / 2, 10],
					[cw / 2, cw - 10],
				]
			: [
					[10, cw / 2],
					[cw - 10, cw / 2],
				];
	return { base, xc: sx + S / 2, yc: sy + S / 2, mline };
}

const symR = ([x, y]: SymPt): SymPt => [r2(x), r2(y)];

/** Format 3 — figure de la QUESTION : la figure de départ posée devant le miroir
    (axe en pointillé), l'autre côté laissé VIDE — le reflet est à reconnaître
    parmi les choix. */
export function renderSymMiroir(motif: SymMotif, axis: 'v' | 'h'): string {
	const { base, mline } = symSceneBase(motif, axis);
	const body = symDashedSeg(symR(mline[0]), symR(mline[1])) + polygon(base.map(symR), SHAPE_FILL);
	return svgCanvas(
		SYM_CELL,
		SYM_CELL,
		'Une figure devant un miroir',
		'Figure et miroir',
		'Une figure posée devant un miroir (le trait en pointillé) : son reflet est à reconnaître.',
		body,
		'figure-symetrie-miroir',
	);
}

/** Format 3 — une SCÈNE-CHOIX cliquable : la même figure de départ, le miroir, et
    DE L'AUTRE CÔTÉ une image transformée. `reflet` = retourné (vrai miroir, calculé
    par réflexion EXACTE des points → pixel-perfect), `glisse` = même sens
    (translation), `tourne` = demi-tour (rotation). Le motif-source et l'axe sont
    répétés dans chaque choix À DESSEIN (avis pedagogue-primaire #201) : l'enfant
    VÉRIFIE le pliage au lieu de devoir imaginer le reflet de tête. SVG décoratif
    (`aria-hidden`) : le bouton porte déjà le libellé parlé du choix. */
export function renderSymImage(motif: SymMotif, axis: 'v' | 'h', t: SymTransform): string {
	const { base, xc, yc, mline } = symSceneBase(motif, axis);
	const cw = SYM_CELL;
	const img: SymPt[] = base.map(([x, y]) => {
		if (axis === 'v') {
			const dx = cw - 2 * xc; // emplacement miroir, côté opposé
			if (t === 'reflet') return [cw - x, y]; // retourné (vrai miroir)
			if (t === 'glisse') return [x + dx, y]; // même sens (translation)
			return [2 * xc - x + dx, 2 * yc - y]; // demi-tour (rotation)
		}
		const dy = cw - 2 * yc;
		if (t === 'reflet') return [x, cw - y];
		if (t === 'glisse') return [x, y + dy];
		return [2 * xc - x, 2 * yc - y + dy];
	});
	const body =
		symDashedSeg(symR(mline[0]), symR(mline[1])) +
		polygon(base.map(symR), SHAPE_FILL) +
		polygon(img.map(symR), SHAPE_FILL);
	return svgCanvas(SYM_CELL, SYM_CELL, '', '', '', body, 'figure-symetrie-image', true);
}
