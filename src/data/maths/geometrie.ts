/* ============================================================
   Géométrie — Je reconnais les figures planes (GEOM4/6/7, #100).
   Clientes du moteur de figures SVG (core/figures.ts). Deux leçons
   distinctes (avis pedagogue-primaire : deux compétences) :
   - `geo-figures-reconnaitre` : identification VISUELLE — nommer une
     figure affichée, ou compter les figures d'une forme dans une scène.
     Deux modes (#69) : `qcm` (conseillé, reconnaissance) et `saisie`
     (on écrit le nom / le nombre ; fiche imprimable).
   - `geo-figures-proprietes` : propriétés et vocabulaire (nombre de
     côtés, angles droits, côtés égaux) — QCM textuel.

   Calibrage pédagogique CE2 (avis pedagogue-primaire + designer) :
   - figures retenues : carré, rectangle, triangle, triangle rectangle,
     losange, cercle. PAS le parallélogramme comme réponse au CE2 (réponse de
     reconnaissance seulement au CM1, #242) — déclaré dans NOM mais jamais
     tiré par un générateur CE2.
   - carré parfois incliné (~30-40°, jamais 45° = indécidable vs losange) ;
     losange à diagonales inégales (clairement pas un carré tourné).
   - scène de comptage : ≤ 6 figures, réponse cible 1–4, formes sûres
     (carré/rectangle/triangle/cercle), monochrome (la couleur n'est pas
     un indice), figures droites pour lever toute ambiguïté.
   - propriétés : pas d'inclusion (« un carré est-il un rectangle ? »),
     pas de double négation ; une propriété observable et tranchée.
   ============================================================ */
import type { Exercise, ExerciseType, ModeOption, GenerateOpts } from '../../core/exercise';
import type { PlaneShape } from '../../core/figures';
import { renderFigure } from '../../core/figures';
import { rnd, choice, sample, normalizeText } from '../../core/utils';

/* ---------- Identification visuelle ---------- */

const NOM: Record<PlaneShape, string> = {
	carre: 'carré',
	rectangle: 'rectangle',
	triangle: 'triangle',
	triangleRectangle: 'triangle', // au CE2, on accepte « triangle » (pas de distinguo en nommage)
	// Triangles particuliers CM1 (#242) : au CE2 ils ne sont jamais tirés (NOMS_QCM /
	// le pool de tirage ci-dessous restent CE2), mais le NOM doit couvrir l'union.
	triangleEquilateral: 'triangle équilatéral',
	triangleIsocele: 'triangle isocèle',
	triangleQuelconque: 'triangle quelconque',
	losange: 'losange',
	cercle: 'cercle',
	parallelogramme: 'parallélogramme',
};
const PLURIEL: Record<string, string> = {
	carre: 'carrés',
	rectangle: 'rectangles',
	triangle: 'triangles',
	cercle: 'cercles',
};
const NOMS_QCM = ['carré', 'rectangle', 'triangle', 'losange', 'cercle'];

const MODES: ModeOption[] = [
	{
		id: 'qcm',
		label: 'Je choisis la bonne réponse',
		hint: 'parmi 4',
		icon: 'hand-pointing',
		recommended: true,
	},
	{ id: 'saisie', label: "J'écris la réponse", hint: 'au clavier', icon: 'keyboard' },
];

interface Fait {
	base: string; // énoncé (sans `@`)
	answer: string;
	choices: string[]; // pour le QCM (mélangés)
	figure: string;
}

/* Orientation de la figure unique : le carré s'incline parfois (objectif CE2),
   sans jamais atteindre 45° (indécidable visuellement vs losange). */
function rotationPour(shape: PlaneShape): number {
	switch (shape) {
		case 'carre':
			return rnd(1, 100) <= 30 ? choice([30, 35, 40]) : 0;
		case 'rectangle':
			return rnd(1, 100) <= 30 ? choice([-15, 15]) : 0;
		case 'triangle':
			return choice([0, 0, 180, 15, -15]);
		case 'triangleRectangle':
			return choice([0, 90, 180, 270]);
		default:
			return 0;
	}
}

