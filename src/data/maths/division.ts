/* ============================================================
   Division par le sens (#104) — Calcul mental CE2.
   Au CE2, la division s'aborde par le SENS (partage équitable et groupement),
   jamais en technique posée (= CM1). Division EXACTE uniquement (reste nul),
   adossée aux tables (réciproque de la multiplication). Le signe ÷ n'apparaît
   JAMAIS seul : il est toujours précédé d'une phrase qui décrit la situation.
   Conception pédagogique : avis pedagogue-primaire (#104).

   Deux leçons :
   1. « Moitié et quart d'une collection » — fraction-opérateur (dénominateurs 2
      et 4), résultat entier garanti. Pas de signe ÷, pas de figure.
   2. « Je partage » — division exacte dans les tables, DEUX sens (partage /
      groupement) clairement contrastés, signe ÷ adossé à la situation. Une
      figure « situation de départ » (jetons + paniers vides) sur une minorité
      d'items de découverte (total ≤ 12) — exclue du sprint (cf. catalog).
   ============================================================ */
import { choice, rnd } from '../../core/utils';
import type { Exercise, ExerciseType } from '../../core/exercise';
import { renderFigure } from '../../core/figures';

const numerique = (ex: Exercise, input: string): boolean =>
	'answer' in ex && Number(input.trim().replace(',', '.')) === Number(ex.answer);

/* ---------- Leçon 1 : Moitié et quart d'une collection ---------- */
// Fraction-opérateur (« prendre la moitié / le quart de »), distincte du signe ÷
// (leçon 2). Résultat entier garanti par tirage d'un multiple ; quotient ≥ 2.
function moitieQuartType(): ExerciseType {
	return {
		generate(): Exercise {
			if (rnd(0, 1) === 0) {
				const q = rnd(2, 20); // résultat 2..20
				return { type: 'text', question: `moitié de ${q * 2} = @`, answer: String(q) };
			}
			const q = rnd(2, 10); // résultat 2..10
			return { type: 'text', question: `quart de ${q * 4} = @`, answer: String(q) };
		},
		check: numerique,
	};
}

/* ---------- Leçon 2 : Je partage ---------- */
// Diviseur privilégié au début : tables solides (2, 5, 10) puis 3, 4, puis le
// reste — pondération par répétition dans le pool (avis pédagogue).
const POOL_DIVISEUR = [2, 2, 2, 5, 5, 5, 10, 10, 3, 3, 4, 4, 6, 7, 8, 9];

// Tire (diviseur, quotient) : division exacte, diviseur ≥ 2, quotient ≥ 2,
// dividende = diviseur × quotient ≤ 100, le tout dans les tables (≤ 10).
function tirePartition(): { diviseur: number; quotient: number; total: number } {
	const diviseur = choice(POOL_DIVISEUR);
	const quotient = rnd(2, Math.min(10, Math.floor(100 / diviseur)));
	return { diviseur, quotient, total: diviseur * quotient };
}

function partageType(): ExerciseType {
	return {
		generate(): Exercise {
			const { diviseur, quotient, total } = tirePartition();
			const groupement = rnd(0, 1) === 0;

			if (groupement) {
				// GROUPEMENT (quotition) : on connaît la TAILLE d'un paquet, on cherche le
				// NOMBRE de paquets. Marqueurs : « par paquets de … » → « combien de … ».
				// (taille = quotient, nombre de paquets = diviseur → réponse = diviseur)
				const taille = quotient;
				const nbPaquets = diviseur;
				return {
					type: 'text',
					question: `On range ${total} jetons par paquets de ${taille}. ${total} ÷ ${taille} = @`,
					answer: String(nbPaquets),
				};
			}

			// PARTAGE (partition) : on connaît le NOMBRE de parts, on cherche la VALEUR
			// d'une part. Marqueurs : « partager en … » → « dans chaque … ».
			// Figure « situation de départ » sur une minorité d'items de découverte
			// (total ≤ 12) : jetons en vrac + paniers VIDES, sans donner la réponse.
			const decouverte = total <= 12 && rnd(0, 9) < 4;
			if (decouverte) {
				return {
					type: 'text',
					question: `On partage ${total} jetons en ${diviseur} paniers égaux. Combien de jetons dans chaque panier ? @`,
					answer: String(quotient),
					figure: renderFigure({ kind: 'groupes', paniers: diviseur, total }),
				};
			}
			return {
				type: 'text',
				question: `On partage ${total} jetons en ${diviseur} paniers égaux. ${total} ÷ ${diviseur} = @`,
				answer: String(quotient),
			};
		},
		check: numerique,
	};
}

export interface DivisionLessonDef {
	id: string;
	label: string;
	exerciseType: ExerciseType;
	excludeFromSprint?: boolean;
}

export const DIVISION_LESSONS: DivisionLessonDef[] = [
	{
		id: 'math-div-moitie-quart',
		label: "Moitié et quart d'une collection",
		exerciseType: moitieQuartType(),
	},
	{
		id: 'math-div-partage',
		label: 'Je partage',
		exerciseType: partageType(),
		// Lecture d'énoncé + figure de découverte : incompatible avec le chrono.
		excludeFromSprint: true,
	},
];
