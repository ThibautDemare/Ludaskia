/* ============================================================
   Fractions (#200) — logique de génération (src/data/maths/fractions).
   On tire beaucoup d'exercices par leçon et on vérifie les invariants de
   calibrage CE2 : fractions < 1, dénominateur ≤ 12, résultats entiers pour la
   collection, comparaison jamais piégée, addition correcte. Pas de DOM.
   ============================================================ */
import { describe, it, expect } from 'vitest';
import { FRACTIONS_LESSONS, nomFraction } from '../src/data/maths/fractions';
import { renderFractionBarre } from '../src/core/figures';
import { mathInline } from '../src/core/fraction-text';
import { choiceButtonHTML } from '../src/core/items';
import { genLessonItem, getLessonById, getLessonsByCategory } from '../src/core/catalog';

const TIRAGES = 400;
// Plus grand échantillon pour les invariants statistiques par niveau (#287).
const TIRAGES_STAT = 1000;

function lecon(lessonId: string) {
	return FRACTIONS_LESSONS.find((x) => x.id === lessonId)!;
}

function genere(lessonId: string) {
	const l = lecon(lessonId);
	return Array.from({ length: TIRAGES }, () => l.exerciseType.generate({ mode: 'qcm' }));
}

/* Tire `n` exercices d'une leçon pour un niveau donné (#287). */
function genereNiveau(lessonId: string, level: 'ce2' | 'cm1', n = TIRAGES_STAT) {
	const l = lecon(lessonId);
	return Array.from({ length: n }, () => l.exerciseType.generate({ level }));
}

/* Découpe une notation « num/den » en nombres. */
function parse(f: string): [number, number] {
	const [n, d] = f.split('/').map(Number);
	return [n, d];
}

describe('mathInline — affichage empilé (barre horizontale, #200)', () => {
	it("rend la fraction empilée avec un aria-label verbal, pas l'oblique", () => {
		const html = mathInline('Combien font 6/8 + 1/8 ?');
		// La barre horizontale est rendue (num/den dans des span séparés), pas « 6/8 » brut.
		expect(html).not.toContain('6/8');
		expect(html).toContain('frac-num');
		expect(html).toContain('frac-den');
		// aria-label verbal pour le lecteur d'écran (jamais « six slash huit »).
		expect(html).toContain('aria-label="six huitièmes"');
		expect(html).toContain('aria-label="un huitième"');
	});

	it('laisse intact un texte sans fraction (échappement seul)', () => {
		expect(mathInline('a < b')).toBe('a &lt; b');
	});
});

describe('choicesView — choix QCM riches (#200)', () => {
	it('les leçons à choix-fractions fournissent une vue alignée (html + libellé verbal)', () => {
		for (const id of [
			'num-frac-sens',
			'num-frac-bande',
			'num-frac-comparaison',
			'num-frac-addition',
		]) {
			for (const ex of genere(id)) {
				if (ex.type !== 'qcm') continue;
				expect(ex.choicesView).toBeDefined();
				expect(ex.choicesView).toHaveLength(ex.choices.length);
				ex.choices.forEach((c, i) => {
					const v = ex.choicesView![i];
					const [n, d] = parse(c);
					expect(v.html).toContain('frac-num'); // fraction empilée, pas « n/d »
					expect(v.label).toBe(nomFraction(n, d)); // libellé parlé aligné sur la valeur
				});
			}
		}
	});

	it("les choix texte (égalités oui/non) n'ont pas de vue riche", () => {
		for (const ex of genere('num-frac-egalites')) {
			if (ex.type !== 'qcm') continue;
			expect(ex.choicesView).toBeUndefined();
		}
	});

	it('choiceButtonHTML : valeur échappée par défaut, html + aria-label si vue', () => {
		// Sans vue : la valeur est échappée (sécurité), pas de aria-label.
		const plain = choiceButtonHTML('a < b', 0);
		expect(plain).toContain('data-i="0"');
		expect(plain).toContain('a &lt; b');
		expect(plain).not.toContain('aria-label');
		// Avec vue : html de confiance rendu tel quel + libellé parlé en aria-label.
		const rich = choiceButtonHTML('3/4', 1, {
			html: '<span class="frac">x</span>',
			label: 'trois quarts',
		});
		expect(rich).toContain('aria-label="trois quarts"');
		expect(rich).toContain('<span class="frac">x</span>');
	});
});

