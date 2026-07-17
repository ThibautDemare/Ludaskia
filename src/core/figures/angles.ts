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
import { ANGLE_MARK, arc, circle, line, polar, polyline, r2, svgCanvas, text } from './primitives';

const ANGLE_SIZE = 200;
const ANGLE_VERTEX = 100;
const ANGLE_RAY = 78; // longueur des demi-droites
const ANGLE_ARC_R = 26; // rayon de l'arc d'ouverture (aigu/obtus)
const ANGLE_SQUARE = 16; // côté du carré de codage (angle droit)

/** Description d'un angle pour le rendu (`renderAnglePair`) : ouverture + orientation,
    et longueur des demi-droites RÉGLABLE (`ray`, défaut `ANGLE_RAY`). La longueur du
    trait est un LEVIER pédagogique au CM1 (#252) : l'angle le plus ouvert peut avoir
    les traits les plus courts (« la taille du trait n'est pas l'ouverture »). */
export interface AngleSpec {
	opening: number; // ouverture en degrés (JAMAIS affichée)
	bisector: number; // orientation (degrés)
	ray?: number; // longueur des demi-droites (défaut ANGLE_RAY)
}

/* Corps SVG d'un angle (deux demi-droites + marqueur d'ouverture + sommet), sans
   l'enveloppe `svgCanvas` : partagé par la figure simple et la paire. `ray` règle la
   longueur des demi-droites. */
function corpsAngle(opening: number, bisector: number, ray: number): string {
	const V = ANGLE_VERTEX;
	const a1 = bisector - opening / 2;
	const a2 = bisector + opening / 2;
	const body: string[] = [];

	// Les deux demi-droites (trait d'accent franc, extrémités libres douces).
	for (const ang of [a1, a2]) {
		const [x, y] = polar(V, V, ray, ang);
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
	return body.join('');
}

/** Angle de mesure `opening` (degrés, JAMAIS affichée), orienté par la direction
    de bissectrice `bisector` (degrés). 90° → carré de codage ; sinon arc. */
export function renderAngle(opening: number, bisector: number): string {
	return svgCanvas(
		ANGLE_SIZE,
		ANGLE_SIZE,
		'Angle',
		"Un angle formé de deux demi-droites partant d'un sommet ; compare son ouverture à l'angle droit.",
		corpsAngle(opening, bisector, ANGLE_RAY),
		'figure-angle',
		'Angle formé par deux demi-droites',
	);
}

/** Deux angles CÔTE À CÔTE pour les COMPARER l'un à l'autre (CM1, #252) : « quel est
    le plus ouvert ? », « sont-ils égaux ? ». Chaque cadran porte une ÉTIQUETTE
    TEXTUELLE (« A » / « B ») HORS du SVG (une lettre au-dessus de la figure), qui
    DOUBLE l'`aria-label` de chaque SVG (« Angle A » / « Angle B ») : jamais d'info par
    la seule position (fragile en dyspraxie) ni par la seule couleur (a11y). Le SVG lui
    reste sans texte (aucune cote), comme la figure simple. La longueur des demi-droites
    (`ray`) est réglée PAR ANGLE, pour dissocier la taille du trait de l'ouverture. */
export function renderAnglePair(
	a: AngleSpec,
	b: AngleSpec,
	labels: [string, string] = ['A', 'B'],
): string {
	const item = (spec: AngleSpec, label: string): string => {
		const svg = svgCanvas(
			ANGLE_SIZE,
			ANGLE_SIZE,
			`Angle ${label}`,
			`L'angle ${label}, formé de deux demi-droites partant d'un sommet.`,
			corpsAngle(spec.opening, spec.bisector, spec.ray ?? ANGLE_RAY),
			'figure-angle',
			`Angle ${label}`,
		);
		return `<div class="angle-pair-item"><span class="angle-pair-label" aria-hidden="true">${label}</span>${svg}</div>`;
	};
	return `<div class="angle-pair">${item(a, labels[0])}${item(b, labels[1])}</div>`;
}

/** Un angle avec ses TROIS points NOMMÉS (CM1, #252, notation « angle AÔB ») : un point
    à l'extrémité de chaque demi-droite + le sommet. `points` = [extrémité 1, sommet,
    extrémité 2] (l'ordre de la notation, sommet au MILIEU). Les lettres sont des NOMS DE
    POINTS (pas des cotes/degrés) : c'est le seul cas où `<text>` est admis sur une figure
    d'angle — l'invariant « aucune mesure affichée » reste tenu. Lettres en `var(--ink)`
    (contraste). Réutilise `corpsAngle`. */
export function renderAngleNomme(spec: AngleSpec, points: [string, string, string]): string {
	const V = ANGLE_VERTEX;
	const ray = spec.ray ?? ANGLE_RAY;
	const a1 = spec.bisector - spec.opening / 2;
	const a2 = spec.bisector + spec.opening / 2;
	const [p1, sommet, p2] = points;
	const body: string[] = [corpsAngle(spec.opening, spec.bisector, ray)];
	// Marque les extrémités des deux demi-droites (le sommet est déjà marqué par corpsAngle).
	const [e1x, e1y] = polar(V, V, ray, a1);
	const [e2x, e2y] = polar(V, V, ray, a2);
	body.push(circle(e1x, e1y, 3.5, { fill: 'var(--ink)' }));
	body.push(circle(e2x, e2y, 3.5, { fill: 'var(--ink)' }));
	// Étiquettes : les extrémités JUSTE au-delà des bouts, le sommet décalé à l'OPPOSÉ de
	// l'ouverture (jamais sur un trait ni sur l'arc).
	const [l1x, l1y] = polar(V, V, ray + 15, a1);
	const [l2x, l2y] = polar(V, V, ray + 15, a2);
	const [lsx, lsy] = polar(V, V, 20, spec.bisector + 180);
	// `aria-hidden` : l'info est déjà portée par l'aria-label du SVG ; on évite une
	// double lecture parasite des lettres (role="img" devrait masquer ses enfants, mais
	// le comportement varie selon lecteur d'écran → défense en profondeur).
	const label = (x: number, y: number, t: string): string =>
		text(x, y, t, {
			fill: 'var(--ink)',
			'font-size': 17,
			'font-weight': 700,
			'text-anchor': 'middle',
			'dominant-baseline': 'central',
			'aria-hidden': 'true',
			class: 'angle-nomme-label',
		});
	body.push(label(l1x, l1y, p1), label(lsx, lsy, sommet), label(l2x, l2y, p2));
	// Libellé accessible : les 3 lettres DANS L'ORDRE de la notation (comme à l'écran),
	// SANS désigner le sommet — sinon on soufflerait la réponse (« quel point est le
	// sommet ? ») au lecteur d'écran, alors que l'enfant voyant doit l'associer lui-même.
	return svgCanvas(
		ANGLE_SIZE,
		ANGLE_SIZE,
		`Angle ${p1} ${sommet} ${p2}`,
		`Un angle formé de deux demi-droites, avec trois points nommés sur la figure : ${p1}, ${sommet}, ${p2}.`,
		body.join(''),
		'figure-angle',
		`Angle ${p1} ${sommet} ${p2}`,
	);
}
