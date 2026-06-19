/* ============================================================
   Combinateurs multi-niveaux (#225) : `calibrated` (un id recalibré par
   table de paramètres) et `bankByLevel` (banque d'items tagués par niveau).
   Logique pure (sans DOM).
   ============================================================ */
import { describe, it, expect } from 'vitest';
import { calibrated, bankByLevel } from '../src/core/level-combinators';
import type { ExerciseType, Exercise } from '../src/core/exercise';
import type { SchoolLevel } from '../src/core/catalog';

/* Fabrique un ExerciseType trivial dont la réponse encode le paramètre reçu :
   on lit la réponse pour savoir quel jeu de paramètres a été retenu. */
const typeFromMax = (max: number): ExerciseType => ({
	generate: (): Exercise => ({ type: 'text', question: '@', answer: String(max) }),
	check: () => true,
});
const answerOf = (t: ExerciseType, level?: SchoolLevel): string => {
	const ex = t.generate({ level });
	return ex.type === 'text' ? ex.answer : '';
};

describe('calibrated', () => {
	const t = calibrated<number>({ ce2: 10, cm1: 100 }, typeFromMax);

	it('expose les niveaux de la table, triés', () => {
		expect(t.levels).toEqual(['ce2', 'cm1']);
	});

	it('génère avec les paramètres du niveau demandé', () => {
		expect(answerOf(t, 'ce2')).toBe('10');
		expect(answerOf(t, 'cm1')).toBe('100');
	});

	it('replie sous un niveau non supporté, clampe au-dessus, et défaut = plus bas', () => {
		expect(answerOf(t, 'cm2')).toBe('100'); // repli vers cm1
		expect(answerOf(t, 'cp')).toBe('10'); // clamp vers ce2
		expect(answerOf(t)).toBe('10'); // sans niveau → plus bas supporté
	});

	it('reprend les modes du type construit', () => {
		const withModes = calibrated<number>({ ce2: 1 }, (n) => ({
			modes: [{ id: 'saisie', label: 'x' }],
			generate: (): Exercise => ({ type: 'text', question: '@', answer: String(n) }),
			check: () => true,
		}));
		expect(withModes.modes?.[0].id).toBe('saisie');
	});
});

describe('bankByLevel', () => {
	const items: { id: string; levels: SchoolLevel[] }[] = [
		{ id: 'a', levels: ['ce2'] },
		{ id: 'b', levels: ['ce2', 'cm1'] },
		{ id: 'c', levels: ['cm1'] },
	];
	const bank = bankByLevel(items);

	it('expose l’union des niveaux, triée', () => {
		expect(bank.levels).toEqual(['ce2', 'cm1']);
	});

	it('at(niveau) renvoie les items disponibles à ce niveau (appartenance stricte)', () => {
		expect(bank.at('ce2').map((i) => i.id)).toEqual(['a', 'b']);
		expect(bank.at('cm1').map((i) => i.id)).toEqual(['b', 'c']);
	});
});
