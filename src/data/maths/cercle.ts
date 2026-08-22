/* ============================================================
   Géométrie — Le cercle (GEOM9, #102 ; plages par niveau #287).
   Cliente du moteur de figures SVG (core/figures.ts, `renderCercle`).
   Une leçon `geom-cercle`, deux modes (#69) : `qcm` (conseillé) et
   `saisie` (fiche imprimable). Trois familles de questions :
   - rayon → diamètre (d = 2 r) ;
   - diamètre → rayon (r = d / 2) ;
   - vocabulaire (centre / rayon / diamètre).
   Le cercle affiché met en évidence le segment concerné (rayon ou
   diamètre), coté pour le calcul ou marqué « ? » pour le vocabulaire.

   Calibrage CE2 : rayon 2–20 (#287) ; le diamètre toujours pair (= 2 r,
   donc r ↔ d entier) ; distracteurs = confusion rayon/diamètre (oubli ou
   ajout du ×2). Effort faible (pas de moteur complexe).

   Multi-niveaux (#225/#287) : la leçon est `calibrated` par une table
   { ce2, cm1 } ; seule la borne max du rayon change (CE2 2–20, CM1 2–50),
   le diamètre restant PAIR pour que r ↔ d reste entier à tous les niveaux.
   Le CM1 reste prêt derrière le paramètre `level` (non surfacé au catalogue,
   déploiement du cursus séparé).
   ============================================================ */
import type { Exercise, ExerciseType, ModeOption, GenerateOpts } from '../../core/exercise';
import { etayageRedige, MODE_QCM_POINT } from '../_shared';
import type { LessonInput } from '../_shared';
import { calibrated } from '../../core/level-combinators';
import { renderFigure } from '../../core/figures';
import { checkNumeriqueOuTexte } from '../../core/check-helpers';
import { rnd, choice, sample } from '../../core/utils';
import { type SafeHtml } from '../../core/html';

const MODES: ModeOption[] = [
	{ ...MODE_QCM_POINT, hint: 'parmi 4' },
	{ id: 'saisie', label: "J'écris la réponse", hint: 'au clavier', icon: 'keyboard' },
];

interface Fait {
	base: string; // énoncé (sans `@`)
	answer: string;
	unit: string; // ' cm' (calcul) ou '' (vocabulaire)
	choices: string[]; // pour le QCM (mélangés)
	figure: SafeHtml;
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

/* Plage du rayon, calibrée par niveau (#287). Le diamètre = 2 × rayon reste
   PAIR → r ↔ d entier à tous les niveaux (pas de demi-entier au CM1). */
interface CercleConfig {
	rayonMax: number; // borne max du rayon (CE2 : 20, CM1 : 50)
}

function rayonVersDiametre(rayonMax: number): Fait {
	const ray = rnd(2, rayonMax);
	const ans = 2 * ray;
	return {
		base: `Le rayon mesure ${ray} cm. Quel est le diamètre ?`,
		answer: String(ans),
		unit: ' cm',
		choices: choixNum(ans, [ray, ans - 2, ans + 2]), // confusion : oubli du ×2
		figure: renderFigure({ kind: 'cercle', segment: 'rayon', label: `${ray} cm` }),
	};
}

function diametreVersRayon(rayonMax: number): Fait {
	const ray = rnd(2, rayonMax);
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

function cercleType(config: CercleConfig): ExerciseType {
	return {
		modes: MODES,
		generate(opts?: GenerateOpts): Exercise {
			const mode = opts?.mode;
			const r = rnd(1, 100);
			const f =
				r <= 40
					? rayonVersDiametre(config.rayonMax)
					: r <= 70
						? diametreVersRayon(config.rayonMax)
						: vocabulaireFait();
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
		check: checkNumeriqueOuTexte,
	};
}

export const CERCLE_LESSONS: LessonInput[] = [
	{
		id: 'geom-cercle',
		label: 'Le cercle',
		exerciseType: calibrated<CercleConfig>(
			{
				ce2: { rayonMax: 20 }, // rayon 2–20
				cm1: { rayonMax: 50 }, // rayon 2–50 (diamètre toujours pair → r ↔ d entier)
			},
			cercleType,
		),
		// Les deux sens sont donnés (rayon → diamètre ET diamètre → rayon) parce que la
		// leçon pose les deux questions : ne montrer que le doublement ferait doubler aussi
		// dans l'autre sens, qui est l'erreur la plus fréquente ici.
		etayage: [
			etayageRedige(
				'Le rayon et le diamètre',
				'Le diamètre traverse le cercle en passant par le centre : il vaut deux rayons.',
				[
					"Regarde ce que l'énoncé donne : le rayon ou le diamètre ?",
					'Du rayon au diamètre, multiplie par 2 : un rayon de 6 cm donne un diamètre de 12 cm.',
					'Du diamètre au rayon, prends la moitié : un diamètre de 28 cm donne un rayon de 14 cm.',
				],
			),
		],
	},
];
