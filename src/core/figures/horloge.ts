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
import { circle, line, pointOnCircle, svgCanvas, text } from './primitives';

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
		'Horloge',
		"Cadran d'horloge à aiguilles : lis l'heure indiquée par la petite et la grande aiguille.",
		parts.join(''),
		'figure-horloge-svg',
		'Horloge à aiguilles',
	);

	// Légende (jamais l'info par la seule couleur) : rappelle le rôle des aiguilles.
	const legende =
		`<p class="clock-legend">` +
		`<span class="cl-dot cl-h" aria-hidden="true">●</span> petite&nbsp;= heures ` +
		`· <span class="cl-dot cl-m" aria-hidden="true">●</span> grande&nbsp;= minutes</p>`;

	return `<div class="figure-horloge">${svg}${legende}</div>`;
}
