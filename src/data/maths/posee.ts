/* ============================================================
   Calcul — les opérations posées (CALC1/2/4, #97).
   Trois leçons : addition, soustraction, multiplication posées.
   Le générateur produit un Exercise `posed` (op + opérandes) ; le
   catalogue en fait un Item `kind: 'posed'` que renderItem déploie en
   grille de colonnes (cellules-chiffres notées une à une).

   Calibrage pédagogique CE2 (avis pedagogue-primaire) :
   - addition : 2 termes, 2-3 chiffres ; retenues fréquentes mais variées.
   - soustraction : a ≥ b GARANTI, résultat ≥ 0 ; emprunts (et cascades
     503−287) acceptés, mélangés à des cas sans emprunt.
   - multiplication : ×1 chiffre (multiplicande ≤ 3 chiffres) en majorité ;
     ×2 chiffres (produits partiels) borné — multiplicande ≤ 2 chiffres,
     multiplicateur « doux » (chiffres simples, souvent un 1).
   ============================================================ */
import type { Exercise, ExerciseType } from '../../core/exercise';
import type { LessonInput } from '../_shared';
import { rnd, choice } from '../../core/utils';

interface PosedGen {
	op: '+' | '-' | 'x';
	a: number;
	b: number;
}

/* Multiplicateurs à 2 chiffres « doux » (chiffres ≤ 5 ou contenant un 1) :
   la difficulté porte sur le décalage et l'addition finale, pas sur des
   retenues internes lourdes. */
const MULT2 = [12, 13, 14, 15, 21, 23, 24, 25, 31, 32, 41, 51];

function additionGen(): PosedGen {
	return { op: '+', a: rnd(10, 999), b: rnd(10, 999) };
}
function soustractionGen(): PosedGen {
	const a = rnd(20, 999);
	const b = rnd(10, a); // a ≥ b → résultat ≥ 0 (jamais de négatif au CE2)
	return { op: '-', a, b };
}
function multiplicationGen(): PosedGen {
	// ~60 % par un chiffre (multiplicande 2-3 chiffres), ~40 % par deux chiffres.
	if (rnd(1, 10) <= 6) return { op: 'x', a: rnd(12, 999), b: rnd(2, 9) };
	return { op: 'x', a: rnd(12, 99), b: choice(MULT2) };
}

function posedType(gen: () => PosedGen, consigne: string): ExerciseType {
	return {
		// Format posé (#97) : classé sans appeler generate() (#348), exclu du sprint.
		exerciseKind: 'posed',
		// Consigne d'action (#265) : la grille posée n'a pas d'énoncé textuel ; sans elle,
		// l'enfant (surtout en révision) ne voyait que le libellé de leçon, jamais « quoi faire ».
		consigne,
		generate(): Exercise {
			const { op, a, b } = gen();
			return { type: 'posed', op, a, b };
		},
		// Non utilisé (correction cellule par cellule via verify) ; repli cohérent.
		check(exercise: Exercise, input: string): boolean {
			if (exercise.type !== 'posed') return false;
			const { op, a, b } = exercise;
			const r = op === '+' ? a + b : op === '-' ? a - b : a * b;
			return Number(input.trim()) === r;
		},
	};
}

export const POSEE_LESSONS: LessonInput[] = [
	{
		id: 'calc-addition-posee',
		label: "L'addition posée",
		exerciseType: posedType(additionGen, "Pose l'addition et calcule."),
	},
	{
		id: 'calc-soustraction-posee',
		label: 'La soustraction posée',
		exerciseType: posedType(soustractionGen, 'Pose la soustraction et calcule.'),
	},
	{
		id: 'calc-multiplication-posee',
		label: 'La multiplication posée',
		exerciseType: posedType(multiplicationGen, 'Pose la multiplication et calcule.'),
	},
];