function nommerFait(): Fait {
	// Formes faciles majoritaires ; losange / triangle rectangle plus rares.
	const shape = choice<PlaneShape>([
		'carre',
		'carre',
		'rectangle',
		'rectangle',
		'triangle',
		'triangle',
		'cercle',
		'cercle',
		'triangleRectangle',
		'losange',
	]);
	const answer = NOM[shape];
	const distract = sample(
		NOMS_QCM.filter((n) => n !== answer),
		3,
	);
	const choices = sample([answer, ...distract], 4);
	const figure = renderFigure({ kind: 'figurePlane', shape, rotation: rotationPour(shape) });
	return { base: 'Quelle est cette figure ?', answer, choices, figure };
}

function compterFait(): Fait {
	const cible = choice<PlaneShape>(['carre', 'rectangle', 'triangle', 'cercle']);
	const t = rnd(1, 4); // nombre de figures cibles (réponse)
	const nDist = rnd(1, Math.min(3, 6 - t)); // au moins un distracteur, total ≤ 6
	const pool: PlaneShape[] = (
		['carre', 'rectangle', 'triangle', 'cercle', 'losange'] as PlaneShape[]
	).filter((s) => s !== cible);
	const cells: Array<{ shape: PlaneShape; rotation?: number }> = [];
	for (let i = 0; i < t; i++)
		cells.push({ shape: cible, rotation: cible === 'triangle' ? choice([0, 180]) : 0 });
	for (let i = 0; i < nDist; i++) {
		const s = choice(pool);
		cells.push({ shape: s, rotation: s === 'triangle' ? choice([0, 180]) : 0 });
	}
	const figure = renderFigure({ kind: 'sceneFigures', cells: sample(cells, cells.length) });
	// Choix = la bonne réponse + 3 distracteurs numériques plausibles (0..6, distincts).
	const autres = [
		...new Set([t - 1, t + 1, t + 2, t - 2].filter((d) => d >= 0 && d <= 6 && d !== t)),
	];
	const choices = sample(
		[t, ...sample(autres, Math.min(3, autres.length))],
		Math.min(4, autres.length + 1),
	).map(String);
	return {
		base: `Combien de ${PLURIEL[cible]} y a-t-il ?`,
		answer: String(t),
		choices,
		figure,
	};
}

function reconnaitreType(): ExerciseType {
	return {
		modes: MODES,
		generate(opts?: GenerateOpts): Exercise {
			const mode = opts?.mode;
			const f = rnd(1, 100) <= 60 ? nommerFait() : compterFait();
			if (mode === 'qcm') {
				return {
					type: 'qcm',
					question: f.base,
					answer: f.answer,
					choices: f.choices,
					figure: f.figure,
				};
			}
			return {
				type: 'text',
				question: `${f.base} @`,
				answer: f.answer,
				answers: [f.answer],
				figure: f.figure,
			};
		},
		check(exercise: Exercise, input: string): boolean {
			if (exercise.type !== 'text' && exercise.type !== 'qcm') return false;
			const a = exercise.answer;
			return /^\d+$/.test(a)
				? Number(input.trim().replace(',', '.')) === Number(a)
				: normalizeText(input) === normalizeText(a);
		},
	};
}

/* ---------- Propriétés et vocabulaire (QCM) ---------- */

