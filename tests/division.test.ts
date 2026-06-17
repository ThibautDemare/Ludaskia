/* ============================================================
   Division par le sens (#104) — logique de génération (src/data/maths/division).
   Invariants CE2 : division EXACTE (reste nul), diviseur ≥ 2, quotient ≥ 2,
   dividende ≤ 100, réponse entière ; moitié/quart à résultat entier ; figure de
   découverte uniquement en partage et pour un petit total. Pas de DOM.
   ============================================================ */
import { describe, it, expect } from 'vitest';
import { DIVISION_LESSONS } from '../src/data/maths/division';
import { renderFigure } from '../src/core/figures';

const TIRAGES = 500;

function gen(id: string) {
	const l = DIVISION_LESSONS.find((x) => x.id === id)!;
	return Array.from({ length: TIRAGES }, () => l.exerciseType.generate());
}
const ints = (s: string) => (s.match(/\d+/g) ?? []).map(Number);

describe('Moitié et quart d’une collection', () => {
	it('résultat entier garanti, quotient ≥ 2, dénominateurs 2 et 4 seulement', () => {
		for (const ex of gen('math-div-moitie-quart')) {
			if (ex.type !== 'text') throw new Error('attendu text');
			const rep = Number(ex.answer);
			expect(Number.isInteger(rep)).toBe(true);
			expect(rep).toBeGreaterThanOrEqual(2);
			const moitie = /^moitié de (\d+) = @$/.exec(ex.question);
			const quart = /^quart de (\d+) = @$/.exec(ex.question);
			expect(Boolean(moitie) || Boolean(quart)).toBe(true);
			if (moitie) expect(Number(moitie[1])).toBe(rep * 2);
			if (quart) expect(Number(quart[1])).toBe(rep * 4);
			expect(ex.figure).toBeUndefined(); // pas de figure sur cette leçon
		}
	});
});

describe('Je partage', () => {
	it('division exacte dans les tables : diviseur ≥ 2, quotient ≥ 2, dividende ≤ 100', () => {
		for (const ex of gen('math-div-partage')) {
			if (ex.type !== 'text') throw new Error('attendu text');
			const rep = Number(ex.answer);
			expect(Number.isInteger(rep)).toBe(true);
			expect(rep).toBeGreaterThanOrEqual(2);
			expect(rep).toBeLessThanOrEqual(10);
			const total = ints(ex.question)[0]; // le dividende = 1er nombre de l'énoncé
			expect(total).toBeLessThanOrEqual(100);
			expect(total % rep).toBe(0); // reste nul
			expect(total / rep).toBeGreaterThanOrEqual(2); // le co-facteur ≥ 2 aussi
		}
	});

	it('le signe ÷ n’apparaît jamais seul (toujours une phrase de situation avant)', () => {
		for (const ex of gen('math-div-partage')) {
			if (ex.type !== 'text') continue;
			if (ex.question.includes('÷')) {
				// une phrase décrit la situation avant l'écriture ÷
				expect(/^On (partage|range) /.test(ex.question)).toBe(true);
				const m = /(\d+) ÷ (\d+) = @$/.exec(ex.question)!;
				expect(Number(m[1]) % Number(m[2])).toBe(0);
				expect(Number(ex.answer)).toBe(Number(m[1]) / Number(m[2]));
			}
		}
	});

	it('les deux sens sont contrastés (partage « en … chaque » / groupement « par paquets de »)', () => {
		const items = gen('math-div-partage').filter((e) => e.type === 'text');
		const partage = items.filter((e: any) => e.question.startsWith('On partage'));
		const groupement = items.filter((e: any) => e.question.startsWith('On range'));
		expect(partage.length).toBeGreaterThan(0);
		expect(groupement.length).toBeGreaterThan(0);
		for (const e of groupement) expect((e as any).question).toContain('par paquets de');
	});

	it('figure de découverte : uniquement en partage et pour un petit total (≤ 12)', () => {
		for (const ex of gen('math-div-partage')) {
			if (ex.type === 'text' && ex.figure) {
				expect(ex.question.startsWith('On partage')).toBe(true);
				expect(ints(ex.question)[0]).toBeLessThanOrEqual(12);
			}
		}
	});
});

describe('renderGroupes (figure de partage)', () => {
	it('dessine autant de paniers que demandé et le bon nombre de jetons', () => {
		const svg = renderFigure({ kind: 'groupes', paniers: 3, total: 12 });
		expect(svg).toContain('<svg');
		expect(svg.match(/<polygon/g)?.length).toBe(3); // 3 paniers
		expect(svg.match(/<circle/g)?.length).toBe(12); // 12 jetons
	});
});
