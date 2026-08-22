/* ============================================================
   Grandeurs et mesures CM1 — Aire et périmètre (#253).
   ------------------------------------------------------------
   Tests de LOGIQUE PURE de la leçon `mes-aire-perimetre` : QCM 100 % comptage sur
   quadrillage (aire en carreaux, périmètre en côtés de carreaux), + vrai/faux et
   comparaison de deux figures.

   Attendus DÉRIVÉS de la consigne et de la géométrie du quadrillage :
   - un polygone RECTILIGNE (rectangle plein ou L par évidage d'un coin) a un périmètre
     PAIR, égal à celui de son rectangle englobant → 8 ≤ p ≤ 24 pour des figures ≤ 6×6 ;
   - l'aire est un entier positif ≤ 36 (plafond 6×6) ;
   - on compte des carreaux / côtés de carreaux, jamais des « cm ».

   LIMITE ASSUMÉE (remontée dans le compte rendu) : `figureRectiligne`/`choixNombres` ne
   sont PAS exportés et les cases (`cells`) ne figurent pas sur l'Exercise. On ne peut donc
   PAS, depuis l'API publique, vérifier « aire === nb de cases », « périmètre ===
   boundaryEdges(cells) », la présence du distracteur croisé, l'écart non nul d'un vrai/faux
   « Faux », ni la justesse d'une comparaison. Ces invariants exigeraient d'exposer les
   internes du générateur.
   ============================================================ */
import { describe, it, expect } from 'vitest';
import { getLessonById, getLessonsByCategory } from '../src/core/catalog';
import type { ExerciseType } from '../src/core/exercise';
import { withSeed } from '../src/core/utils';
import { figureRectiligne } from '../src/data/maths/aire-perimetre';
import { boundaryEdges } from '../src/core/figures';

const LESSON_ID = 'mes-aire-perimetre';
const getType = (): ExerciseType => getLessonById(LESSON_ID)!.exerciseType;

type SousType = 'aire' | 'perimetre' | 'vraiFaux' | 'comparaison';
function sousType(question: string): SousType {
	if (question.startsWith('Combien de carreaux')) return 'aire';
	if (question.startsWith('Combien de côtés')) return 'perimetre';
	if (question.startsWith('Vrai ou faux')) return 'vraiFaux';
	return 'comparaison'; // « Les deux figures ont-elles… »
}

/* Un choix numérique de QCM comptage : entier strictement positif. */
function assertChoixNombres(choices: string[], answer: string): void {
	expect(choices).toHaveLength(4); // TOUJOURS exactement 4
	expect(new Set(choices).size).toBe(4); // distincts
	expect(choices).toContain(answer); // la bonne réponse est présente
	for (const c of choices) {
		const n = Number(c);
		expect(Number.isInteger(n), `choix non entier : « ${c} »`).toBe(true);
		expect(n, `choix non positif : « ${c} »`).toBeGreaterThan(0);
	}
}

