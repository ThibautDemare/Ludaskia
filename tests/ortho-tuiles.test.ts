/* ============================================================
   Tests des helpers purs du mode tuiles (#68) : insertion à une
   position choisie, réordonnancement et retrait d'une lettre.
   `assembled` reste la source de vérité de l'ordre ; ces helpers
   sont purs (nouveau tableau, pas de mutation) et bornent leurs index.
   ============================================================ */
import { describe, test, expect } from 'vitest';
import { insertAt, moveAt, removeAt } from '../src/core/utils';

describe('insertAt — insertion au curseur', () => {
	test('insère au milieu', () => {
		expect(insertAt([0, 1, 2], 1, 9)).toEqual([0, 9, 1, 2]);
	});
	test('insère en fin (curseur par défaut)', () => {
		expect(insertAt([0, 1], 2, 9)).toEqual([0, 1, 9]);
	});
	test('insère au début', () => {
		expect(insertAt([0, 1], 0, 9)).toEqual([9, 0, 1]);
	});
	test('borne une position trop grande à la fin', () => {
		expect(insertAt([0, 1], 99, 9)).toEqual([0, 1, 9]);
	});
	test('borne une position négative au début', () => {
		expect(insertAt([0, 1], -5, 9)).toEqual([9, 0, 1]);
	});
	test('ne mute pas le tableau d’entrée', () => {
		const src = [0, 1];
		insertAt(src, 1, 9);
		expect(src).toEqual([0, 1]);
	});
});

describe('removeAt — retrait', () => {
	test('retire au milieu', () => {
		expect(removeAt([0, 1, 2], 1)).toEqual([0, 2]);
	});
	test('retire aux bornes', () => {
		expect(removeAt([0, 1, 2], 0)).toEqual([1, 2]);
		expect(removeAt([0, 1, 2], 2)).toEqual([0, 1]);
	});
	test('index hors bornes : tableau inchangé (copie)', () => {
		expect(removeAt([0, 1], 5)).toEqual([0, 1]);
		expect(removeAt([0, 1], -1)).toEqual([0, 1]);
	});
	test('ne mute pas le tableau d’entrée', () => {
		const src = [0, 1, 2];
		removeAt(src, 1);
		expect(src).toEqual([0, 1, 2]);
	});
});

describe('moveAt — réordonnancement (flèches ← → et glisser)', () => {
	test('décale d’un cran vers la droite', () => {
		expect(moveAt([0, 1, 2], 0, 1)).toEqual([1, 0, 2]);
	});
	test('décale d’un cran vers la gauche', () => {
		expect(moveAt([0, 1, 2], 2, 1)).toEqual([0, 2, 1]);
	});
	test('déplace en tête puis en queue', () => {
		expect(moveAt([0, 1, 2, 3], 3, 0)).toEqual([3, 0, 1, 2]);
		expect(moveAt([0, 1, 2, 3], 0, 3)).toEqual([1, 2, 3, 0]);
	});
	test('from === to : ordre inchangé', () => {
		expect(moveAt([0, 1, 2], 1, 1)).toEqual([0, 1, 2]);
	});
	test('from hors bornes : tableau inchangé (copie)', () => {
		expect(moveAt([0, 1, 2], 9, 0)).toEqual([0, 1, 2]);
	});
	test('ne mute pas le tableau d’entrée', () => {
		const src = [0, 1, 2];
		moveAt(src, 0, 2);
		expect(src).toEqual([0, 1, 2]);
	});
});
