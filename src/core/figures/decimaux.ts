/* ---------- Nombres décimaux (#247) — grille des centièmes ----------
   Une grille 10×10 (100 cases égales) dont `parts` cases sont coloriées, remplies de
   façon CONTIGUË depuis le coin HAUT-GAUCHE, LIGNE PAR LIGNE : une ligne pleine = un
   dixième (« 4 dixièmes = 4 lignes pleines », lisible d'un coup), une case = un
   centième. Sert à faire correspondre une fraction décimale (n/10, n/100) à une
   écriture à virgule (0,n / 0,0n). Se compose avec les primitives (jamais de SVG
   « à la main »). Aucune classe CSS dédiée : le viewBox carré (~236) tient dans
   `.figure-svg { max-width: 260px }`. */
import { line, polyline, rect, svgCanvas } from './primitives';

// Côté d'une case en unités viewBox : même valeur que le quadrillage (polygones.ts),
// pour une échelle visuelle cohérente d'une figure à l'autre. Redéfini localement
// (chaque famille de figures ne dépend que des primitives, jamais d'une autre famille).
const CELL = 22;
const PAD = 8;
const N = 10; // 10 × 10 = 100 cases
const SIZE = N * CELL + 2 * PAD; // viewBox carré ≈ 236

// Position (unités viewBox) d'une frontière de case d'indice `k` (0..N).
const at = (k: number): number => PAD + k * CELL;

/* Frontière (polyligne OUVERTE) entre la zone coloriée (contiguë, en lignes depuis le
   haut-gauche) et la zone vide : elle marque la limite par une FORME, pas par la seule
   couleur (SC 1.4.1). `parts` cases = `pleines` lignes entières + `reste` cases d'une
   ligne partielle. Escalier « bas de la dernière ligne pleine → côté droit des cases
   partielles → bas des cases partielles ». Vide si rien n'est colorié, si tout l'est,
   ou si la limite coïncide avec le cadre extérieur (rien à tracer en accent). */
function frontiere(parts: number): Array<[number, number]> {
	const pleines = Math.floor(parts / N);
	const reste = parts % N;
	if (reste === 0) {
		// Lignes pleines seulement : un segment horizontal sous la dernière (interne).
		if (pleines <= 0 || pleines >= N) return [];
		return [
			[at(0), at(pleines)],
			[at(N), at(pleines)],
		];
	}
	const pts: Array<[number, number]> = [];
	if (pleines >= 1) {
		// Bas de la dernière ligne pleine (à droite des cases partielles), puis on descend.
		pts.push([at(N), at(pleines)]);
		pts.push([at(reste), at(pleines)]);
	} else {
		// Aucune ligne pleine : la frontière part du haut des cases partielles.
		pts.push([at(reste), at(0)]);
	}
	pts.push([at(reste), at(pleines + 1)]); // côté droit des cases partielles
	if (pleines + 1 < N) pts.push([at(0), at(pleines + 1)]); // bas des cases partielles (sinon = cadre)
	return pts;
}

/** Grille des centièmes (#247) : `parts` (0..100, borné) cases coloriées, contiguës
    depuis le haut-gauche, ligne par ligne. Cases coloriées `--accent-soft` ; maillage
    des centièmes en colonnes fines `--grey` ; séparateurs de dixièmes (une ligne = un
    dixième) `--grey` plus épais ; cadre `--ink` (l'unité entière) ; frontière
    coloriée/vide `--accent`. Le `<desc>` décrit la STRUCTURE, jamais le compte (ce
    serait souffler la réponse). */
export function renderGrilleCentiemes(parts: number): string {
	const p = Math.max(0, Math.min(100, Math.round(parts)));
	const body: string[] = [];
	// Cases coloriées (SOUS le maillage) : remplissage contigu, ligne par ligne.
	for (let i = 0; i < p; i++) {
		const col = i % N;
		const row = Math.floor(i / N);
		body.push(rect(at(col), at(row), CELL, CELL, { fill: 'var(--accent-soft)' }));
	}
	// Maillage des centièmes : lignes verticales fines (subdivisent chaque dixième).
	for (let c = 1; c < N; c++)
		body.push(line(at(c), at(0), at(c), at(N), { stroke: 'var(--grey)', 'stroke-width': 1 }));
	// Séparateurs de dixièmes : lignes horizontales plus marquées (1 ligne = 1 dixième).
	for (let r = 1; r < N; r++)
		body.push(line(at(0), at(r), at(N), at(r), { stroke: 'var(--grey)', 'stroke-width': 1.9 }));
	// Cadre extérieur = l'unité entière.
	body.push(
		rect(at(0), at(0), N * CELL, N * CELL, {
			fill: 'none',
			stroke: 'var(--ink)',
			'stroke-width': 2.5,
		}),
	);
	// Frontière coloriée / vide : une FORME (contour accent), pas la seule couleur.
	const front = frontiere(p);
	if (front.length >= 2)
		body.push(
			polyline(front, {
				fill: 'none',
				stroke: 'var(--accent)',
				'stroke-width': 2.75,
				'stroke-linecap': 'round',
				'stroke-linejoin': 'round',
			}),
		);
	return svgCanvas(
		SIZE,
		SIZE,
		'Grille des centièmes',
		'Une grille de 100 cases égales ; certaines cases sont coloriées.',
		body.join(''),
	);
}
