/* ============================================================
   Grandeurs et mesures CM1 — Aire et périmètre (#253).
   ------------------------------------------------------------
   Contenu ADDITIF tagué CM1. UNE leçon QCM mono-réponse (runner existant lecon-qcm.ts),
   sur quadrillage. 100 % COMPTAGE, ZÉRO FORMULE (pas de L × l — hors programme CM1,
   réservé CM2). L'aire est comptée en CARREAUX (unité non conventionnelle) ; on ne dit
   JAMAIS « cm² » (le cm² supposerait d'annoncer « chaque carreau mesure 1 cm de côté »,
   non fait ici). Le périmètre est compté en CÔTÉS DE CARREAUX (comme la leçon CE2
   `mes-perimetre-quadrillage`, #99). Figures ≤ 6×6, rectilignes (jamais de diagonale).

   Progression du pool (pedagogue-primaire), items de comparaison MINORITAIRES (~25 %) :
   1. Compter l'AIRE seule (QCM, choix = nombres) — figure teintée + grille visible ;
   2. Rappel du PÉRIMÈTRE seul (acquis CE2) — contour corail ;
   3. VRAI/FAUX sur l'aire OU le périmètre d'une même figure ;
   4. COMPARER deux figures (« même aire ? » / « même périmètre ? »), paires choisies pour
      attaquer la confusion aire ↔ périmètre (même aire ≠ même périmètre) — le plus exigeant.

   « Grammaire visuelle » (designer) : grille visible sur fond teinté = compter des CASES
   (aire) ; trait corail épais = compter des CÔTÉS (périmètre). Le mode de dessin du
   quadrillage (`aire` / `perimetre`) suit la grandeur interrogée.

   INVARIANT PROJET : la réponse est CALCULÉE (comptage des cases / des côtés du contour)
   puis STOCKÉE dans l'Exercise à la génération, jamais recalculée au moment du check.
   ============================================================ */
import type { Exercise, ExerciseType, GenerateOpts, ModeOption } from '../../core/exercise';
import { checkAnswer } from '../../core/exercise';
import type { SchoolLevel } from '../../core/catalog';
import { etayageRedige, type LessonInput } from '../_shared';
import { renderFigure, boundaryEdges } from '../../core/figures';
import { rnd, sample, choice } from '../../core/utils';
import { type SafeHtml } from '../../core/html';

const NIVEAUX: SchoolLevel[] = ['cm1'];

const VRAI = 'Vrai';
const FAUX = 'Faux';
const OUI = 'Oui';
const NON = 'Non';

type Pt = [number, number];

interface FigureQuad {
	cols: number; // colonnes du quadrillage (avec la marge)
	rows: number; // lignes du quadrillage (avec la marge)
	cells: Pt[]; // cases pleines (coordonnées grille), marge d'1 case autour
	aire: number; // nombre de carreaux
	perimetre: number; // nombre de côtés de carreaux du tour
}

/* Fabrique une figure rectiligne (rectangle plein, ou L par évidage d'un coin) tenant dans
   `maxDim` × `maxDim` carreaux, avec une marge d'1 case autour (contexte du quadrillage).
   L'aire (cases) et le périmètre (côtés du contour) sont comptés puis stockés.
   Exportée pour permettre aux tests de vérifier en direct `aire === nb de cases` et
   `perimetre === boundaryEdges(cells)` (pas seulement via des proxys comportementaux). */
export function figureRectiligne(maxDim: number): FigureQuad {
	const a = rnd(2, maxDim);
	const b = rnd(2, maxDim);
	// ~40 % : on évide un coin (figure en L), possible seulement si les deux dimensions ≥ 3.
	const notch = rnd(1, 100) <= 40 && a >= 3 && b >= 3;
	const cw = notch ? rnd(1, a - 1) : 0;
	const ch = notch ? rnd(1, b - 1) : 0;
	const cells: Pt[] = [];
	for (let y = 0; y < b; y++) {
		for (let x = 0; x < a; x++) {
			if (notch && x >= a - cw && y < ch) continue; // coin haut-droite évidé
			cells.push([x + 1, y + 1]); // marge d'1 case autour de la figure
		}
	}
	return {
		cols: a + 2,
		rows: b + 2,
		cells,
		aire: cells.length,
		perimetre: boundaryEdges(cells).length,
	};
}

