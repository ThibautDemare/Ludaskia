/* ============================================================
   Les angles (#202, variété des énoncés #288) — logique de génération
   (src/data/maths/angles) et invariants du renderer (src/core/figures →
   renderAngle). Sans DOM.

   Les énoncés ont désormais plusieurs VARIANTES de surface et six FAMILLES :
   on ne classe donc JAMAIS par la chaîne de l'énoncé, mais par la `famille`
   (identifiant stable) exposée par `genAngle()`. Invariants CE2 : QCM par
   famille (Oui/Non binaire vs 3 termes) ; AUCUN degré affiché ; « angle droit
   ⇒ carré de codage » (jamais d'arc) ; réponse loyale à la figure montrée ;
   la bulle d'aide (vocabulaire) n'apparaît qu'au nommage et au Oui/Non aigu
   (réduite, sans « obtus ») ; pondération Oui/Non ≤ 45 % / 3 termes ≥ 55 %.
   ============================================================ */
import { describe, it, expect } from 'vitest';
import type { Exercise } from '../src/core/exercise';
import { ANGLES_LESSONS, genAngle, ENONCES, type Famille } from '../src/data/maths/angles';
import { renderAngle, renderFigure } from '../src/core/figures';
import { getLessonById } from '../src/core/catalog';

const TIRAGES = 2000;
const lesson = ANGLES_LESSONS[0];
const tirages = Array.from({ length: TIRAGES }, () => genAngle());

/** Familles à réponse binaire Oui/Non. */
const OUI_NON: Famille[] = ['estDroit', 'poserCarre', 'coinReel', 'aiguOuiNon'];
const TOUTES: Famille[] = [
	'estDroit',
	'poserCarre',
	'coinReel',
	'aiguOuiNon',
	'comparer',
	'nommer',
];

const count = (re: RegExp, s: string) => s.match(re)?.length ?? 0;
const part = (pred: (t: ReturnType<typeof genAngle>) => boolean) =>
	tirages.filter(pred).length / TIRAGES;

