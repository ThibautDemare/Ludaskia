/* ============================================================
   Géométrie — Le cercle (#102, plages par niveau #287).
   La leçon `geom-cercle` est calibrée CE2/CM1 : seule la borne du rayon change
   (CE2 2–20, CM1 2–50), le diamètre restant PAIR (= 2 r → r ↔ d entier). Vérifie
   les bornes par niveau, l'intégrité du QCM (4 choix, vraies formes), et que toute
   réponse générée se valide par check(). Pas de DOM (le SVG est une chaîne).
   ============================================================ */
import { describe, it, expect } from 'vitest';
import { CERCLE_LESSONS } from '../src/data/maths/cercle';
import type { Exercise } from '../src/core/exercise';
import type { SchoolLevel } from '../src/core/catalog';

const TIRAGES = 1000;
const cercle = () => CERCLE_LESSONS.find((l) => l.id === 'geom-cercle')!.exerciseType;

function echantillon(mode: string, level?: SchoolLevel, n = TIRAGES): Exercise[] {
	const t = cercle();
	return Array.from({ length: n }, () => t.generate({ mode, ...(level ? { level } : {}) }));
}

// Rayons « réels » tirés (rayon→diamètre : le rayon est dans l'énoncé ;
// diamètre→rayon : le diamètre = 2·rayon est dans l'énoncé). Vocabulaire ignoré.
function rayonsVus(level: SchoolLevel, n = TIRAGES): number[] {
	const t = cercle();
	const rayons: number[] = [];
	for (let i = 0; i < n; i++) {
		const ex = t.generate({ mode: 'saisie', level });
		if (ex.type !== 'text') continue;
		const ray = /^Le rayon mesure (\d+) cm/.exec(ex.question);
		const dia = /^Le diamètre mesure (\d+) cm/.exec(ex.question);
		if (ray) rayons.push(Number(ray[1]));
		else if (dia) rayons.push(Number(dia[1]) / 2);
	}
	return rayons;
}

describe('Cercle — niveaux exposés (#287)', () => {
	it('expose CE2 + CM1 (moteur calibré)', () => {
		expect(cercle().levels).toEqual(['ce2', 'cm1']);
	});
});

describe('Cercle — calibrage CE2 (rayon 2–20)', () => {
	const rayons = rayonsVus('ce2');

	it('le rayon reste dans 2–20 et le diamètre est toujours pair', () => {
		expect(rayons.length).toBeGreaterThan(0);
		for (const r of rayons) {
			expect(Number.isInteger(r)).toBe(true); // d = 2 r → r ↔ d entier
			expect(r).toBeGreaterThanOrEqual(2);
			expect(r).toBeLessThanOrEqual(20);
		}
		expect(Math.max(...rayons)).toBe(20); // la borne haute CE2 est atteinte
	});
});

describe('Cercle — extension CM1 (rayon 2–50)', () => {
	const rayons = rayonsVus('cm1');

	it('le rayon peut dépasser 20 (jusqu’à 50), en restant entier', () => {
		for (const r of rayons) {
			expect(Number.isInteger(r)).toBe(true);
			expect(r).toBeGreaterThanOrEqual(2);
			expect(r).toBeLessThanOrEqual(50);
		}
		expect(rayons.some((r) => r > 20)).toBe(true); // extension CM1 effective
		expect(Math.max(...rayons)).toBe(50); // la borne haute CM1 est atteinte
	});
});

describe('Cercle — intégrité QCM et correction (les deux niveaux)', () => {
	for (const level of ['ce2', 'cm1'] as SchoolLevel[]) {
		it(`QCM ${level} : 4 choix uniques contenant la bonne réponse`, () => {
			for (const ex of echantillon('qcm', level)) {
				if (ex.type !== 'qcm') throw new Error('attendu qcm');
				expect(ex.choices).toHaveLength(4);
				expect(new Set(ex.choices).size).toBe(4);
				expect(ex.choices).toContain(ex.answer);
			}
		});

		it(`${level} : chaque réponse générée se valide par check() (saisie et QCM)`, () => {
			const t = cercle();
			for (const ex of echantillon('saisie', level)) {
				if (ex.type !== 'text') continue;
				expect(t.check(ex, ex.answer)).toBe(true);
			}
			for (const ex of echantillon('qcm', level)) {
				if (ex.type !== 'qcm') continue;
				expect(t.check(ex, ex.answer)).toBe(true);
			}
		});
	}
});
