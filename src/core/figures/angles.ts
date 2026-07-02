/* ---------- Angle (#202 — reconnaître / comparer : aigu, droit, obtus) ----------
   Deux demi-droites partant d'un sommet NET, dont on juge l'ouverture À L'ŒIL
   (jamais de degrés affichés). Calibrage (avis pedagogue + designer) :
   - sommet centré, segments longs et francs en `--accent` (le trait EST le sujet),
     bouts libres arrondis mais sommet net (deux `line` partant du même point) ;
   - MARQUEURS en `--ink` (robuste à tous les thèmes, dont les thèmes chauds où un
     accent secondaire chaud se confondrait avec `--accent`) : le sommet (point), et
     SELON l'ouverture soit un petit ARC matérialisant l'angle (aigu/obtus : plus
     court sur un aigu, plus large sur un obtus), soit le CARRÉ DE CODAGE (équerre)
     sur l'angle droit ; l'arc et le carré ne coexistent JAMAIS ;
   - INVARIANT « angle droit ⇒ carré de codage » garanti par `opening === 90` (un
     90° sans symbole, injuste à l'œil, est donc impossible à produire) ;
   - orientation variée via la bissectrice (le sommet reste centré, segments ≤ 78
     < 100 → jamais hors cadre), pour ne pas réduire « droit » à horizontal+vertical. */
import { ANGLE_MARK, arc, circle, line, polar, polyline, r2, svgCanvas } from './primitives';

const ANGLE_SIZE = 200;
const ANGLE_VERTEX = 100;
const ANGLE_RAY = 78; // longueur des demi-droites
const ANGLE_ARC_R = 26; // rayon de l'arc d'ouverture (aigu/obtus)
const ANGLE_SQUARE = 16; // côté du carré de codage (angle droit)

/** Angle de mesure `opening` (degrés, JAMAIS affichée), orienté par la direction
    de bissectrice `bisector` (degrés). 90° → carré de codage ; sinon arc. */
export function renderAngle(opening: number, bisector: number): string {
	const V = ANGLE_VERTEX;
	const a1 = bisector - opening / 2;
	const a2 = bisector + opening / 2;
	const body: string[] = [];

	// Les deux demi-droites (trait d'accent franc, extrémités libres douces).
	for (const ang of [a1, a2]) {
		const [x, y] = polar(V, V, ANGLE_RAY, ang);
		body.push(
			line(V, V, x, y, { stroke: 'var(--accent)', 'stroke-width': 4, 'stroke-linecap': 'round' }),
		);
	}

	if (opening === 90) {
		// Carré de codage (équerre) : repère canonique de l'angle droit. Corner =
		// V + 16·d1 + 16·d2 (le sommet opposé du petit carré).
		const [ax, ay] = polar(V, V, ANGLE_SQUARE, a1);
		const [bx, by] = polar(V, V, ANGLE_SQUARE, a2);
		body.push(
			polyline(
				[
					[ax, ay],
					[r2(ax + bx - V), r2(ay + by - V)],
					[bx, by],
				],
				ANGLE_MARK,
			),
		);
	} else {
		// Arc matérialisant l'ouverture (pour ne pas confondre l'angle avec les traits).
		body.push(arc(V, V, ANGLE_ARC_R, a1, a2, ANGLE_MARK));
	}

	// Sommet marqué en dernier (par-dessus) : scelle la jonction et désigne le point clé.
	body.push(circle(V, V, 4, { fill: 'var(--ink)' }));

	return svgCanvas(
		ANGLE_SIZE,
		ANGLE_SIZE,
		'Angle formé par deux demi-droites',
		'Angle',
		"Un angle formé de deux demi-droites partant d'un sommet ; compare son ouverture à l'angle droit.",
		body.join(''),
		'figure-angle',
	);
}
