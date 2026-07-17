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
import {
	ANGLES_LESSONS,
	genAngle,
	genAngleCM1,
	ENONCES,
	type Famille,
	type FamilleCM1,
} from '../src/data/maths/angles';
import { renderAngle, renderAnglePair, renderAngleNomme, renderFigure } from '../src/core/figures';
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

	it('catalogue : geo-angles est rangée en Géométrie, niveaux CE2 + CM1 (#252), non exclue du sprint', () => {
		const def = getLessonById('geo-angles');
		expect(def).toBeDefined();
		expect(def?.subject).toBe('math');
		expect(def?.category).toBe('math-geometrie');
		expect(def?.levels).toEqual(['ce2', 'cm1']); // extension CM1 (#252) — moteur calibré
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

/* ============================================================
   Familles CM1 (#252) — comparer DEUX angles entre eux + notation « angle AÔB ».
   Le CE2 (genAngle) est déjà couvert plus haut ; ici, la nouveauté CM1
   (`genAngleCM1`, familles plusOuvert / egaux / notation / nommer).

   Les ouvertures ne sont PAS exposées par le tirage : on les MESURE directement
   sur la figure (angle entre les deux demi-droites, sommet en (100,100)), ce qui
   éprouve tout le pipeline (génération + rendu). L'attendu (angle le plus ouvert,
   égalité, sommet nommé) est donc dérivé indépendamment de la valeur stockée.
   ============================================================ */
const CM1 = 3000;
const cm1 = Array.from({ length: CM1 }, () => genAngleCM1());
const partCM1 = (f: FamilleCM1) => cm1.filter((t) => t.famille === f).length / CM1;

/** Les <svg> d'une figure, dans l'ordre (paire A puis B ; un seul pour un angle nommé). */
const svgsOf = (fig: string): string[] => fig.match(/<svg[\s\S]*?<\/svg>/g) ?? [];
/** Extrémité (x2, y2) des demi-droites d'un angle (deux <line> partant du sommet). */
function raies(svg: string): Array<[number, number]> {
	return (svg.match(/<line [^>]*\/>/g) ?? []).map((l) => {
		const x = Number(/x2="([-\d.]+)"/.exec(l)![1]);
		const y = Number(/y2="([-\d.]+)"/.exec(l)![1]);
		return [x - 100, y - 100]; // vecteur depuis le sommet (100,100)
	});
}
/** Ouverture mesurée (degrés) = angle entre les deux demi-droites. */
function ouvertureMesuree(svg: string): number {
	const [a, b] = raies(svg);
	const ang = (v: [number, number]) => (Math.atan2(v[1], v[0]) * 180) / Math.PI;
	let d = Math.abs(ang(a) - ang(b));
	if (d > 180) d = 360 - d;
	return d;
}
/** Longueur d'une demi-droite (le « trait » — leurre du CM1). */
function longueurTrait(svg: string): number {
	const [v] = raies(svg);
	return Math.hypot(v[0], v[1]);
}

/** Précomposées Â/Ê/Î/Ô/Û → lettre pleine du sommet. */
const CHAPEAU: Record<string, string> = { Â: 'A', Ê: 'E', Î: 'I', Ô: 'O', Û: 'U' };
const VOYELLES = new Set(['A', 'E', 'I', 'O', 'U']);

describe('Les angles CM1 (#252) — comparer deux angles + notation', () => {
	it('câblage : geo-angles calibrée CE2 + CM1 (moteur par niveau)', () => {
		expect(getLessonById('geo-angles')?.levels).toEqual(['ce2', 'cm1']);
	});

	it('QCM bien formé : figure SVG, explication, bonne réponse parmi des choix uniques', () => {
		for (const { ex } of cm1) {
			if (ex.type !== 'qcm') throw new Error('attendu qcm');
			expect(ex.figure ?? '').toContain('<svg');
			expect(ex.choices).toContain(ex.answer);
			expect(new Set(ex.choices).size).toBe(ex.choices.length);
			expect((ex.explication ?? '').length).toBeGreaterThan(0);
		}
	});

	it('pondération : 4 familles présentes, plusOuvert majoritaire (bornes larges 45/25/15/15)', () => {
		for (const f of ['plusOuvert', 'egaux', 'notation', 'nommer'] as FamilleCM1[]) {
			expect(cm1.some((t) => t.famille === f)).toBe(true);
		}
		expect(partCM1('plusOuvert')).toBeGreaterThan(0.35);
		expect(partCM1('plusOuvert')).toBeLessThan(0.55);
		expect(partCM1('egaux')).toBeGreaterThan(0.15);
		expect(partCM1('egaux')).toBeLessThan(0.35);
		expect(partCM1('notation')).toBeGreaterThan(0.08);
		expect(partCM1('nommer')).toBeGreaterThan(0.08);
	});

	describe('famille plusOuvert', () => {
		const items = cm1.filter((t) => t.famille === 'plusOuvert');

		it('figure = paire de DEUX angles ; choix A/B ; jamais de degré affiché', () => {
			for (const { ex } of items) {
				if (ex.type !== 'qcm') continue;
				expect(svgsOf(ex.figure ?? '')).toHaveLength(2);
				expect([...ex.choices].sort()).toEqual(['Angle A', 'Angle B']);
				expect(ex.figure ?? '').not.toContain('°');
				expect(ex.question).not.toContain('°');
			}
		});

		it('écart NET ≥ 25° et réponse LOYALE à l’angle réellement le plus ouvert', () => {
			for (const { ex } of items) {
				if (ex.type !== 'qcm') continue;
				const [sa, sb] = svgsOf(ex.figure ?? '');
				const oA = ouvertureMesuree(sa);
				const oB = ouvertureMesuree(sb);
				expect(Math.abs(oA - oB)).toBeGreaterThanOrEqual(24); // ≥ 25° (marge d'arrondi SVG)
				expect(ex.answer).toBe(oA > oB ? 'Angle A' : 'Angle B'); // loyauté
			}
		});

		it('PIÈGE « longueur du trait » : l’angle le plus ouvert a PARFOIS le trait le plus court', () => {
			const contreExemple = items.some(({ ex }) => {
				if (ex.type !== 'qcm') return false;
				const [sa, sb] = svgsOf(ex.figure ?? '');
				const oA = ouvertureMesuree(sa);
				const oB = ouvertureMesuree(sb);
				const lA = longueurTrait(sa);
				const lB = longueurTrait(sb);
				// Le plus ouvert a le trait strictement PLUS COURT → la longueur ne trahit pas la réponse.
				return (oA > oB && lA < lB) || (oB > oA && lB < lA);
			});
			expect(contreExemple).toBe(true);
		});
	});

	describe('famille egaux', () => {
		const items = cm1.filter((t) => t.famille === 'egaux');

		it('« Oui » ⟺ mêmes ouvertures, « Non » ⟺ écart ≥ 25° (réponse loyale)', () => {
			for (const { ex } of items) {
				if (ex.type !== 'qcm') continue;
				expect([...ex.choices].sort()).toEqual(['Non', 'Oui']);
				const [sa, sb] = svgsOf(ex.figure ?? '');
				const ecart = Math.abs(ouvertureMesuree(sa) - ouvertureMesuree(sb));
				if (ex.answer === 'Oui')
					expect(ecart).toBeLessThan(1); // mêmes ouvertures
				else expect(ecart).toBeGreaterThanOrEqual(24); // écart net
			}
			expect(items.some((t) => t.ex.type === 'qcm' && t.ex.answer === 'Oui')).toBe(true);
			expect(items.some((t) => t.ex.type === 'qcm' && t.ex.answer === 'Non')).toBe(true);
		});
	});

	describe('famille notation', () => {
		const items = cm1.filter((t) => t.famille === 'notation');

		it('réponse = lettre pleine du sommet (voyelle) ; coiffée au MILIEU ; points extérieurs = consonnes', () => {
			for (const { ex } of items) {
				if (ex.type !== 'qcm') continue;
				const m = /de l'angle (.{3}) \?$/.exec(ex.question);
				expect(m).not.toBeNull();
				const notation = m![1];
				expect(notation).toHaveLength(3);
				const chapeau = notation[1]; // le sommet est coiffé, AU MILIEU
				expect(CHAPEAU[chapeau]).toBeDefined();
				expect(ex.answer).toBe(CHAPEAU[chapeau]); // lettre pleine du sommet
				expect(VOYELLES.has(ex.answer)).toBe(true);
				// 3 choix : le sommet (voyelle) + 2 points extérieurs (consonnes, jamais une voyelle).
				expect(ex.choices).toHaveLength(3);
				expect(ex.choices).toContain(ex.answer);
				const exterieurs = ex.choices.filter((c) => c !== ex.answer);
				expect(exterieurs).toHaveLength(2);
				for (const c of exterieurs) expect(VOYELLES.has(c)).toBe(false);
				// Pools disjoints : le sommet n'est jamais l'un des points extérieurs affichés.
				expect(notation[0]).not.toBe(ex.answer);
				expect(notation[2]).not.toBe(ex.answer);
			}
		});

		it('figure angleNomme : un SVG avec des <text> (NOMS de points) mais AUCUN degré/mesure', () => {
			for (const { ex } of items) {
				if (ex.type !== 'qcm') continue;
				const svgs = svgsOf(ex.figure ?? '');
				expect(svgs).toHaveLength(1);
				expect(svgs[0]).toContain('<text'); // exception admise : les noms de points
				expect(ex.figure ?? '').not.toContain('°');
				expect((ex.figure ?? '').toLowerCase()).not.toContain('degré');
			}
		});

		it('`parle` présent et verbalise l’accent circonflexe (le circonflexe est inaudible)', () => {
			for (const { ex } of items) {
				if (ex.type !== 'qcm') continue;
				expect(typeof ex.parle).toBe('string');
				expect(ex.parle ?? '').toContain('accent circonflexe');
			}
		});
	});

	describe('famille nommer (consolidation aigu/droit/obtus)', () => {
		it('choix = les trois termes ; bonne réponse loyale à un angle simple', () => {
			const items = cm1.filter((t) => t.famille === 'nommer');
			for (const { ex } of items) {
				if (ex.type !== 'qcm') continue;
				expect([...ex.choices].sort()).toEqual(['Aigu', 'Droit', 'Obtus']);
				expect(['Aigu', 'Droit', 'Obtus']).toContain(ex.answer);
				expect(svgsOf(ex.figure ?? '')).toHaveLength(1); // un seul angle
			}
		});
	});
});

describe('renderAnglePair / renderAngleNomme — invariants du renderer (#252)', () => {
	it('renderAnglePair : deux SVG étiquetés A/B, sans cote, avec des rayons distincts honorés', () => {
		const fig = renderAnglePair(
			{ opening: 40, bisector: 30, ray: 50 },
			{ opening: 120, bisector: 210, ray: 82 },
		);
		const svgs = svgsOf(fig);
		expect(svgs).toHaveLength(2);
		expect(fig).toContain('Angle A');
		expect(fig).toContain('Angle B');
		for (const svg of svgs) {
			expect(svg).not.toContain('<text'); // aucune cote DANS le SVG (l'étiquette A/B est hors SVG)
			expect(svg).not.toContain('°');
		}
		// Le rayon est honoré par angle : ouverture 40° (A) et 120° (B) retrouvées, traits 50 et 82.
		expect(Math.round(ouvertureMesuree(svgs[0]))).toBe(40);
		expect(Math.round(ouvertureMesuree(svgs[1]))).toBe(120);
		expect(Math.round(longueurTrait(svgs[0]))).toBe(50);
		expect(Math.round(longueurTrait(svgs[1]))).toBe(82);
	});

	it('renderAngleNomme : un SVG avec les 3 noms de points (<text>) mais jamais de degré', () => {
		const fig = renderAngleNomme({ opening: 70, bisector: 20, ray: 64 }, ['B', 'A', 'D']);
		expect(svgsOf(fig)).toHaveLength(1);
		expect(fig).toContain('<text');
		expect(fig).toContain('>B<');
		expect(fig).toContain('>A<');
		expect(fig).toContain('>D<');
		expect(fig).not.toContain('°');
	});
});