describe('nomFraction — libellé verbal (#42)', () => {
	it('cas spéciaux et pluriels', () => {
		expect(nomFraction(1, 2)).toBe('un demi');
		expect(nomFraction(1, 3)).toBe('un tiers');
		expect(nomFraction(1, 4)).toBe('un quart');
		expect(nomFraction(2, 3)).toBe('deux tiers');
		expect(nomFraction(3, 4)).toBe('trois quarts');
		expect(nomFraction(2, 5)).toBe('deux cinquièmes');
		expect(nomFraction(5, 6)).toBe('cinq sixièmes');
		expect(nomFraction(3, 8)).toBe('trois huitièmes');
		expect(nomFraction(1, 12)).toBe('un douzième');
	});
});

describe('renderFractionBarre — parts rigoureusement égales (exigence #200)', () => {
	it('produit `den` rectangles de largeur identique, `num` parts coloriées', () => {
		for (const [num, den] of [
			[1, 2],
			[3, 8],
			[2, 3],
			[5, 6],
		]) {
			const svg = renderFractionBarre(num, den);
			const widths = [...svg.matchAll(/<rect[^>]*\bwidth="([\d.]+)"/g)].map((m) => m[1]);
			expect(widths).toHaveLength(den); // une part par dénominateur
			expect(new Set(widths).size).toBe(1); // toutes STRICTEMENT égales
			// Un point central plein par part coloriée (signal de forme redondant).
			const points = [...svg.matchAll(/<circle/g)];
			expect(points).toHaveLength(num);
		}
	});
});

describe('leçon « Lire une fraction » (sens)', () => {
	it('QCM à 4 choix, fraction < 1, figure, réponse parmi les choix', () => {
		for (const ex of genere('num-frac-sens')) {
			expect(ex.type).toBe('qcm');
			if (ex.type !== 'qcm') continue;
			expect(ex.choices).toHaveLength(4);
			expect(new Set(ex.choices).size).toBe(4); // choix distincts
			expect(ex.choices).toContain(ex.answer);
			expect(ex.figure).toBeTruthy();
			const [n, d] = parse(ex.answer);
			expect(n).toBeGreaterThanOrEqual(1);
			expect(n).toBeLessThan(d); // fraction strictement < 1
			expect(d).toBeLessThanOrEqual(12);
		}
	});
});

describe("leçon « Fraction d'une collection » (saisie numérique)", () => {
	it('réponse entière > 0, énoncé avec champ, figure de collection', () => {
		const l = FRACTIONS_LESSONS.find((x) => x.id === 'num-frac-collection')!;
		for (let i = 0; i < TIRAGES; i++) {
			const ex = l.exerciseType.generate();
			expect(ex.type).toBe('text');
			if (ex.type !== 'text') continue;
			expect(ex.question).toContain('@');
			expect(ex.figure).toBeTruthy();
			const res = Number(ex.answer);
			expect(Number.isInteger(res)).toBe(true);
			expect(res).toBeGreaterThan(0);
			// La réponse écrite est validée par le check du type.
			expect(l.exerciseType.check(ex, String(res))).toBe(true);
			expect(l.exerciseType.check(ex, String(res + 1))).toBe(false);
		}
	});
});

describe('leçon « Fraction sur une bande »', () => {
	it('QCM à 4 choix distincts, dénominateur lisible, réponse < 1', () => {
		for (const ex of genere('num-frac-bande')) {
			if (ex.type !== 'qcm') continue;
			expect(ex.choices).toHaveLength(4);
			expect(new Set(ex.choices).size).toBe(4); // choix distincts
			expect(ex.choices).toContain(ex.answer);
			expect(ex.figure).toBeTruthy();
			const [n, d] = parse(ex.answer);
			expect(n).toBeLessThan(d);
			// CE2 : {2,3,4,6,8} + 5 (#287) ; le 5 a été ajouté à la plage par défaut.
			expect([2, 3, 4, 5, 6, 8]).toContain(d);
		}
	});
});

describe('leçon « Fractions égales » (oui/non)', () => {
	it('réponse oui/non cohérente avec les deux barres', () => {
		for (const ex of genere('num-frac-egalites')) {
			if (ex.type !== 'qcm') continue;
			expect(ex.choices).toHaveLength(2);
			expect(ex.choices).toContain(ex.answer);
			expect(ex.figure).toBeTruthy();
			expect(['Oui, elles sont égales', 'Non, elles sont différentes']).toContain(ex.answer);
		}
	});
});