describe('Aire et périmètre CM1 — structure par sous-type', () => {
	it('tous les items sont des QCM avec figure SVG', () => {
		const type = getType();
		withSeed(11, () => {
			for (let i = 0; i < 2000; i++) {
				const ex = type.generate();
				expect(ex.type).toBe('qcm');
				if (ex.type !== 'qcm') continue;
				expect(ex.figure?.balisage ?? '').toContain('<svg');
				expect(ex.parle).toBe(ex.question);
			}
		});
	});

	it('aire : 4 choix entiers positifs distincts dont la bonne ; réponse ≤ 36 (plafond 6×6) ; sans « cm »', () => {
		const type = getType();
		withSeed(22, () => {
			for (let i = 0; i < 3000; i++) {
				const ex = type.generate();
				if (ex.type !== 'qcm' || sousType(ex.question) !== 'aire') continue;
				expect(ex.question).not.toContain('cm'); // carreaux, pas cm²
				assertChoixNombres(ex.choices, ex.answer);
				const aire = Number(ex.answer);
				expect(Number.isInteger(aire)).toBe(true);
				expect(aire).toBeGreaterThan(0);
				expect(aire).toBeLessThanOrEqual(36); // 6×6 max
			}
		});
	});

	it('périmètre : réponse PAIRE (polygone rectiligne) ≤ 24 ; 4 choix entiers positifs distincts ; sans « cm »', () => {
		const type = getType();
		withSeed(33, () => {
			for (let i = 0; i < 3000; i++) {
				const ex = type.generate();
				if (ex.type !== 'qcm' || sousType(ex.question) !== 'perimetre') continue;
				expect(ex.question).not.toContain('cm');
				assertChoixNombres(ex.choices, ex.answer);
				const p = Number(ex.answer);
				expect(p % 2, `périmètre impair (${p}) : impossible pour un polygone rectiligne`).toBe(0);
				expect(p).toBeGreaterThanOrEqual(4);
				expect(p).toBeLessThanOrEqual(24); // 2×(6+6) max
			}
		});
	});

	it('vrai/faux : choix [Vrai, Faux] ; valeur affichée entière strictement positive', () => {
		const type = getType();
		withSeed(44, () => {
			for (let i = 0; i < 3000; i++) {
				const ex = type.generate();
				if (ex.type !== 'qcm' || sousType(ex.question) !== 'vraiFaux') continue;
				expect(ex.choices).toEqual(['Vrai', 'Faux']);
				expect(['Vrai', 'Faux']).toContain(ex.answer);
				expect(ex.question).not.toContain('cm');
				// La valeur affichée (aire ou périmètre proposé) est toujours > 0, même quand la
				// réponse est « Faux » (écart borné, jamais une valeur ≤ 0).
				const m = ex.question.match(/(\d+)/);
				expect(m, `aucune valeur numérique dans « ${ex.question} »`).not.toBeNull();
				expect(Number(m![1])).toBeGreaterThan(0);
			}
		});
	});

	it('comparaison : choix [Oui, Non] ; question attendue sur l’aire ou le périmètre', () => {
		const type = getType();
		const questionsAttendues = [
			'Les deux figures ont-elles la même aire ?',
			'Les deux figures ont-elles le même périmètre ?',
		];
		withSeed(55, () => {
			for (let i = 0; i < 3000; i++) {
				const ex = type.generate();
				if (ex.type !== 'qcm' || sousType(ex.question) !== 'comparaison') continue;
				expect(ex.choices).toEqual(['Oui', 'Non']);
				expect(['Oui', 'Non']).toContain(ex.answer);
				expect(questionsAttendues).toContain(ex.question);
			}
		});
	});
});

describe('Aire et périmètre CM1 — distribution des sous-types', () => {
	it('les 4 sous-types apparaissent dans des proportions proches de la conception', () => {
		// Progression : aire ~35 %, périmètre ~15 %, vrai/faux ~25 %, comparaison ~25 %
		// (comparaison minoritaire mais présente). Bornes larges, échantillon déterministe.
		const type = getType();
		const compte: Record<SousType, number> = { aire: 0, perimetre: 0, vraiFaux: 0, comparaison: 0 };
		const N = 4000;
		withSeed(66, () => {
			for (let i = 0; i < N; i++) {
				const ex = type.generate();
				if (ex.type === 'qcm') compte[sousType(ex.question)]++;
			}
		});
		for (const k of Object.keys(compte) as SousType[]) {
			expect(compte[k], `sous-type absent : ${k}`).toBeGreaterThan(0);
		}
		expect(compte.aire / N).toBeGreaterThan(0.25);
		expect(compte.aire / N).toBeLessThan(0.45);
		expect(compte.perimetre / N).toBeGreaterThan(0.07);
		expect(compte.perimetre / N).toBeLessThan(0.24);
		expect(compte.vraiFaux / N).toBeGreaterThan(0.15);
		expect(compte.vraiFaux / N).toBeLessThan(0.35);
		expect(compte.comparaison / N).toBeGreaterThan(0.15);
		expect(compte.comparaison / N).toBeLessThan(0.35);
	});
});