describe('Les angles — génération QCM', () => {
	it('chaque exercice est un QCM à énoncé connu (variante de sa famille), figure, explication, bonne réponse parmi les choix', () => {
		for (const { ex, famille } of tirages) {
			if (ex.type !== 'qcm') throw new Error('attendu qcm');
			expect(ENONCES[famille]).toContain(ex.question); // énoncé = une variante de surface de la famille
			expect(ex.figure ?? '').toContain('<svg');
			expect(ex.choices).toContain(ex.answer);
			expect(typeof ex.explication).toBe('string');
			expect((ex.explication ?? '').length).toBeGreaterThan(0);
		}
	});

	it('aucun degré ni « 90 » dans l’énoncé, la figure ou l’aide (jugement à l’œil)', () => {
		for (const { ex } of tirages) {
			if (ex.type !== 'qcm') continue;
			expect(ex.question).not.toContain('°');
			expect(ex.question.toLowerCase()).not.toContain('degré');
			const svg = (ex.figure ?? '').split('</svg>')[0];
			expect(svg).not.toContain('<text'); // la figure ne porte AUCUNE cote
			expect(ex.figure ?? '').not.toContain('°');
		}
	});

	it('options valides selon la famille (Oui/Non binaire, comparaison, nommage)', () => {
		for (const { ex, famille } of tirages) {
			if (ex.type !== 'qcm') continue;
			if (OUI_NON.includes(famille)) {
				expect([...ex.choices].sort()).toEqual(['Non', 'Oui']);
				expect(['Oui', 'Non']).toContain(ex.answer);
			} else if (famille === 'comparer') {
				expect([...ex.choices].sort()).toEqual(['plus grand', 'plus petit', 'égal']);
			} else {
				expect([...ex.choices].sort()).toEqual(['Aigu', 'Droit', 'Obtus']);
			}
		}
	});

	it('loyauté : carré de codage ⟺ angle droit montré, et réponse cohérente avec la figure (par famille)', () => {
		for (const { ex, famille, cat } of tirages) {
			if (ex.type !== 'qcm') continue;
			const svg = (ex.figure ?? '').split('</svg>')[0];
			// Invariant renderer : carré (polyline) ⟺ angle droit ; sinon arc (path).
			if (cat === 'droit') {
				expect(svg).toContain('<polyline');
				expect(svg).not.toContain('<path');
			} else {
				expect(svg).toContain('<path');
				expect(svg).not.toContain('<polyline');
			}
			// La bonne réponse découle loyalement de la catégorie montrée.
			if (famille === 'estDroit' || famille === 'poserCarre' || famille === 'coinReel') {
				expect(ex.answer).toBe(cat === 'droit' ? 'Oui' : 'Non');
			} else if (famille === 'aiguOuiNon') {
				expect(ex.answer).toBe(cat === 'aigu' ? 'Oui' : 'Non');
			} else if (famille === 'comparer') {
				expect(ex.answer).toBe(
					cat === 'aigu' ? 'plus petit' : cat === 'droit' ? 'égal' : 'plus grand',
				);
			} else {
				expect(ex.answer).toBe(cat === 'aigu' ? 'Aigu' : cat === 'droit' ? 'Droit' : 'Obtus');
			}
		}
	});

	it('bulle d’aide : au nommage (aigu + obtus) et au Oui/Non aigu (réduite, SANS « obtus ») ; nulle part ailleurs', () => {
		for (const { ex, famille } of tirages) {
			if (ex.type !== 'qcm') continue;
			const fig = ex.figure ?? '';
			expect(fig.includes('angle-aide')).toBe(famille === 'nommer' || famille === 'aiguOuiNon');
			if (famille === 'nommer') {
				expect(fig).toContain('aigu');
				expect(fig).toContain('obtus'); // les deux termes au nommage
			}
			if (famille === 'aiguOuiNon') {
				expect(fig).toContain('aigu');
				expect(fig).not.toContain('obtus'); // un seul mot neuf à la fois
			}
		}
	});

	it('équilibrage Oui/Non : les deux réponses apparaissent dans chaque famille binaire', () => {
		for (const f of OUI_NON) {
			const sub = tirages.filter((t) => t.famille === f);
			expect(sub.some((t) => t.ex.type === 'qcm' && t.ex.answer === 'Oui')).toBe(true);
			expect(sub.some((t) => t.ex.type === 'qcm' && t.ex.answer === 'Non')).toBe(true);
		}
		// Le « Non » de « est-ce aigu ? » mélange droit ET obtus (pas de raccourci « pas aigu = obtus »).
		const nonAigu = tirages.filter(
			(t) => t.famille === 'aiguOuiNon' && t.ex.type === 'qcm' && t.ex.answer === 'Non',
		);
		expect(nonAigu.some((t) => t.cat === 'droit')).toBe(true);
		expect(nonAigu.some((t) => t.cat === 'obtus')).toBe(true);
	});

	it('pondération : toutes les familles tirées ; Oui/Non ≈ 45 % (≤ ~50 %), comparaison = pièce maîtresse', () => {
		for (const f of TOUTES) expect(tirages.some((t) => t.famille === f)).toBe(true);
		const ouiNon = part((t) => OUI_NON.includes(t.famille));
		expect(ouiNon).toBeGreaterThan(0.38);
		expect(ouiNon).toBeLessThan(0.52); // plafond ~45 %
		expect(part((t) => t.famille === 'comparer')).toBeGreaterThan(0.28); // ~35 %
	});

	it('check() : exact (accents/apostrophes exigés) accepté, sinon refusé', () => {
		const t = lesson.exerciseType;
		const ex: Exercise = {
			type: 'qcm',
			question: "Compare cet angle à l'angle droit.",
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