describe('leçon « Comparer des fractions »', () => {
	it("jamais d'égalité, écart franc, réponse = la plus grande, 2 choix", () => {
		for (const ex of genere('num-frac-comparaison')) {
			if (ex.type !== 'qcm') continue;
			expect(ex.choices).toHaveLength(2);
			expect(ex.choices).toContain(ex.answer);
			expect(ex.figure).toBeTruthy();
			const [a, b] = ex.choices.map(parse);
			const va = a[0] / a[1];
			const vb = b[0] / b[1];
			// Jamais d'égalité ni de quasi-égalité (piège injuste sans dénominateur commun).
			expect(Math.abs(va - vb)).toBeGreaterThanOrEqual(1 / 6 - 1e-9);
			// La réponse est bien la plus grande des deux.
			const grande = va > vb ? ex.choices[0] : ex.choices[1];
			expect(ex.answer).toBe(grande);
			// Fractions toujours < 1.
			for (const [n, d] of [a, b]) expect(n).toBeLessThan(d);
		}
	});
});

describe('leçon « Additionner des fractions » (même dénominateur)', () => {
	it('somme correcte, résultat < 1, dénominateur conservé, 4 choix', () => {
		for (const ex of genere('num-frac-addition')) {
			if (ex.type !== 'qcm') continue;
			expect(ex.choices).toHaveLength(4);
			expect(new Set(ex.choices).size).toBe(4); // choix distincts
			expect(ex.choices).toContain(ex.answer);
			expect(ex.figure).toBeTruthy();
			// L'énoncé est « a/d + b/d ? » ; on revérifie la somme.
			const termes = ex.question.match(/(\d+)\/(\d+)/g)!.map(parse);
			expect(termes).toHaveLength(2);
			const [[n1, d1], [n2, d2]] = termes;
			expect(d1).toBe(d2); // même dénominateur
			const [ansN, ansD] = parse(ex.answer);
			expect(ansD).toBe(d1); // le dénominateur ne change pas
			expect(ansN).toBe(n1 + n2); // on additionne les numérateurs
			expect(ansN).toBeLessThan(ansD); // résultat < 1
		}
	});
});

describe('intégration catalogue', () => {
	it('les 6 leçons sont dans Numération, rubrique « Fractions »', () => {
		const num = getLessonsByCategory('math-numeration');
		const fracs = num.filter((l) => l.rubrique === 'Fractions');
		expect(fracs).toHaveLength(6);
		for (const l of fracs) expect(l.id.startsWith('num-frac-')).toBe(true);
	});

	it('genLessonItem porte la figure (QCM) et le bon kind (collection numérique)', () => {
		const sens = genLessonItem(getLessonById('num-frac-sens')!);
		expect(sens.figure).toBeTruthy();
		const coll = genLessonItem(getLessonById('num-frac-collection')!);
		expect(coll.kind).toBe('num');
		expect(coll.figure).toBeTruthy();
	});
});

/* ============================================================
   Calibrage par niveau (#287). Les trois leçons calibrées (collection, bande,
   addition) exposent { ce2, cm1 } via leur ExerciseType ; le CE2 garde ses plages
   (avec quelques ajouts), le CM1 les élargit. La leçon « sens » reste CE2-only
   (purement visuelle, barre ≤ 8 parts). Le catalogue, lui, garde `levels: ['ce2']`
   (CM1 derrière le paramètre `level`) : on teste donc le moteur, pas le catalogue.
   ============================================================ */

/* Découpe l'énoncé d'addition « a/d + b/d ? » en ses deux fractions. */
function termesAddition(question: string): [number, number][] {
	return question.match(/(\d+)\/(\d+)/g)!.map(parse);
}