/* Quatre choix numériques distincts et positifs incluant le bon. Les `pieges` (autre
   grandeur de la MÊME figure, valeurs voisines) sont ajoutés en priorité, puis on complète
   avec des voisins ±1/±2. Positions mélangées. */
function choixNombres(bon: number, pieges: number[]): string[] {
	const set = new Set<number>([bon]);
	const ajoute = (n: number): void => {
		if (n > 0 && !set.has(n) && set.size < 4) set.add(n);
	};
	for (const p of pieges) ajoute(p);
	for (const d of [1, -1, 2, -2, 3, -3]) ajoute(bon + d);
	return sample([...set], set.size).map(String);
}

const figAireSvg = (f: FigureQuad): SafeHtml =>
	renderFigure({ kind: 'quadrillage', cols: f.cols, rows: f.rows, cells: f.cells, mode: 'aire' });
const figPerimetreSvg = (f: FigureQuad): SafeHtml =>
	renderFigure({
		kind: 'quadrillage',
		cols: f.cols,
		rows: f.rows,
		cells: f.cells,
		mode: 'perimetre',
	});

/* ---------- 1. Compter l'aire (carreaux) ---------- */
function factAire(): Exercise {
	const f = figureRectiligne(6);
	return {
		type: 'qcm',
		question: 'Combien de carreaux cette figure couvre-t-elle ?',
		answer: String(f.aire),
		// Le périmètre est le distracteur PRINCIPAL (confusion aire ↔ périmètre).
		choices: choixNombres(f.aire, [f.perimetre]),
		figure: figAireSvg(f),
		parle: 'Combien de carreaux cette figure couvre-t-elle ?',
	};
}

/* ---------- 2. Rappel du périmètre (côtés de carreaux) ---------- */
function factPerimetre(): Exercise {
	const f = figureRectiligne(6);
	return {
		type: 'qcm',
		question: 'Combien de côtés de carreaux font le tour de cette figure ?',
		answer: String(f.perimetre),
		choices: choixNombres(f.perimetre, [f.aire]),
		figure: figPerimetreSvg(f),
		parle: 'Combien de côtés de carreaux font le tour de cette figure ?',
	};
}

/* ---------- 3. Vrai / faux sur l'aire OU le périmètre d'une même figure ---------- */
function factVraiFaux(): Exercise {
	const f = figureRectiligne(6);
	const surAire = rnd(0, 1) === 0;
	const vrai = rnd(0, 1) === 0;
	const reel = surAire ? f.aire : f.perimetre;
	// Valeur affichée : la vraie, ou une valeur voisine strictement positive (écart ≠ 0).
	let affiche = reel;
	if (!vrai) {
		const deltas = [-2, -1, 1, 2].filter((d) => reel + d > 0);
		affiche = reel + choice(deltas);
	}
	// « Vrai ou faux ? » en PRÉFIXE (même convention que figures-proprietes.ts) : signale la
	// tâche avant l'affirmation.
	const question = surAire
		? `Vrai ou faux ? Cette figure couvre ${affiche} carreaux.`
		: `Vrai ou faux ? Le tour de cette figure mesure ${affiche} côtés de carreaux.`;
	return {
		type: 'qcm',
		question,
		answer: vrai ? VRAI : FAUX,
		choices: [VRAI, FAUX],
		figure: surAire ? figAireSvg(f) : figPerimetreSvg(f),
		parle: question,
	};
}

