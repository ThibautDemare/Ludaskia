/* ============================================================
   Grandeurs et mesures — Le périmètre (MES2, #99).
   Clientes du moteur de figures SVG (core/figures.ts). Trois leçons
   distinctes (avis pedagogue-primaire : 3 compétences différentes,
   cohérent avec la granularité « petites leçons ») :
   - `mes-perimetre-cotes` (prioritaire) : additionner les côtés d'une
     figure cotée (rectangle, triangle isocèle, figure en L) ;
   - `mes-perimetre-quadrillage` : compter les côtés de carreaux du
     contour d'une figure rectiligne sur quadrillage ;
   - `mes-perimetre-formule` (avancé) : déduire le périmètre d'un carré
     (4 × côté) ou d'un rectangle (longueur + largeur).
   Réponse NUMÉRIQUE ; l'unité « cm » est affichée par l'app (non saisie).
   Définition rappelée à chaque question (noyau invariable « le tour »).

   Calibrage pédagogique CE2 (avis pedagogue-primaire) :
   - côtés entiers 2–15 cm, périmètre total ≤ ~50 (addition mentale) ;
   - triangle ISOCÈLE dessiné à l'échelle (jamais une cote qui contredit
     le dessin), inégalité triangulaire garantie ;
   - figure en L = 6 côtés cohérents (générée depuis un rectangle évidé) ;
   - quadrillage : figure ≤ 6×6, périmètre 8–20 côtés ; on surligne le
     contour et on compte des CÔTÉS de carreaux (pas des cases → aire) ;
   - formules : carré côté 2–12, rectangle L≠l avec L+l ≤ 30.
   ============================================================ */
import type { Exercise, ExerciseType, GenerateOpts } from '../../core/exercise';
import type { LessonInput } from '../_shared';
import { checkNumerique } from '../../core/check-helpers';
import { renderFigure, boundaryEdges } from '../../core/figures';
import { rnd } from '../../core/utils';

type Pt = [number, number];

/* ---------- Sous-objectif 1 : additionner les côtés cotés ---------- */

function rectangleCote(): { points: Pt[]; labels: string[]; perim: number } {
	const W = rnd(3, 12);
	let H = rnd(2, 9);
	if (W === H) H = H < 9 ? H + 1 : H - 1; // un vrai rectangle (pas un carré)
	const points: Pt[] = [
		[0, 0],
		[W, 0],
		[W, H],
		[0, H],
	];
	return { points, labels: [`${W}`, `${H}`, `${W}`, `${H}`], perim: 2 * (W + H) };
}

function triangleCote(): { points: Pt[]; labels: string[]; perim: number } {
	// Isocèle : base b, deux côtés égaux s (s > b/2 pour exister ; à l'échelle).
	for (;;) {
		const b = rnd(4, 12);
		const minS = Math.max(3, Math.floor(b / 2) + 1);
		const maxS = Math.floor((45 - b) / 2);
		if (maxS < minS) continue;
		const s = rnd(minS, maxS);
		const hgt = Math.sqrt(s * s - (b / 2) * (b / 2)); // hauteur (dessin à l'échelle)
		const points: Pt[] = [
			[0, 0],
			[b, 0],
			[b / 2, hgt],
		];
		return { points, labels: [`${b}`, `${s}`, `${s}`], perim: b + 2 * s };
	}
}

function figureEnL(): { points: Pt[]; labels: string[]; perim: number } {
	// Rectangle W×H évidé d'un coin (haut-droite) de cw×ch → 6 côtés cohérents.
	const W = rnd(5, 10);
	const H = rnd(4, 8);
	const cw = rnd(2, W - 2);
	const ch = rnd(2, H - 2);
	const points: Pt[] = [
		[0, 0],
		[W, 0],
		[W, H - ch],
		[W - cw, H - ch],
		[W - cw, H],
		[0, H],
	];
	const labels = [`${W}`, `${H - ch}`, `${cw}`, `${ch}`, `${W - cw}`, `${H}`];
	return { points, labels, perim: 2 * (W + H) }; // un L a le périmètre de son rectangle englobant
}

