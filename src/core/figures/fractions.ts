/* ---------- Fractions (#200 — sens, égalités, comparaison, bande graduée) ----------
   Modèle visuel UNIQUE (avis designer-ux-enfant) : la BARRE horizontale divisée en
   colonnes verticales d'égale largeur (métaphore « plaquette de chocolat »), pour
   toutes les fractions (dénominateur 2..12). Les parts sont RIGOUREUSEMENT égales
   (largeur = W/dén, garantie par le code — exigence absolue de l'issue : une part
   inégale serait un contresens). Distinction coloriée / vide par DOUBLE signal (jamais
   la seule couleur) : remplissage `--accent-soft` ET un point plein central `--accent`
   sur les parts coloriées (robuste au daltonisme), contour franc partout. */
import { circle, line, r2, rect, svgCanvas, text } from './primitives';

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
