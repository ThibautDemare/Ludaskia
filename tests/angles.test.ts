/* ============================================================
   Les angles (#202) — logique de génération (src/data/maths/angles) et
   invariants du renderer (src/core/figures → renderAngle). Sans DOM.
   Invariants CE2 : QCM aux trois temps (Oui-Non / comparer / nommer) ;
   AUCUN degré affiché ; « angle droit ⇒ carré de codage » (jamais d'arc),
   « aigu/obtus ⇒ arc » (jamais de carré) ; « égal/droit » n'est proposé QUE
   sur un angle droit marqué ; le vocabulaire (bulle d'aide) n'apparaît qu'au
   temps 3 ; calibrage 40/35/25 entre les temps.
   ============================================================ */
import { describe, it, expect } from 'vitest';
import type { Exercise } from '../src/core/exercise';
import { ANGLES_LESSONS } from '../src/data/maths/angles';
import { renderAngle, renderFigure } from '../src/core/figures';
import { getLessonById } from '../src/core/catalog';

const TIRAGES = 1000;
const lesson = ANGLES_LESSONS[0];
const tirages = Array.from({ length: TIRAGES }, () => lesson.exerciseType.generate());

const Q1 = 'Cet angle est-il un angle droit ?';
const Q2 = "Compare cet angle à l'angle droit.";
const Q3 = 'Cet angle est-il aigu, droit ou obtus ?';

const count = (re: RegExp, s: string) => s.match(re)?.length ?? 0;

