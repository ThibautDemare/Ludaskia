/* ---------- Groupes de jetons (#104, division par le sens) ----------
   Montre la SITUATION DE DÉPART d'un partage : la collection (jetons en vrac)
   au-dessus, et les contenants VIDES (paniers) en dessous. La figure porte le
   SENS (« répartir cette collection dans ces paniers »), jamais le RÉSULTAT (les
   paniers restent vides → l'enfant calcule, il ne compte pas une réponse déjà
   posée). Avis pedagogue-primaire (#104). Total dessiné plafonné ~12 (lisibilité).
   Calibré pour la plage réellement tirée : `paniers` 2..6, `total` 4..12 (la
   disposition suppose un petit nombre de paniers — au-delà, `bw` se resserrerait). */
import { circle, polygon, polyline, r2, svgCanvas } from './primitives';

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
