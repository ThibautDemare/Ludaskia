/* ============================================================
   Grandeurs et mesures — la monnaie (#96, plages par niveau #287).
   « Je rends la monnaie » est calibrée CE2/CM1 :
   - CE2 : prix ENTIER, billets 5/10/20/50 € (ajout du 50 €), JAMAIS de décimal ;
   - CM1 : prix DÉCIMAL (franchit l'euro), pas de 5 c.
   « Je calcule avec les euros » reste mono-niveau (CE2). Vérifie aussi que toute
   réponse générée se valide par check() et que le rendu = billet − prix. Pas de DOM.
   ============================================================ */
import { describe, it, expect } from 'vitest';
import { MONNAIE_LESSONS } from '../src/data/maths/monnaie';
import type { Exercise } from '../src/core/exercise';
import type { SchoolLevel } from '../src/core/catalog';

const TIRAGES = 1000;

function byId(id: string) {
	return MONNAIE_LESSONS.find((l) => l.id === id)!;
}

// Échantillon d'exercices pour un niveau donné (le niveau est ignoré par les
// leçons mono-niveau — comportement identique).
function echantillon(id: string, level?: SchoolLevel, n = TIRAGES): Exercise[] {
	const t = byId(id).exerciseType;
	return Array.from({ length: n }, () => t.generate(level ? { level } : undefined));
}

// Montant numérique attendu (centimes près) à partir de la chaîne `answer`.
const montant = (a: string) => Number(a);
// L'énoncé contient-il une écriture décimale à la française (« 1,50 ») ?
const aDecimal = (q: string) => /\d+,\d+/.test(q);

describe('Monnaie — « Je rends la monnaie » : niveaux exposés (#287)', () => {
	it('expose CE2 + CM1 (moteur calibré)', () => {
		expect(byId('mes-monnaie-rendu').exerciseType.levels).toEqual(['ce2', 'cm1']);
	});
});

describe('Monnaie — « Je rends la monnaie » : calibrage CE2', () => {
	const items = echantillon('mes-monnaie-rendu', 'ce2');

	it('prix et rendu TOUJOURS entiers : jamais de décimal au CE2', () => {
		for (const ex of items) {
			if (ex.type !== 'text') throw new Error('attendu text');
			expect(aDecimal(ex.question)).toBe(false); // pas de « 1,50 » dans l'énoncé
			expect(Number.isInteger(montant(ex.answer))).toBe(true); // rendu entier
		}
	});

	it('billets réels 5/10/20/50 € (ajout du 50 €), prix < billet, rendu = billet − prix', () => {
		const billetsVus = new Set<number>();
		for (const ex of items) {
			if (ex.type !== 'text') continue;
			const m = /coûte (\d+) €.*billet de (\d+) €/.exec(ex.question)!;
			const prix = Number(m[1]);
			const billet = Number(m[2]);
			billetsVus.add(billet);
			expect([5, 10, 20, 50]).toContain(billet);
			expect(prix).toBeGreaterThanOrEqual(1);
			expect(prix).toBeLessThan(billet); // prix strictement inférieur au billet
			expect(montant(ex.answer)).toBe(billet - prix); // rendu cohérent
		}
		expect(billetsVus.has(50)).toBe(true); // le 50 € est bien tiré
	});

	it('chaque réponse générée se valide par check()', () => {
		const t = byId('mes-monnaie-rendu').exerciseType;
		for (const ex of items)
			expect(t.check(ex, String((ex as { answer: string }).answer))).toBe(true);
	});
});

describe('Monnaie — « Je rends la monnaie » : extension CM1', () => {
	const items = echantillon('mes-monnaie-rendu', 'cm1');

	it('des prix DÉCIMAUX apparaissent (franchissement de l’euro)', () => {
		expect(items.some((ex) => ex.type === 'text' && aDecimal(ex.question))).toBe(true);
	});

	it('rendu = billet − prix (au centime près), billets 5/10/20/50 €', () => {
		for (const ex of items) {
			if (ex.type !== 'text') throw new Error('attendu text');
			const billet = Number(/billet de (\d+) €/.exec(ex.question)![1]);
			expect([5, 10, 20, 50]).toContain(billet);
			// Prix lu depuis l'énoncé (entier ou décimal « 1,50 »).
			const prixStr = /coûte ([\d,]+) €/.exec(ex.question)![1];
			const prix = Number(prixStr.replace(',', '.'));
			expect(prix).toBeGreaterThan(0);
			expect(prix).toBeLessThan(billet);
			// Centimes exacts : (billet − prix) === rendu, comparé en centimes pour éviter
			// les arrondis flottants.
			expect(Math.round(montant(ex.answer) * 100)).toBe(Math.round((billet - prix) * 100));
		}
	});

	it('chaque réponse générée se valide par check() (saisie « 1,50 » ou « 1.5 »)', () => {
		const t = byId('mes-monnaie-rendu').exerciseType;
		for (const ex of items) {
			const a = (ex as { answer: string }).answer;
			expect(t.check(ex, a)).toBe(true); // forme stockée (point)
			expect(t.check(ex, a.replace('.', ','))).toBe(true); // saisie à la française (virgule)
		}
	});
});

describe('Monnaie — « Je calcule avec les euros » : reste mono-niveau CE2', () => {
	it('pas de niveaux exposés (leçon non calibrée), réponses entières et valides', () => {
		const def = byId('mes-monnaie-calcul');
		expect(def.exerciseType.levels).toBeUndefined();
		const t = def.exerciseType;
		for (const ex of echantillon('mes-monnaie-calcul')) {
			if (ex.type !== 'text') throw new Error('attendu text');
			expect(aDecimal(ex.question)).toBe(false); // jamais de décimal au CE2
			expect(Number.isInteger(montant(ex.answer))).toBe(true);
			expect(t.check(ex, String(ex.answer))).toBe(true);
		}
	});
});
