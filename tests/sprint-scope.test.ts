/* ============================================================
   Périmètre du sprint (#208, lot 2) — logique pure.
   Critère « rencontrée » (loadLessonFirstSeen), filtrage et périmètre par
   défaut adaptatif. La plupart des cas injectent une map `vues` → pur, sans
   stockage ; un cas vérifie le branchement réel sur loadLessonFirstSeen.
   L'AUTRE source de « rencontrée » — la déclaration « vu en classe » (#478) et
   son union avec le 1er passage — est éprouvée dans `vu-en-classe.test.ts`.
   ============================================================ */
import { beforeEach, describe, it, expect } from 'vitest';
import {
	estRencontree,
	appliquerScope,
	scopeParDefaut,
	perimetreChoisissable,
} from '../src/core/sprint-scope';
import { getLessonById } from '../src/core/catalog';
import { initProfiles, setNiveauReference, touchActiveProfile } from '../src/core/profiles';
import { markLessonsFirstSeen } from '../src/core/progress';
import { setOnDataWrite } from '../src/core/storage';

const A = getLessonById('math-tables-addition')!;
const B = getLessonById('math-doubles')!;
const C = getLessonById('fr-gram-ponctuation')!;
const lessons = [A, B, C];
const vuesAC = { [A.id]: 1, [C.id]: 2 }; // A et C rencontrées, B non
const vuesToutes = { [A.id]: 1, [B.id]: 1, [C.id]: 1 };

describe('sprint-scope (map injectée)', () => {
	it('estRencontree : vrai ssi une date de 1er passage existe', () => {
		expect(estRencontree(A.id, vuesAC)).toBe(true);
		expect(estRencontree(B.id, vuesAC)).toBe(false);
	});

	it('appliquerScope : « all » inchangé, « seen » filtre en préservant l’ordre', () => {
		expect(appliquerScope(lessons, 'all', vuesAC)).toHaveLength(3);
		expect(appliquerScope(lessons, 'seen', vuesAC).map((l) => l.id)).toEqual([A.id, C.id]);
		// Rien de rencontré → « seen » vide (le sprint repliera sur « all » en amont).
		expect(appliquerScope(lessons, 'seen', {})).toHaveLength(0);
	});

	it('scopeParDefaut : « seen » si mélange, « all » si rien vu ou tout vu', () => {
		expect(scopeParDefaut(lessons, vuesAC)).toBe('seen'); // mélange
		expect(scopeParDefaut(lessons, {})).toBe('all'); // rien rencontré
		expect(scopeParDefaut(lessons, vuesToutes)).toBe('all'); // tout rencontré
	});

	it('perimetreChoisissable : seulement si mélange vu / pas-vu', () => {
		expect(perimetreChoisissable(lessons, vuesAC)).toBe(true);
		expect(perimetreChoisissable(lessons, {})).toBe(false);
		expect(perimetreChoisissable(lessons, vuesToutes)).toBe(false);
		expect(perimetreChoisissable([], {})).toBe(false); // pool vide
	});
});

describe('sprint-scope (branché sur loadLessonFirstSeen réel)', () => {
	beforeEach(() => {
		localStorage.clear();
		setOnDataWrite(touchActiveProfile);
		initProfiles();
	});

	it('estRencontree lit l’état du niveau actif', () => {
		setNiveauReference('ce2');
		expect(estRencontree('math-tables-addition')).toBe(false);
		markLessonsFirstSeen(['math-tables-addition'], 1_700_000_000_000);
		expect(estRencontree('math-tables-addition')).toBe(true);
		expect(estRencontree('math-doubles')).toBe(false);
	});
});
