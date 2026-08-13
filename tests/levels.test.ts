/* ============================================================
   Niveaux scolaires (#225) — résolution `effectiveLevel` et bonne
   migration du catalogue vers `levels[]`. Logique pure (sans DOM).
   ============================================================ */
import { describe, it, expect } from 'vitest';
import {
	LEVEL_ORDER,
	LEVEL_LABEL,
	effectiveLevel,
	niveauDefautCatalogue,
	niveauInferieurImmediat,
} from '../src/core/levels';
import { getAllLessons, genLessonItem } from '../src/core/catalog';
import type { LessonDef, SchoolLevel } from '../src/core/catalog';
import type { Exercise } from '../src/core/exercise';

/* Leçon de test minimale mais complète : `effectiveLevel` ne lit que `levels`,
   les autres champs ne servent qu'à satisfaire le type `LessonDef`. */
const lessonWith = (levels: SchoolLevel[]): LessonDef => ({
	id: 'test',
	label: 'Test',
	subject: 'math',
	category: 'test',
	levels,
	exerciseType: {
		generate: (): Exercise => ({ type: 'text', question: '@', answer: '0' }),
		check: () => false,
	},
});

describe('LEVEL_ORDER / LEVEL_LABEL', () => {
	it('couvre les six niveaux dans l’ordre scolaire croissant', () => {
		expect(LEVEL_ORDER).toEqual(['cp', 'ce1', 'ce2', 'cm1', 'cm2', '6e']);
	});
	it('libelle chaque niveau de LEVEL_ORDER', () => {
		for (const lvl of LEVEL_ORDER) expect(LEVEL_LABEL[lvl]).toBeTruthy();
	});
});

describe('effectiveLevel', () => {
	it('renvoie le niveau demandé quand la leçon le supporte', () => {
		expect(effectiveLevel(lessonWith(['ce2']), 'ce2')).toBe('ce2');
		expect(effectiveLevel(lessonWith(['ce2', 'cm1']), 'cm1')).toBe('cm1');
		expect(effectiveLevel(lessonWith(['ce2', 'cm1']), 'ce2')).toBe('ce2');
	});

	it('replie sur le plus haut niveau supporté en-dessous', () => {
		expect(effectiveLevel(lessonWith(['ce2']), 'cm1')).toBe('ce2');
		expect(effectiveLevel(lessonWith(['ce2', 'cm1']), 'cm2')).toBe('cm1');
		expect(effectiveLevel(lessonWith(['ce2', 'cm1']), '6e')).toBe('cm1');
	});

	it('clampe sur le plus bas niveau supporté si la leçon est entièrement au-dessus', () => {
		expect(effectiveLevel(lessonWith(['ce2']), 'cp')).toBe('ce2');
		expect(effectiveLevel(lessonWith(['ce2', 'cm1']), 'ce1')).toBe('ce2');
		expect(effectiveLevel(lessonWith(['cm1']), 'ce2')).toBe('cm1');
	});
});

/* Périmètre de l'entretien du niveau inférieur en révision (#232) : UN seul niveau
   d'écart, rien au-dessus. La fonction est comparée à un niveau LU dans une clé de
   stockage, donc son résultat doit être comparable par égalité stricte. */
describe('niveauInferieurImmediat', () => {
	it('renvoie le voisin immédiat du dessous sur l’échelle scolaire', () => {
		expect(niveauInferieurImmediat('cm1')).toBe('ce2'); // le cas de #232 (un CM1 entretient son CE2)
		expect(niveauInferieurImmediat('ce1')).toBe('cp');
		expect(niveauInferieurImmediat('6e')).toBe('cm2');
	});

	it('renvoie undefined pour le niveau le plus bas (rien en dessous)', () => {
		expect(niveauInferieurImmediat('cp')).toBeUndefined();
	});

	it('ne saute JAMAIS un niveau (un CM2 n’entretient pas du CE2)', () => {
		// Composée deux fois, elle descend de deux crans : le CE2 n'est donc pas
		// atteignable depuis le CM2 en un seul appel — la dette y est abandonnée.
		expect(niveauInferieurImmediat('cm2')).toBe('cm1');
		expect(niveauInferieurImmediat(niveauInferieurImmediat('cm2')!)).toBe('ce2');
	});

	it('INVARIANT : suit LEVEL_ORDER de bout en bout, sans trou', () => {
		LEVEL_ORDER.forEach((niveau, i) => {
			expect(niveauInferieurImmediat(niveau), niveau).toBe(i > 0 ? LEVEL_ORDER[i - 1] : undefined);
		});
	});

	it('niveau hors échelle (donnée corrompue) → undefined, donc aucun entretien', () => {
		expect(niveauInferieurImmediat('cm3' as SchoolLevel)).toBeUndefined();
	});
});

describe('niveauDefautCatalogue', () => {
	it('renvoie le plus bas niveau présent (source unique du repli, #351)', () => {
		expect(niveauDefautCatalogue([{ levels: ['cm1', 'ce2'] }])).toBe('ce2');
	});

	it('agrège l’union des niveaux et suit LEVEL_ORDER, pas l’ordre d’entrée', () => {
		expect(niveauDefautCatalogue([{ levels: ['cm1'] }, { levels: ['cm2', 'ce2'] }])).toBe('ce2');
	});
});

describe('migration du catalogue vers levels[]', () => {
	it('chaque leçon porte un ensemble de niveaux non vide et valide', () => {
		for (const l of getAllLessons()) {
			expect(Array.isArray(l.levels)).toBe(true);
			expect(l.levels.length).toBeGreaterThan(0);
			for (const lvl of l.levels) expect(LEVEL_ORDER).toContain(lvl);
		}
	});

	it('genLessonItem accepte un niveau optionnel sans casser la génération', () => {
		for (const l of getAllLessons().slice(0, 8)) {
			expect(genLessonItem(l, 'ce2')._lesson).toBe(l.id);
		}
	});
});