describe('Aire et périmètre CM1 — déterminisme et diversité', () => {
	it('même graine → exercice identique (question, réponse, choix, figure)', () => {
		const type = getType();
		const a = withSeed(9999, () => type.generate());
		const b = withSeed(9999, () => type.generate());
		expect(JSON.stringify(a)).toBe(JSON.stringify(b));
	});

	it('le générateur n’est pas figé (au moins 5 exercices distincts sur un échantillon)', () => {
		const type = getType();
		const vus = new Set<string>();
		withSeed(77, () => {
			for (let i = 0; i < 60; i++) vus.add(JSON.stringify(type.generate()));
		});
		expect(vus.size).toBeGreaterThanOrEqual(5);
	});
});

describe('Aire et périmètre CM1 — figureRectiligne (géométrie exacte, lecture directe)', () => {
	// Le module utilise figureRectiligne(6) pour aire/périmètre/vrai-faux et (5) pour la
	// comparaison : on éprouve les deux plafonds.
	for (const maxDim of [5, 6]) {
		it(`maxDim=${maxDim} : aire===nb de cases, périmètre recalculé, cases uniques, cases dans la marge`, () => {
			let auMoinsUnL = 0;
			withSeed(1000 + maxDim, () => {
				for (let i = 0; i < 3000; i++) {
					const f = figureRectiligne(maxDim);
					// aire = nombre de cases pleines.
					expect(f.aire).toBe(f.cells.length);
					expect(f.aire).toBeGreaterThan(0);
					// périmètre = contour recalculé INDÉPENDAMMENT (garde contre un stockage faux).
					expect(f.perimetre).toBe(boundaryEdges(f.cells).length);
					// pas de case dupliquée.
					const cles = new Set(f.cells.map(([x, y]) => `${x},${y}`));
					expect(cles.size).toBe(f.cells.length);
					// dimensions bornées : a = cols-2 ∈ [1, maxDim], idem b.
					expect(f.cols).toBeLessThanOrEqual(maxDim + 2);
					expect(f.rows).toBeLessThanOrEqual(maxDim + 2);
					expect(f.cols).toBeGreaterThanOrEqual(4); // a ≥ 2 (marge d'1 case de chaque côté)
					expect(f.rows).toBeGreaterThanOrEqual(4);
					// marge d'1 case tout autour : chaque case dans [1, cols-2] × [1, rows-2].
					for (const [x, y] of f.cells) {
						expect(x).toBeGreaterThanOrEqual(1);
						expect(x).toBeLessThanOrEqual(f.cols - 2);
						expect(y).toBeGreaterThanOrEqual(1);
						expect(y).toBeLessThanOrEqual(f.rows - 2);
					}
					// l'aire ne dépasse JAMAIS le rectangle englobant ; si évidée (L), elle est
					// STRICTEMENT inférieure.
					const rectPlein = (f.cols - 2) * (f.rows - 2);
					expect(f.aire).toBeLessThanOrEqual(rectPlein);
					if (f.aire < rectPlein) auMoinsUnL++;
				}
			});
			// Le cas en L (évidage d'un coin) doit réellement se produire.
			expect(auMoinsUnL).toBeGreaterThan(0);
		});
	}
});

describe('Catalogue — branchement de mes-aire-perimetre (#253)', () => {
	it('leçon CM1 de grandeurs et mesures, hors sprint, absente du CE2', () => {
		const lesson = getLessonById(LESSON_ID)!;
		expect(lesson).toBeDefined();
		expect(lesson.category).toBe('math-grandeurs-mesures');
		expect(lesson.levels).toContain('cm1');
		expect(lesson.levels).not.toContain('ce2');
		expect(lesson.excludeFromSprint).toBe(true);
	});

	it('présente dans les mesures CM1, absente des mesures CE2', () => {
		const cm1 = getLessonsByCategory('math-grandeurs-mesures', 'cm1').map((l) => l.id);
		const ce2 = getLessonsByCategory('math-grandeurs-mesures', 'ce2').map((l) => l.id);
		expect(cm1).toContain(LESSON_ID);
		expect(ce2).not.toContain(LESSON_ID);
	});
});