describe('calibrage par niveau (#287)', () => {
	it('les leçons calibrées exposent les niveaux ce2 ET cm1', () => {
		for (const id of ['num-frac-collection', 'num-frac-bande', 'num-frac-addition']) {
			expect(lecon(id).exerciseType.levels).toEqual(['ce2', 'cm1']);
		}
	});

	it("la leçon « sens » n'est PAS calibrée (purement visuelle, reste CE2-only)", () => {
		// Pas de `levels` exposés → le catalogue la laisse en ['ce2'] par défaut.
		expect(lecon('num-frac-sens').exerciseType.levels).toBeUndefined();
	});

	describe('addition : dénominateurs par niveau', () => {
		it('CE2 inclut 10 mais JAMAIS 12 ; toutes les réponses se valident', () => {
			const l = lecon('num-frac-addition');
			const densVus = new Set<number>();
			for (const ex of genereNiveau('num-frac-addition', 'ce2')) {
				if (ex.type !== 'qcm') continue;
				const termes = termesAddition(ex.question);
				const d = termes[0][1];
				densVus.add(d);
				expect(l.exerciseType.check(ex, ex.answer)).toBe(true); // la clé se valide
			}
			expect(densVus.has(10)).toBe(true);
			expect(densVus.has(12)).toBe(false);
			expect([...densVus].every((d) => [3, 4, 5, 6, 8, 10].includes(d))).toBe(true);
		});

		it('CM1 inclut 12', () => {
			const densVus = new Set<number>();
			for (const ex of genereNiveau('num-frac-addition', 'cm1')) {
				if (ex.type !== 'qcm') continue;
				densVus.add(termesAddition(ex.question)[0][1]);
			}
			expect(densVus.has(12)).toBe(true);
			expect([...densVus].every((d) => [3, 4, 5, 6, 8, 10, 12].includes(d))).toBe(true);
		});
	});

	describe('bande : dénominateurs par niveau', () => {
		it('CE2 inclut 5 mais JAMAIS 10', () => {
			const densVus = new Set<number>();
			for (const ex of genereNiveau('num-frac-bande', 'ce2')) {
				if (ex.type !== 'qcm') continue;
				densVus.add(parse(ex.answer)[1]);
			}
			expect(densVus.has(5)).toBe(true);
			expect(densVus.has(10)).toBe(false);
			expect([...densVus].every((d) => [2, 3, 4, 5, 6, 8].includes(d))).toBe(true);
		});

		it('CM1 inclut 10', () => {
			const densVus = new Set<number>();
			for (const ex of genereNiveau('num-frac-bande', 'cm1')) {
				if (ex.type !== 'qcm') continue;
				densVus.add(parse(ex.answer)[1]);
			}
			expect(densVus.has(10)).toBe(true);
			expect([...densVus].every((d) => [2, 3, 4, 5, 6, 8, 10].includes(d))).toBe(true);
		});
	});

	describe('collection : total borné et numérateurs rééquilibrés', () => {
		it('CE2 : total ≤ 36, résultat entier, réponse validée ; part de num = 1 ≈ 40 %', () => {
			const l = lecon('num-frac-collection');
			let num1 = 0;
			const echantillons = genereNiveau('num-frac-collection', 'ce2');
			for (const ex of echantillons) {
				expect(ex.type).toBe('text');
				if (ex.type !== 'text') continue;
				// L'énoncé est « num/den de total ? @ » — on récupère total et num/den.
				const total = Number(ex.question.match(/de (\d+) \?/)![1]);
				expect(total).toBeLessThanOrEqual(36);
				const [num, den] = parse(ex.question.match(/(\d+)\/(\d+)/)![0]);
				expect(den).toBeLessThanOrEqual(6); // dénominateurs CE2
				expect(num).toBeLessThan(den); // fraction < 1
				const res = Number(ex.answer);
				expect(Number.isInteger(res)).toBe(true);
				expect(res).toBeGreaterThan(0);
				expect(l.exerciseType.check(ex, String(res))).toBe(true);
				if (num === 1) num1++;
			}
			// Rééquilibrage #287 : on visait ~40 % (contre ~60 % avant). Borne large.
			const part = num1 / echantillons.length;
			expect(part).toBeGreaterThan(0.3);
			expect(part).toBeLessThan(0.5);
		});

		it('CM1 : dénominateurs 8 et 10 disponibles, total ≤ 60, réponse validée', () => {
			const l = lecon('num-frac-collection');
			const densVus = new Set<number>();
			for (const ex of genereNiveau('num-frac-collection', 'cm1')) {
				if (ex.type !== 'text') continue;
				const total = Number(ex.question.match(/de (\d+) \?/)![1]);
				expect(total).toBeLessThanOrEqual(60);
				const [, den] = parse(ex.question.match(/(\d+)\/(\d+)/)![0]);
				densVus.add(den);
				const res = Number(ex.answer);
				expect(Number.isInteger(res)).toBe(true);
				expect(l.exerciseType.check(ex, String(res))).toBe(true);
			}
			expect(densVus.has(8)).toBe(true);
			expect(densVus.has(10)).toBe(true);
		});
	});

	it('sens (barre) : dénominateur TOUJOURS ≤ 8 quel que soit le niveau demandé', () => {
		// Plafond de lisibilité de la barre : ne jamais dépasser 8 parts, même si
		// l'on force un niveau « supérieur » (la leçon n'est de toute façon pas calibrée).
		for (const level of ['ce2', 'cm1'] as const) {
			for (const ex of genereNiveau('num-frac-sens', level, 300)) {
				if (ex.type !== 'qcm') continue;
				expect(parse(ex.answer)[1]).toBeLessThanOrEqual(8);
			}
		}
	});
});
