/* ============================================================
   Grandeurs et mesures — conversions multi-niveaux (#89, plages par niveau #287).
   Vérifie le calibrage CE2 vs CM1 : unités disponibles par niveau (mm/dL au CE2,
   min↔s/mL/dm/mg réservés au CM1), niveaux exposés au catalogue, et réponses
   toujours exactes. Sans DOM.
   ============================================================ */
import { describe, it, expect } from 'vitest';
import { MESURE_LESSONS } from '../src/data/maths/mesures';
import { getLessonById } from '../src/core/catalog';
import type { SchoolLevel } from '../src/core/catalog';

const byId = (id: string) => MESURE_LESSONS.find((l) => l.id === id)!;
// Unités (jetons alphabétiques) présentes dans un énoncé « 3 m = @ cm ».
const unitsOf = (q: string): string[] => q.match(/[a-zA-Z]+/g) ?? [];

function unitsSeen(id: string, level: SchoolLevel, n = 800): Set<string> {
	const t = byId(id).exerciseType;
	const set = new Set<string>();
	for (let i = 0; i < n; i++) {
		const ex = t.generate({ level });
		if (ex.type === 'text') for (const u of unitsOf(ex.question)) set.add(u);
	}
	return set;
}

function reponsesTowardsExactes(id: string, level: SchoolLevel, n = 800): boolean {
	const t = byId(id).exerciseType;
	for (let i = 0; i < n; i++) {
		const ex = t.generate({ level });
		if (ex.type !== 'text') return false;
		if (!t.check(ex, String(ex.answer))) return false; // la réponse stockée se valide
	}
	return true;
}

describe('Mesures — niveaux exposés (#287)', () => {
	it('chaque leçon de conversion expose CE2 + CM1 (moteur calibré)', () => {
		for (const def of MESURE_LESSONS) {
			expect(def.exerciseType.levels).toEqual(['ce2', 'cm1']);
		}
	});

	it('CM1 surfacé au catalogue (#248 : conversions décimales + ordre math.cm1)', () => {
		for (const def of MESURE_LESSONS) {
			// Les 4 conversions sont désormais disponibles CE2 + CM1 (le CM1 ajoute les
			// résultats décimaux, #248) : niveaux dérivés du moteur calibré et insérés dans
			// l'ordre pédagogique math.cm1.
			expect(getLessonById(def.id)?.levels).toEqual(['ce2', 'cm1']);
		}
	});
});

describe('Mesures — calibrage CE2 (programme 2025)', () => {
	it('longueurs : le mm est au CE2 (cm↔mm, m↔mm) ; le dm est réservé au CM1', () => {
		const u = unitsSeen('mes-longueurs', 'ce2');
		expect(u.has('mm')).toBe(true); // mm de longueur = CE2
		expect(u.has('cm')).toBe(true);
		expect(u.has('dm')).toBe(false); // dm = CM1
	});

	it('contenances : le dL est au CE2 ; le mL est réservé au CM1', () => {
		const u = unitsSeen('mes-contenances', 'ce2');
		expect(u.has('dL')).toBe(true);
		expect(u.has('cL')).toBe(true);
		expect(u.has('mL')).toBe(false); // mL = CM1
	});

	it('durées : pas de min↔s au CE2 (jamais la seconde)', () => {
		const u = unitsSeen('mes-durees', 'ce2');
		expect(u.has('min')).toBe(true);
		expect(u.has('s')).toBe(false); // min↔s = CM1
	});

	it('masses : pas de mg ni de demi-kilo au CE2', () => {
		const u = unitsSeen('mes-masses', 'ce2');
		expect(u.has('g')).toBe(true);
		expect(u.has('mg')).toBe(false); // g↔mg = CM1
	});
});

describe('Mesures — extensions CM1', () => {
	it('longueurs : le dm apparaît au CM1', () => {
		expect(unitsSeen('mes-longueurs', 'cm1').has('dm')).toBe(true);
	});
	it('contenances : le mL apparaît au CM1', () => {
		expect(unitsSeen('mes-contenances', 'cm1').has('mL')).toBe(true);
	});
	it('durées : min↔s apparaît au CM1', () => {
		expect(unitsSeen('mes-durees', 'cm1').has('s')).toBe(true);
	});
	it('masses : mg apparaît au CM1, et le demi-kilo (500 g) est proposé', () => {
		expect(unitsSeen('mes-masses', 'cm1').has('mg')).toBe(true);
		const t = byId('mes-masses').exerciseType;
		let demiKilo = false;
		for (let i = 0; i < 800 && !demiKilo; i++) {
			const ex = t.generate({ level: 'cm1' });
			if (ex.type === 'text' && ex.question.includes('demi-kilogramme')) demiKilo = true;
		}
		expect(demiKilo).toBe(true);
	});
});

describe('Mesures — réponses exactes à tous les niveaux', () => {
	it('chaque réponse générée se valide par check() (CE2 et CM1)', () => {
		for (const def of MESURE_LESSONS) {
			expect(reponsesTowardsExactes(def.id, 'ce2')).toBe(true);
			expect(reponsesTowardsExactes(def.id, 'cm1')).toBe(true);
		}
	});
});
