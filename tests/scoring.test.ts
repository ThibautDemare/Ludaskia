import { describe, test, expect } from 'vitest';
import { scoreItems } from '../src/core/scoring';
import type { ScoredInput } from '../src/core/scoring';
import type { Item } from '../src/core/items';

/* Correction d'une feuille de réponses (#349), extraite du DOM vers core/scoring.ts.
   On teste ici le cœur pur : comptage ok/total/vides, collecte des erreurs, agrégat
   par leçon et verdicts par champ — sans document ni rendu. */

const num = (id: string, answer: number, saisie: string, lesson?: string): ScoredInput => ({
	id,
	item: { text: `${answer} = @`, answer, kind: 'num' } as Item,
	saisie,
	answer: String(answer),
	lesson,
});

describe('scoreItems — comptage de base', () => {
	test('tout juste : ok == total, aucune erreur, verdicts « correct »', () => {
		const r = scoreItems([num('a', 5, '5'), num('b', 12, '12')]);
		expect(r.ok).toBe(2);
		expect(r.total).toBe(2);
		expect(r.vides).toBe(0);
		expect(r.errors).toEqual([]);
		expect(r.statuses).toEqual({ a: 'correct', b: 'correct' });
	});

	test('mélange juste / faux / vide : compte et collecte les erreurs', () => {
		const juste = num('a', 5, '5');
		const faux = num('b', 7, '9');
		const vide = num('c', 4, '');
		const r = scoreItems([juste, faux, vide]);
		expect(r.ok).toBe(1);
		expect(r.total).toBe(2); // le vide ne compte pas dans total
		expect(r.vides).toBe(1);
		expect(r.statuses).toEqual({ a: 'correct', b: 'wrong', c: 'empty' });
		// Erreurs = faux ET non rempli, dans l'ordre de la feuille.
		expect(r.errors).toEqual([faux.item, vide.item]);
	});

	test('une réponse vide ne marque pas le champ (statut « empty ») et n’est pas comptée', () => {
		const r = scoreItems([num('a', 3, '')]);
		expect(r.total).toBe(0);
		expect(r.vides).toBe(1);
		expect(r.ok).toBe(0);
		expect(r.statuses).toEqual({ a: 'empty' });
	});
});

describe('scoreItems — comparaison des réponses', () => {
	test('virgule tolérée comme séparateur décimal (item numérique)', () => {
		const r = scoreItems([
			{
				id: 'a',
				item: { text: '@', answer: 2.5, kind: 'num' } as Item,
				saisie: '2,5',
				answer: '2.5',
			},
		]);
		expect(r.ok).toBe(1);
		expect(r.statuses.a).toBe('correct');
	});

	test('item texte : accents et forme normalisée exigés (checkItemAnswer)', () => {
		const it: Item = { text: '@', answer: 'école', kind: 'text' };
		expect(scoreItems([{ id: 'a', item: it, saisie: '  école ', answer: 'école' }]).ok).toBe(1);
		expect(scoreItems([{ id: 'a', item: it, saisie: 'ecole', answer: 'école' }]).ok).toBe(0);
	});

	test('item texte : formes équivalentes acceptées via answers[]', () => {
		const it: Item = { text: '@', answer: 'vingt', kind: 'text', answers: ['20'] };
		expect(scoreItems([{ id: 'a', item: it, saisie: '20', answer: 'vingt' }]).ok).toBe(1);
	});

	test('repli numérique quand l’item est absent (sécurité) : compare à answer', () => {
		expect(scoreItems([{ id: 'a', item: null, saisie: '42', answer: '42' }]).statuses.a).toBe(
			'correct',
		);
		expect(scoreItems([{ id: 'a', item: null, saisie: '41', answer: '42' }]).statuses.a).toBe(
			'wrong',
		);
		// answer absent → NaN, jamais égal : la réponse est fausse (pas une fausse validation).
		expect(scoreItems([{ id: 'a', item: null, saisie: '0', answer: undefined }]).statuses.a).toBe(
			'wrong',
		);
	});

	test('repli numérique item absent : virgule tolérée comme séparateur décimal', () => {
		expect(scoreItems([{ id: 'a', item: null, saisie: '2,5', answer: '2.5' }]).statuses.a).toBe(
			'correct',
		);
	});
});

describe('scoreItems — agrégat par leçon (perLesson)', () => {
	test('réussis / total par leçon ; le vide crée le seau sans l’incrémenter', () => {
		const r = scoreItems([
			num('a', 5, '5', 'L1'), // juste
			num('b', 7, '8', 'L1'), // faux
			num('c', 4, '', 'L1'), // vide → seau non incrémenté
			num('d', 2, '2', 'L2'), // juste
		]);
		expect(r.perLesson).toEqual({
			L1: { ok: 1, total: 2 },
			L2: { ok: 1, total: 1 },
		});
	});

	test('leçon entièrement vide : seau { ok: 0, total: 0 } présent', () => {
		const r = scoreItems([num('a', 3, '', 'L1')]);
		expect(r.perLesson).toEqual({ L1: { ok: 0, total: 0 } });
	});

	test('sans leçon rattachée : aucun agrégat', () => {
		const r = scoreItems([num('a', 5, '5')]);
		expect(r.perLesson).toEqual({});
	});
});