interface PropQ {
	q: string;
	a: string;
	choices: string[];
}
const PROPRIETES: PropQ[] = [
	{ q: 'Combien de côtés a un carré ?', a: '4', choices: ['3', '4', '5', '6'] },
	{ q: 'Combien de côtés a un triangle ?', a: '3', choices: ['2', '3', '4', '5'] },
	{ q: 'Combien de côtés a un rectangle ?', a: '4', choices: ['3', '4', '5', '6'] },
	{ q: 'Combien de côtés égaux a un carré ?', a: '4', choices: ['1', '2', '3', '4'] },
	{ q: "Combien d'angles droits a un rectangle ?", a: '4', choices: ['1', '2', '3', '4'] },
	{
		q: 'Quelle figure a 4 côtés égaux et 4 angles droits ?',
		a: 'carré',
		choices: ['carré', 'rectangle', 'losange', 'triangle'],
	},
	{
		q: "Quelle figure a 4 côtés égaux mais pas d'angle droit ?",
		a: 'losange',
		choices: ['losange', 'carré', 'rectangle', 'triangle'],
	},
	{
		q: 'Quelle figure a 3 côtés ?',
		a: 'triangle',
		choices: ['triangle', 'carré', 'rectangle', 'losange'],
	},
	{
		q: 'Le triangle rectangle a…',
		a: 'un angle droit',
		choices: ['un angle droit', 'quatre angles droits', 'aucun angle droit', 'trois côtés égaux'],
	},
	{
		q: 'Le rectangle a ses côtés opposés…',
		a: 'égaux',
		choices: ['égaux', 'tous égaux', 'différents', 'courbes'],
	},
	// ----- Ajouts #285 (variété) : propriétés observables et tranchées, sans inclusion
	// (« un carré est-il un rectangle ») ni double négation. -----
	{ q: 'Combien de côtés a un losange ?', a: '4', choices: ['3', '4', '5', '6'] },
	{ q: "Combien d'angles droits a un carré ?", a: '4', choices: ['1', '2', '3', '4'] },
	{ q: 'Combien de côtés égaux a un losange ?', a: '4', choices: ['1', '2', '3', '4'] },
	{ q: 'Combien de sommets a un triangle ?', a: '3', choices: ['2', '3', '4', '5'] },
	{ q: 'Combien de sommets a un rectangle ?', a: '4', choices: ['3', '4', '5', '6'] },
	{ q: 'Combien de côtés a un triangle rectangle ?', a: '3', choices: ['2', '3', '4', '5'] },
	{
		q: "Combien d'angles droits a un triangle rectangle ?",
		a: '1',
		choices: ['0', '1', '2', '3'],
	},
	{
		q: 'Quelle figure est toute ronde ?',
		a: 'cercle',
		choices: ['cercle', 'carré', 'triangle', 'losange'],
	},
	{
		q: 'Le carré a ses quatre côtés…',
		a: 'égaux',
		choices: ['égaux', 'différents', 'courbes', 'arrondis'],
	},
	{
		q: 'Le losange a ses quatre côtés…',
		a: 'égaux',
		choices: ['égaux', 'différents', 'courbes', 'arrondis'],
	},
	{
		q: 'Le rectangle a…',
		a: 'quatre angles droits',
		choices: ['quatre angles droits', 'aucun angle droit', 'trois côtés', 'des côtés courbes'],
	},
	{
		q: 'Le triangle a…',
		a: 'trois côtés',
		choices: ['trois côtés', 'quatre côtés', 'aucun côté', 'des côtés courbes'],
	},
];

function proprietesType(): ExerciseType {
	return {
		modes: [
			{ id: 'qcm', label: 'Je choisis la bonne réponse', icon: 'hand-pointing', recommended: true },
		],
		generate(): Exercise {
			const p = choice(PROPRIETES);
			return {
				type: 'qcm',
				question: p.q,
				answer: p.a,
				choices: sample(p.choices, p.choices.length),
			};
		},
		check(exercise: Exercise, input: string): boolean {
			if (!('answer' in exercise)) return false;
			const a = exercise.answer;
			return /^\d+$/.test(a)
				? Number(input.trim().replace(',', '.')) === Number(a)
				: normalizeText(input) === normalizeText(a);
		},
	};
}

/* ---------- Descripteurs ---------- */

export interface GeometrieLessonDef {
	id: string;
	label: string;
	exerciseType: ExerciseType;
}

export const GEOMETRIE_LESSONS: GeometrieLessonDef[] = [
	{
		id: 'geo-figures-reconnaitre',
		label: 'Je reconnais les figures',
		exerciseType: reconnaitreType(),
	},
	{
		id: 'geo-figures-proprietes',
		label: 'Les propriétés des figures',
		exerciseType: proprietesType(),
	},
];
