/* ---------- Solides en perspective (#103 — reconnaissance) ----------
   Schémas en perspective cavalière, SANS arêtes cachées (avis designer) : face
   avant pleine (`--accent-soft` + contour `--accent`), arêtes de profondeur en
   contour atténué (opacité 0,55). Monochrome, orientation STABLE (jamais de
   rotation : un solide retourné devient illisible). Le but est de RECONNAÎTRE
   la silhouette, pas de compter les faces. */
import { SHAPE_FILL, circle, ellipse, line, polygon, rect, svgCanvas } from './primitives';

export type Solid = 'cube' | 'pave' | 'cylindre' | 'cone' | 'pyramide' | 'boule' | 'prisme';

const SOLID_SIZE = 200;
/* Arêtes de PROFONDEUR : arêtes de fuite, arêtes arrière visibles, et l'équateur de
   la boule (voir plus bas). Elles portent l'information « c'est un volume » — sans
   elles un cube est un carré et une sphère un disque — donc WCAG 1.4.11 leur impose
   3:1 contre le fond de figure, comme à tout objet graphique porteur de sens.
   Opacité relevée de 0,55 à 0,80 (#387). L'opacité dilue le trait vers `--paper` : à
   0,55 le contraste réel tombait entre 2,30 et 3,11:1 selon le thème — les six
   échouaient. À 0,80 il va de 3,61 à 4,98:1, soit ~20 % de marge au-dessus du seuil.
   0,75 suffirait au chiffre (3,30 au plus serré) mais ne laisse que 10 % de marge, et
   ce contraste-là n'est gardé par aucun test de tokens : c'est une couleur COMPOSÉE,
   invisible pour un gate qui compare des paires déclarées. D'où le test dédié dans
   `tests/contraste-tokens.test.ts`, qui relit cette opacité et refait le calcul.
   L'effet de perspective survit parce qu'il ne tenait pas à la pâleur seule : la face
   avant garde son remplissage `--accent-soft` et un trait d'épaisseur 3 contre 2 ici,
   à pleine opacité (5,35 à 6,94:1). Deux signaux sur trois sont intacts.
   Écartés (avis `designer-ux-enfant`) : une couleur dédiée à pleine opacité — six
   tokens à maintenir pour ce qui reste une variation de `--accent` ; et le pointillé —
   il dit conventionnellement « arête CACHÉE » en géométrie, l'inverse exact de ce que
   sont ces arêtes-ci, et le parti pris du fichier est justement de ne dessiner que des
   arêtes visibles. */
const DEPTH = {
	fill: 'none',
	stroke: 'var(--accent)',
	'stroke-width': 2,
	opacity: 0.8,
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

/* Prisme droit (#242) — base TRIANGULAIRE : face avant triangulaire pleine + 3 arêtes
   de fuite (depuis les 3 sommets de la face avant) + 2 arêtes arrière VISIBLES (les
   arêtes du fond cachées sont omises, comme `boite`). Style identique aux autres
   solides : perspective cavalière sans arêtes cachées, fuite vers le haut. */
function prismeTriangulaire(ox: number, oy: number): string {
	const A: [number, number] = [60, 72]; // sommet (apex) de la face avant
	const BL: [number, number] = [42, 150]; // base gauche
	const BR: [number, number] = [120, 150]; // base droite
	const off = (p: [number, number]): [number, number] => [p[0] + ox, p[1] + oy];
	const seg = (a: [number, number], b: [number, number]) => line(a[0], a[1], b[0], b[1], DEPTH);
	const A2 = off(A);
	const BL2 = off(BL);
	const BR2 = off(BR);
	return (
		// Arêtes de fuite (les 3 sommets de la face avant vers l'arrière).
		seg(A, A2) +
		seg(BL, BL2) +
		seg(BR, BR2) +
		// Face arrière : les 2 arêtes du dessus visibles (apex arrière vers les bases).
		// Le côté bas arrière (BL2→BR2) est caché par la face avant → omis.
		seg(A2, BL2) +
		seg(A2, BR2) +
		// Face avant triangulaire pleine, par-dessus les arêtes.
		polygon([A, BL, BR], SHAPE_FILL)
	);
}

/* Orientation d'un solide (#286 — variété visuelle, choisie par la DONNÉE pour
   garder ce module déterministe). `mirror` : fuite vers la GAUCHE (miroir
   horizontal, figure recentrée par transform). `lean` : vecteur de fuite des
   boîtes — 0 canonique (~37°), 1 plus plat (~30°), 2 plus raide (~45°), toujours
   vers le HAUT. Sans objet pour cylindre/cône/boule (une seule vue lisible). */
export interface SolidOrient {
	mirror?: boolean;
	lean?: 0 | 1 | 2;
}

// Vecteurs de fuite (ox, oy) des boîtes, indexés par `lean` (oy < 0 : vers le haut).
const FUITE_CUBE: ReadonlyArray<readonly [number, number]> = [
	[34, -26],
	[35, -20],
	[28, -28],
];
const FUITE_PAVE: ReadonlyArray<readonly [number, number]> = [
	[30, -24],
	[31, -18],
	[25, -25],
];
// Prisme droit triangulaire (#242) : fuite un peu plus courte (la face avant est haute).
const FUITE_PRISME: ReadonlyArray<readonly [number, number]> = [
	[40, -28],
	[42, -22],
	[34, -30],
];

export function renderSolide(solid: Solid, orient: SolidOrient = {}): string {
	let body = '';
	switch (solid) {
		case 'cube': {
			const [ox, oy] = FUITE_CUBE[orient.lean ?? 0];
			body = boite(45, 80, 80, 80, ox, oy);
			break;
		}
		case 'pave': {
			const [ox, oy] = FUITE_PAVE[orient.lean ?? 0];
			body = boite(34, 96, 110, 56, ox, oy);
			break;
		}
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
			// L'équateur passe par DEPTH au lieu de le recopier à la main (#387). Il jouait
			// exactement le rôle d'une arête de profondeur — c'est lui qui fait lire
			// « sphère » plutôt que « disque » — mais avec ses propres valeurs, dont une
			// opacité de 0,5 encore plus basse que les 0,55 d'alors : 2,10 à 2,85:1, le
			// pire écart du fichier. Une constante recopiée dérive ; celle-ci avait déjà
			// dérivé de 0,05 sans raison écrite.
			body = circle(100, 100, 60, SHAPE_FILL) + ellipse(100, 100, 60, 18, DEPTH);
			break;
		case 'prisme': {
			const [ox, oy] = FUITE_PRISME[orient.lean ?? 0];
			body = prismeTriangulaire(ox, oy);
			break;
		}
	}
	// Miroir horizontal (#286) : fuite vers la gauche ; transform centré → coordonnées
	// internes inchangées, perspective cavalière sans arêtes cachées conservée.
	if (orient.mirror) body = `<g transform="translate(${SOLID_SIZE} 0) scale(-1 1)">${body}</g>`;
	return svgCanvas(
		SOLID_SIZE,
		SOLID_SIZE,
		'Solide',
		'Un solide dessiné en volume à reconnaître : observe sa forme, puis nomme-le.',
		body,
		'figure-solide',
	);
}
