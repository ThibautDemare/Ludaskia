/* ============================================================
   Géométrie — Le cercle (GEOM9, #102).
   Cliente du moteur de figures SVG (core/figures.ts, `renderCercle`).
   Une leçon `geom-cercle`, deux modes (#69) : `qcm` (conseillé) et
   `saisie` (fiche imprimable). Trois familles de questions :
   - rayon → diamètre (d = 2 r) ;
   - diamètre → rayon (r = d / 2) ;
   - vocabulaire (centre / rayon / diamètre).
   Le cercle affiché met en évidence le segment concerné (rayon ou
   diamètre), coté pour le calcul ou marqué « ? » pour le vocabulaire.

   Calibrage CE2 : nombres petits (rayon 2–15) ; le diamètre toujours
   pair (= 2 r) ; distracteurs = confusion rayon/diamètre (oubli ou
   ajout du ×2). Effort faible (pas de moteur complexe).
   ============================================================ */
import type { Exercise, ExerciseType, ExerciseMode, ModeOption } from '../../core/exercise';
import { renderFigure } from '../../core/figures';
import { rnd, choice, sample, normalizeText } from '../../core/utils';

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
	unit: string; // ' cm' (calcul) ou '' (vocabulaire)
	choices: string[]; // pour le QCM (mélangés)
	figure: string;
}

/* Choix numériques : la bonne réponse + 3 distracteurs distincts (> 0). */
function choixNum(answer: number, distract: number[]): string[] {
	const s = new Set<number>();
	for (const d of distract) if (d > 0 && d !== answer) s.add(d);
	let k = 1;
	while (s.size < 3) {
		if (answer - k > 0) s.add(answer - k);
		if (s.size < 3) s.add(answer + k);
		k++;
	}
	return sample([answer, ...sample([...s], 3)], 4).map(String);
}

function rayonVersDiametre(): Fait {
	const ray = rnd(2, 15);
	const ans = 2 * ray;
	return {
		base: `Le rayon mesure ${ray} cm. Quel est le diamètre ?`,
		answer: String(ans),
		unit: ' cm',
		choices: choixNum(ans, [ray, ans - 2, ans + 2]), // confusion : oubli du ×2
		figure: renderFigure({ kind: 'cercle', segment: 'rayon', label: `${ray} cm` }),
	};
}

function diametreVersRayon(): Fait {
	const ray = rnd(2, 15);
	const dia = 2 * ray;
	return {
		base: `Le diamètre mesure ${dia} cm. Quel est le rayon ?`,
		answer: String(ray),
		unit: ' cm',
		choices: choixNum(ray, [dia, ray + 1, ray - 1]), // confusion : on garde le diamètre
		figure: renderFigure({ kind: 'cercle', segment: 'diametre', label: `${dia} cm` }),
	};
}

interface VocFait {
	q: string;
	a: string;
	choices: string[];
	segment?: 'rayon' | 'diametre';
}
const VOCABULAIRE: VocFait[] = [
	{
		q: "Comment s'appelle le segment qui va du centre jusqu'au bord ?",
		a: 'rayon',
		choices: ['rayon', 'diamètre', 'centre', 'côté'],
		segment: 'rayon',
	},
	{
		q: 'Comment appelle-t-on le segment qui traverse le cercle en passant par le centre ?',
		a: 'diamètre',
		choices: ['diamètre', 'rayon', 'centre', 'sommet'],
		segment: 'diametre',
	},
	{
		q: 'Comment appelle-t-on le point au milieu du cercle ?',
		a: 'centre',
		choices: ['centre', 'rayon', 'diamètre', 'milieu'],
	},
];

function vocabulaireFait(): Fait {
	const v = choice(VOCABULAIRE);
	return {
		base: v.q,
		answer: v.a,
		unit: '',
		choices: sample(v.choices, v.choices.length),
		figure: renderFigure({
			kind: 'cercle',
			segment: v.segment,
			label: v.segment ? '?' : undefined,
		}),
	};
}

function cercleType(): ExerciseType {
	return {
		modes: MODES,
		generate(mode?: ExerciseMode): Exercise {
			const r = rnd(1, 100);
			const f = r <= 40 ? rayonVersDiametre() : r <= 70 ? diametreVersRayon() : vocabulaireFait();
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
				question: `${f.base} @${f.unit}`,
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

export interface CercleLessonDef {
	id: string;
	label: string;
	exerciseType: ExerciseType;
}

export const CERCLE_LESSONS: CercleLessonDef[] = [
	{
		id: 'geom-cercle',
		label: 'Le cercle',
		exerciseType: cercleType(),
	},
];