describe('Les angles — génération QCM', () => {
	it('chaque exercice est un QCM avec figure, énoncé connu, explication et la bonne réponse parmi les choix', () => {
		for (const ex of tirages) {
			if (ex.type !== 'qcm') throw new Error('attendu qcm');
			expect([Q1, Q2, Q3]).toContain(ex.question);
			expect(ex.figure ?? '').toContain('<svg');
			expect(ex.choices).toContain(ex.answer);
			expect(typeof ex.explication).toBe('string');
			expect((ex.explication ?? '').length).toBeGreaterThan(0);
		}
	});

	it('aucun degré ni « 90 » dans l’énoncé, la figure ou l’aide (jugement à l’œil)', () => {
		for (const ex of tirages) {
			if (ex.type !== 'qcm') continue;
			expect(ex.question).not.toContain('°');
			expect(ex.question.toLowerCase()).not.toContain('degré');
			// La figure d'angle ne porte AUCUN texte (pas de cote) → pas de mesure affichée.
			const svg = (ex.figure ?? '').split('</svg>')[0];
			expect(svg).not.toContain('<text');
			expect(ex.figure ?? '').not.toContain('°');
		}
	});

	it('options et réponses valides par temps', () => {
		for (const ex of tirages) {
			if (ex.type !== 'qcm') continue;
			if (ex.question === Q1) {
				expect([...ex.choices].sort()).toEqual(['Non', 'Oui']);
				expect(['Oui', 'Non']).toContain(ex.answer);
			} else if (ex.question === Q2) {
				expect([...ex.choices].sort()).toEqual(['plus grand', 'plus petit', 'égal']);
				expect(['plus petit', 'égal', 'plus grand']).toContain(ex.answer);
			} else {
				expect([...ex.choices].sort()).toEqual(['Aigu', 'Droit', 'Obtus']);
				expect(['Aigu', 'Droit', 'Obtus']).toContain(ex.answer);
			}
		}
	});

	it('la bulle d’aide (vocabulaire) n’apparaît qu’au temps 3', () => {
		for (const ex of tirages) {
			if (ex.type !== 'qcm') continue;
			const aide = (ex.figure ?? '').includes('angle-aide');
			expect(aide).toBe(ex.question === Q3);
		}
		// Et l'aide ne souffle pas la réponse : elle nomme la relation, pas l'angle montré.
		const t3 = tirages.find((e) => e.type === 'qcm' && e.question === Q3);
		expect(t3 && (t3.type === 'qcm' ? t3.figure : '')).toContain('aigu');
	});

	it('loyauté : « Oui / égal / Droit » ne sont la réponse QUE sur un angle droit MARQUÉ (carré, jamais d’arc)', () => {
		for (const ex of tirages) {
			if (ex.type !== 'qcm') continue;
			const svg = (ex.figure ?? '').split('</svg>')[0];
			const estDroitMontre =
				(ex.question === Q1 && ex.answer === 'Oui') ||
				(ex.question === Q2 && ex.answer === 'égal') ||
				(ex.question === Q3 && ex.answer === 'Droit');
			if (estDroitMontre) {
				expect(svg).toContain('<polyline'); // carré de codage présent
				expect(svg).not.toContain('<path'); // jamais d'arc sur un angle droit
			} else {
				expect(svg).toContain('<path'); // arc d'ouverture (aigu/obtus)
				expect(svg).not.toContain('<polyline'); // pas de carré sur un non-droit
			}
		}
	});

	it('les trois temps sont tous tirés, avec une pondération décroissante 40/35/25', () => {
		const n1 = tirages.filter((e) => e.type === 'qcm' && e.question === Q1).length;
		const n2 = tirages.filter((e) => e.type === 'qcm' && e.question === Q2).length;
		const n3 = tirages.filter((e) => e.type === 'qcm' && e.question === Q3).length;
		expect(n1).toBeGreaterThan(0);
		expect(n2).toBeGreaterThan(0);
		expect(n3).toBeGreaterThan(0);
		expect(n1).toBeGreaterThan(n3); // temps 1 (40 %) nettement plus fréquent que temps 3 (25 %)
	});

	it('check() : exact (accents/apostrophes exigés) accepté, sinon refusé', () => {
		const t = lesson.exerciseType;
		const ex: Exercise = {
			type: 'qcm',
			question: Q2,
			answer: 'égal',
			choices: ['plus petit', 'égal', 'plus grand'],
		};
		expect(t.check(ex, 'égal')).toBe(true);
		expect(t.check(ex, ' égal ')).toBe(true); // espaces tolérés (normalizeText)
		expect(t.check(ex, 'egal')).toBe(false); // accent exigé
		expect(t.check(ex, 'plus grand')).toBe(false);
	});

	it('catalogue : geo-angles est rangée en Géométrie, niveau CE2, non exclue du sprint', () => {
		const def = getLessonById('geo-angles');
		expect(def).toBeDefined();
		expect(def?.subject).toBe('math');
		expect(def?.category).toBe('math-geometrie');
		expect(def?.levels).toEqual(['ce2']);
		expect(def?.excludeFromSprint).toBeFalsy(); // QCM tappable sous chrono (figure + choix)
	});
});

describe('renderAngle — invariants du renderer', () => {
	it('angle droit (90°) : carré de codage (polyline), jamais d’arc ; deux segments, un sommet', () => {
		const svg = renderFigure({ kind: 'angle', opening: 90, bisector: 30 });
		expect(svg).toContain('<svg');
		expect(count(/<line/g, svg)).toBe(2); // les deux demi-droites
		expect(count(/<polyline/g, svg)).toBe(1); // le carré de codage
		expect(count(/<path/g, svg)).toBe(0); // pas d'arc
		expect(count(/<circle/g, svg)).toBe(1); // le sommet
		expect(svg).not.toContain('<text'); // aucune mesure affichée
		expect(svg).not.toContain('°');
	});

	it('angle non droit : arc d’ouverture (path), jamais de carré', () => {
		for (const opening of [30, 45, 60, 115, 135, 150]) {
			const svg = renderAngle(opening, 105);
			expect(count(/<line/g, svg)).toBe(2);
			expect(count(/<path/g, svg)).toBe(1); // arc
			expect(count(/<polyline/g, svg)).toBe(0); // pas de carré
			expect(svg).not.toContain('<text');
		}
	});
});