/* ---------- 4. Comparer deux figures (aire ou périmètre) ---------- */
function factComparaison(): Exercise {
	// Figures ≤ 5 pour la paire (taille de case commune, tiennent sous le plafond ~135 px).
	const f1 = figureRectiligne(5);
	let f2 = figureRectiligne(5);
	// On privilégie un cas PIÈGE : même aire mais périmètre différent (ou l'inverse) — c'est
	// le cœur de la confusion aire ↔ périmètre.
	for (let t = 0; t < 40; t++) {
		const cand = figureRectiligne(5);
		f2 = cand;
		if (
			(cand.aire === f1.aire && cand.perimetre !== f1.perimetre) ||
			(cand.perimetre === f1.perimetre && cand.aire !== f1.aire)
		) {
			break;
		}
	}
	const surAire = rnd(0, 1) === 0;
	const memes = surAire ? f1.aire === f2.aire : f1.perimetre === f2.perimetre;
	const question = surAire
		? 'Les deux figures ont-elles la même aire ?'
		: 'Les deux figures ont-elles le même périmètre ?';
	return {
		type: 'qcm',
		question,
		answer: memes ? OUI : NON, // CALCULÉ à la génération, STOCKÉ ici (jamais recalculé au check)
		choices: [OUI, NON],
		figure: renderFigure({
			kind: 'quadrillagePaire',
			a: { cols: f1.cols, rows: f1.rows, cells: f1.cells },
			b: { cols: f2.cols, rows: f2.rows, cells: f2.cells },
			mode: surAire ? 'aire' : 'perimetre',
			labels: ['A', 'B'],
		}),
		parle: question,
	};
}

/* ---------- Fabrique d'ExerciseType ---------- */
const MODE_QCM: ModeOption = {
	id: 'qcm',
	label: 'Je choisis la bonne réponse',
	icon: 'hand-pointing',
	recommended: true,
};

function airePerimetreType(): ExerciseType {
	return {
		levels: NIVEAUX,
		modes: [MODE_QCM],
		generate(_opts?: GenerateOpts): Exercise {
			const r = rnd(1, 100);
			if (r <= 35) return factAire(); // aire seule
			if (r <= 50) return factPerimetre(); // périmètre seul (rappel CE2)
			if (r <= 75) return factVraiFaux(); // vrai/faux sur une même figure
			return factComparaison(); // comparaison (minoritaire, le plus exigeant)
		},
		check: checkAnswer,
	};
}

/* Étend `LessonInput` pour porter l'exclusion du sprint. */
export interface AirePerimetreLessonDef extends LessonInput {
	excludeFromSprint?: boolean;
}

export const AIRE_PERIMETRE_LESSONS: AirePerimetreLessonDef[] = [
	{
		id: 'mes-aire-perimetre',
		label: 'Aire et périmètre',
		exerciseType: airePerimetreType(),
		// Toute la leçon tient dans la distinction des deux mots : le 1ᵉʳ pas est donc un pas
		// de LECTURE de la question. La règle reste courte (c'est le repère affiché en
		// permanence) et c'est le pas qui porte l'indépendance des deux grandeurs, sans quoi
		// l'enfant croit que « plus grand tour » veut dire « plus grande surface ».
		etayage: [
			etayageRedige(
				'Aire ou périmètre ?',
				"Le périmètre mesure le TOUR, l'aire mesure la SURFACE couverte.",
				[
					'Lis la question : parle-t-elle du tour (périmètre) ou de la surface (aire) ? Même tour ne veut pas dire même surface.',
					"Pour une AIRE, compte les carreaux à l'intérieur de la figure.",
					'Pour un PÉRIMÈTRE, compte les côtés de carreaux qui font le contour.',
				],
			),
		],
		// Comptage visuel soigné + items vrai/faux et oui/non devinables à 50 % : incompatible
		// avec la pression du chrono → exclue du sprint (comme la symétrie et la divisibilité).
		excludeFromSprint: true,
	},
];