function cotesFact(): Exercise {
	const r = rnd(1, 100);
	const f = r <= 45 ? rectangleCote() : r <= 70 ? triangleCote() : figureEnL();
	return {
		type: 'text',
		question: "Le périmètre, c'est le tour : ajoute tous les côtés. @ cm",
		answer: String(f.perim),
		figure: renderFigure({ kind: 'polygoneCote', points: f.points, labels: f.labels }),
	};
}

/* ---------- Sous-objectif 2 : contour sur quadrillage ---------- */

function quadrillageFact(): Exercise {
	const a = rnd(2, 5);
	const b = rnd(2, 5);
	// ~45 % : on évide un coin (figure en L sur grille), sinon rectangle plein.
	const notch = rnd(1, 100) <= 45 && a >= 3 && b >= 3;
	const cw = notch ? rnd(1, a - 1) : 0;
	const ch = notch ? rnd(1, b - 1) : 0;
	const cells: Pt[] = [];
	for (let y = 0; y < b; y++) {
		for (let x = 0; x < a; x++) {
			if (notch && x >= a - cw && y < ch) continue; // coin haut-droite évidé
			cells.push([x + 1, y + 1]); // marge d'1 case autour de la figure
		}
	}
	const perim = boundaryEdges(cells).length;
	return {
		type: 'text',
		question: "Le périmètre, c'est le tour : compte les côtés de carreaux qui en font le tour. @",
		answer: String(perim),
		figure: renderFigure({ kind: 'quadrillage', cols: a + 2, rows: b + 2, cells }),
	};
}

/* ---------- Sous-objectif 3 : déduire d'une formule ---------- */

function formuleFact(): Exercise {
	if (rnd(0, 1) === 0) {
		// Carré : 4 × côté (un seul côté coté sur la figure).
		const c = rnd(2, 12);
		const points: Pt[] = [
			[0, 0],
			[c, 0],
			[c, c],
			[0, c],
		];
		return {
			type: 'text',
			question: `Le périmètre, c'est le tour. Ce carré a un côté de ${c} cm. Périmètre : @ cm`,
			answer: String(4 * c),
			figure: renderFigure({ kind: 'polygoneCote', points, labels: [`${c}`, '', '', ''] }),
		};
	}
	// Rectangle : longueur + largeur (seules 2 dimensions cotées → à déduire).
	let L = rnd(3, 15);
	let l = rnd(2, 12);
	if (L === l) l = l > 2 ? l - 1 : l + 1;
	if (l > L) [L, l] = [l, L];
	const points: Pt[] = [
		[0, 0],
		[L, 0],
		[L, l],
		[0, l],
	];
	return {
		type: 'text',
		question: `Le périmètre, c'est le tour. Ce rectangle mesure ${L} cm de long et ${l} cm de large. Périmètre : @ cm`,
		answer: String(2 * (L + l)),
		figure: renderFigure({ kind: 'polygoneCote', points, labels: [`${L}`, `${l}`, '', ''] }),
	};
}

/* ---------- Fabrique + descripteurs ---------- */

function perimetreType(genFact: () => Exercise): ExerciseType {
	return {
		generate(_opts?: GenerateOpts): Exercise {
			return genFact();
		},
		check: checkNumerique,
	};
}

export const PERIMETRE_LESSONS: LessonInput[] = [
	{
		id: 'mes-perimetre-cotes',
		label: 'Je calcule le périmètre',
		exerciseType: perimetreType(cotesFact),
	},
	{
		id: 'mes-perimetre-quadrillage',
		label: 'Le périmètre sur quadrillage',
		exerciseType: perimetreType(quadrillageFact),
	},
	{
		id: 'mes-perimetre-formule',
		label: 'Périmètre du carré et du rectangle',
		exerciseType: perimetreType(formuleFact),
	},
];
