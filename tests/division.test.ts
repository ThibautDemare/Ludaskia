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
			const moitie = /^La moitié de (\d+) = @$/.exec(ex.question);
			const quart = /^Le quart de (\d+) = @$/.exec(ex.question);
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
		const items = gen('math-div-partage');
		// La figure DOIT apparaître parfois (sinon le déclencheur est cassé).
		expect(items.some((e) => e.type === 'text' && Boolean(e.figure))).toBe(true);
		for (const ex of items) {
			if (ex.type === 'text' && ex.figure) {
				expect(ex.question.startsWith('On partage')).toBe(true);
				expect(ints(ex.question)[0]).toBeLessThanOrEqual(12);
			}
		}
	});

	it('exclusion du sprint : « Je partage » exclue, « Moitié et quart » éligible', () => {
		const partage = DIVISION_LESSONS.find((l) => l.id === 'math-div-partage')!;
		const moitie = DIVISION_LESSONS.find((l) => l.id === 'math-div-moitie-quart')!;
		expect(partage.excludeFromSprint).toBe(true);
		expect(moitie.excludeFromSprint).toBeFalsy();
	});
});

describe('Je découvre le reste (#95)', () => {
	const lesson = DIVISION_LESSONS.find((l) => l.id === 'math-div-reste')!;
	const genReste = (mode: string, n = TIRAGES) =>
		Array.from({ length: n }, () => lesson.exerciseType.generate(mode));

	it('expose deux modes : saisie (conseillé) puis QCM', () => {
		const ids = lesson.exerciseType.modes?.map((m) => m.id) ?? [];
		expect(ids).toEqual(['saisie', 'qcm']);
		expect(lesson.exerciseType.modes?.find((m) => m.recommended)?.id).toBe('saisie');
	});

	it('est exclue du sprint (deux champs + énoncé + figure)', () => {
		expect(lesson.excludeFromSprint).toBe(true);
	});

	describe('mode saisie (problème à deux sous-questions)', () => {
		const items = genReste('saisie');

		it('invariants euclidiens : total = diviseur × quotient + reste, reste < diviseur, bornes CE2', () => {
			for (const ex of items) {
				if (ex.type !== 'probleme') throw new Error('attendu probleme');
				expect(ex.etapes).toHaveLength(2);
				const quotient = ex.etapes[0].answer;
				const reste = ex.etapes[1].answer;
				const [total, diviseur] = ints(ex.enonce);
				expect(Number.isInteger(quotient)).toBe(true);
				expect(Number.isInteger(reste)).toBe(true);
				expect(diviseur).toBeGreaterThanOrEqual(2);
				expect(diviseur).toBeLessThanOrEqual(9);
				expect(quotient).toBeGreaterThanOrEqual(2);
				expect(quotient).toBeLessThanOrEqual(9);
				expect(reste).toBeGreaterThanOrEqual(0);
				expect(reste).toBeLessThan(diviseur); // invariant clé du reste
				expect(total).toBeLessThanOrEqual(81);
				expect(total).toBe(diviseur * quotient + reste);
			}
		});

		it('mélange des restes nuls et non nuls (≈ 1/3 de restes nuls, jamais marginal)', () => {
			const nuls = items.filter((e) => e.type === 'probleme' && e.etapes[1].answer === 0).length;
			const part = nuls / items.length;
			expect(nuls).toBeGreaterThan(0);
			expect(items.length - nuls).toBeGreaterThan(0);
			expect(part).toBeGreaterThan(0.15);
			expect(part).toBeLessThan(0.55);
		});

		it('les deux sens sont contrastés (partage / groupement « par paquets de »)', () => {
			const partage = items.filter(
				(e) => e.type === 'probleme' && e.enonce.startsWith('On partage'),
			);
			const groupement = items.filter(
				(e) => e.type === 'probleme' && e.enonce.startsWith('On range'),
			);
			expect(partage.length).toBeGreaterThan(0);
			expect(groupement.length).toBeGreaterThan(0);
			for (const e of groupement) {
				if (e.type === 'probleme') expect(e.enonce).toContain('par paquets de');
			}
		});

		it('le signe ÷ n’apparaît jamais seul (mix avec/sans signe, situation toujours avant)', () => {
			const avecSigne = items.filter((e) => e.type === 'probleme' && e.enonce.includes('÷'));
			const sansSigne = items.filter((e) => e.type === 'probleme' && !e.enonce.includes('÷'));
			expect(avecSigne.length).toBeGreaterThan(0);
			expect(sansSigne.length).toBeGreaterThan(0);
			for (const e of avecSigne) {
				if (e.type === 'probleme') expect(/^On (partage|range) /.test(e.enonce)).toBe(true);
			}
		});

		it('figure de découverte : uniquement en partage et pour un petit total (≤ 12)', () => {
			expect(items.some((e) => e.type === 'probleme' && Boolean(e.figure))).toBe(true);
			for (const ex of items) {
				if (ex.type === 'probleme' && ex.figure) {
					expect(ex.enonce.startsWith('On partage')).toBe(true);
					expect(ints(ex.enonce)[0]).toBeLessThanOrEqual(12);
				}
			}
		});

		it('chaque sous-question a son intitulé ; l’énoncé parlé reformule la situation (sans symbole)', () => {
			for (const ex of items) {
				if (ex.type !== 'probleme') continue;
				expect(ex.etapes[0].question.length).toBeGreaterThan(0);
				expect(ex.etapes[1].question.toLowerCase()).toContain('reste');
				expect(/^On (partage|range) /.test(ex.parle)).toBe(true);
				expect(ex.parle).not.toContain('÷'); // le TTS épelle la situation, pas le symbole
			}
		});
	});

	describe('mode QCM', () => {
		const items = genReste('qcm');

		it('produit 4 choix uniques contenant la bonne réponse, au format « q et il reste r »', () => {
			for (const ex of items) {
				if (ex.type !== 'qcm') throw new Error('attendu qcm');
				expect(ex.choices).toHaveLength(4);
				expect(new Set(ex.choices).size).toBe(4);
				expect(ex.choices).toContain(ex.answer);
				expect(/^\d+ et il reste \d+$/.test(ex.answer)).toBe(true);
			}
		});

		it('la bonne réponse respecte l’invariant euclidien (reste < diviseur, total cohérent)', () => {
			for (const ex of items) {
				if (ex.type !== 'qcm') continue;
				const [total, diviseur] = ints(ex.question);
				const m = /^(\d+) et il reste (\d+)$/.exec(ex.answer)!;
				const quotient = Number(m[1]);
				const reste = Number(m[2]);
				expect(reste).toBeLessThan(diviseur);
				expect(total).toBe(diviseur * quotient + reste);
			}
		});
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
