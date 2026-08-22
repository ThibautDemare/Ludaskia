/* ============================================================
   Fractions (#200) — logique de génération (src/data/maths/fractions).
   On tire beaucoup d'exercices par leçon et on vérifie les invariants de
   calibrage CE2 : fractions < 1, dénominateur ≤ 12, résultats entiers pour la
   collection, comparaison jamais piégée, addition correcte. Pas de DOM.
   ============================================================ */
import { describe, it, expect } from 'vitest';
import { FRACTIONS_LESSONS, nomFraction, distracteursImpropre } from '../src/data/maths/fractions';
import {
	renderFractionBarre,
	renderFractionBande,
	renderFractionSuperieure,
	renderFractionDemiDroite,
} from '../src/core/figures';
import { mathInline } from '../src/core/fraction-text';
import { choiceButtonHTML, createRenderContext, renderItem } from '../src/core/items';
import type { Item } from '../src/core/items';
import { genLessonItem, getLessonById, getLessonsByCategory } from '../src/core/catalog';
import { brut } from '../src/core/html';

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
		expect(html.balisage).not.toContain('6/8');
		expect(html.balisage).toContain('frac-num');
		expect(html.balisage).toContain('frac-den');
		// aria-label verbal pour le lecteur d'écran (jamais « six slash huit »).
		expect(html.balisage).toContain('aria-label="six huitièmes"');
		expect(html.balisage).toContain('aria-label="un huitième"');
	});

	it('laisse intact un texte sans fraction (échappement seul)', () => {
		expect(mathInline('a < b').balisage).toBe('a &lt; b');
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
					expect(v.html.balisage).toContain('frac-num'); // fraction empilée, pas « n/d »
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
		expect(plain.balisage).toContain('data-i="0"');
		expect(plain.balisage).toContain('a &lt; b');
		expect(plain.balisage).not.toContain('aria-label');
		// Avec vue : html de confiance rendu tel quel + libellé parlé en aria-label.
		const rich = choiceButtonHTML('3/4', 1, {
			html: brut('<span class="frac">x</span>'),
			label: 'trois quarts',
		});
		expect(rich.balisage).toContain('aria-label="trois quarts"');
		expect(rich.balisage).toContain('<span class="frac">x</span>');
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

	it('numérateurs impropres > 9 dits en toutes lettres (#249, pas « 27 cinquièmes »)', () => {
		expect(nomFraction(11, 4)).toBe('onze quarts');
		expect(nomFraction(17, 6)).toBe('dix-sept sixièmes');
		expect(nomFraction(23, 8)).toBe('vingt-trois huitièmes');
		expect(nomFraction(27, 5)).toBe('vingt-sept cinquièmes'); // décomposition 27/5 = 5 + 2/5
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
			expect(ex.figure?.balisage).toBeTruthy();
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
			expect(ex.figure?.balisage).toBeTruthy();
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
			expect(ex.figure?.balisage).toBeTruthy();
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
			expect(ex.figure?.balisage).toBeTruthy();
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
			expect(ex.figure?.balisage).toBeTruthy();
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
			expect(ex.figure?.balisage).toBeTruthy();
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
	it('les 9 leçons sont dans Numération, rubrique « Fractions »', () => {
		const num = getLessonsByCategory('math-numeration');
		const fracs = num.filter((l) => l.rubrique === 'Fractions');
		expect(fracs).toHaveLength(9); // 6 de base (#200) + 3 « fractions comme nombres » (#249)
		for (const l of fracs) expect(l.id.startsWith('num-frac-')).toBe(true);
	});

	it('genLessonItem porte la figure (QCM) et le bon kind (collection numérique)', () => {
		const sens = genLessonItem(getLessonById('num-frac-sens')!);
		expect(sens.figure?.balisage).toBeTruthy();
		const coll = genLessonItem(getLessonById('num-frac-collection')!);
		expect(coll.kind).toBe('num');
		expect(coll.figure?.balisage).toBeTruthy();
	});
});

/* ============================================================
   Calibrage par niveau (#287). Les trois leçons calibrées (collection, bande,
   addition) exposent { ce2, cm1 } via leur ExerciseType ; le CE2 garde ses plages
   (avec quelques ajouts), le CM1 les élargit. La leçon « sens » n'est PAS calibrée
   (purement visuelle, barre ≤ 8 parts, contenu identique aux deux niveaux).
   Surfaçage CM1 (#249) : le catalogue ouvre désormais les 6 leçons de base au CM1
   (levels dérivés du moteur, défaut ['ce2', 'cm1'] pour les non calibrées), tandis que
   les 3 leçons « fractions comme nombres » sont CM1-only (levels ['cm1']).
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

	it("la leçon « sens » n'est PAS calibrée (purement visuelle)", () => {
		// Pas de `levels` exposés par le moteur → le catalogue applique le défaut (#249).
		expect(lecon('num-frac-sens').exerciseType.levels).toBeUndefined();
	});

	it('surfaçage catalogue (#249) : 6 leçons de base au CM1, 3 nouvelles CM1-only', () => {
		// Base ouverte aux DEUX niveaux (CE2 inchangé + CM1 ouvert).
		for (const id of [
			'num-frac-sens',
			'num-frac-collection',
			'num-frac-bande',
			'num-frac-egalites',
			'num-frac-comparaison',
			'num-frac-addition',
		]) {
			expect(getLessonById(id)!.levels).toEqual(['ce2', 'cm1']);
		}
		// « Fractions comme nombres » : CM1 seulement (fractions ≥ 1, hors programme CE2).
		for (const id of ['num-frac-superieure', 'num-frac-decomposer', 'num-frac-encadrer']) {
			expect(getLessonById(id)!.levels).toEqual(['cm1']);
		}
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

/* ============================================================
   Fractions comme NOMBRES (#249, CM1) — impropres, décomposition, encadrement
   (statut de nombre) + figures « plusieurs unités » (barre empilée, demi-droite).
   ============================================================ */

/* Tire `n` exercices d'une leçon CM1 (générateurs #249 non paramétrés par mode). */
function genereCM1(lessonId: string, n = TIRAGES) {
	const l = lecon(lessonId);
	return Array.from({ length: n }, () => l.exerciseType.generate({ level: 'cm1' }));
}

describe('leçon « Une fraction plus grande que 1 » (impropre, QCM)', () => {
	it('impropre 1 < f < 3, figure, 4 choix distincts dont la réponse, vue riche empilée', () => {
		for (const ex of genereCM1('num-frac-superieure')) {
			expect(ex.type).toBe('qcm');
			if (ex.type !== 'qcm') continue;
			expect(ex.choices).toHaveLength(4);
			expect(new Set(ex.choices).size).toBe(4); // choix distincts
			expect(ex.choices).toContain(ex.answer);
			expect(ex.choicesView).toHaveLength(4); // fractions empilées
			expect(ex.figure?.balisage).toBeTruthy();
			const [n, d] = parse(ex.answer);
			expect([2, 3, 4, 5, 6, 8]).toContain(d);
			expect(n).toBeGreaterThan(d); // strictement impropre (> 1)
			expect(n).toBeLessThan(3 * d); // ≤ 2 unités entières (plafond figure)
			expect(n % d).not.toBe(0); // vraie impropre (partie fractionnaire non nulle)
		}
	});
});

describe('leçon « Je décompose une fraction » (saisie, un terme troué)', () => {
	it('décomposition correcte, réponse entière validée, figure ssi ≤ 2 unités', () => {
		const l = lecon('num-frac-decomposer');
		for (const ex of genereCM1('num-frac-decomposer')) {
			expect(ex.type).toBe('text');
			if (ex.type !== 'text') continue;
			// Énoncé « num/den = … » : num/den en tête (avant stackFractions, appliqué au rendu).
			const m = ex.question.match(/^(\d+)\/(\d+)/)!;
			const num = Number(m[1]);
			const den = Number(m[2]);
			expect([2, 3, 4, 5, 6, 8, 10]).toContain(den);
			expect(num).toBeGreaterThan(den); // impropre
			const entier = Math.floor(num / den);
			const reste = num % den;
			expect(entier).toBeGreaterThanOrEqual(1);
			expect(entier).toBeLessThanOrEqual(6); // partie entière dans les tables
			expect(reste).toBeGreaterThanOrEqual(1); // vraie impropre
			// Trou entier « = @ + r/den » → réponse = entier ; sinon « = e + @/den » → reste.
			const attendue = ex.question.includes('@ +') ? entier : reste;
			expect(Number(ex.answer)).toBe(attendue);
			expect(l.exerciseType.check(ex, String(attendue))).toBe(true);
			expect(l.exerciseType.check(ex, String(attendue + 1))).toBe(false);
			// Appui visuel seulement dans le plafond lisible (≤ 2 unités entières).
			if (entier <= 2) expect(ex.figure?.balisage).toBeTruthy();
			else expect(ex.figure?.balisage).toBeFalsy();
		}
	});

	it('trou au numérateur : champ EMPILÉ à l’écran, case vide à l’impression, révélé en corrigé', () => {
		// Réutilise le rendu « fraction à trou » de #247 (items.ts) : « @/den » → champ dans
		// le numérateur (réponse = un chiffre), pas « @/5 » en ligne.
		const item: Item = { text: '27/5 = 5 + @/5', answer: '2', kind: 'num' };
		const ecran = renderItem(item, createRenderContext());
		expect(ecran.balisage).toContain('frac-num-input');
		expect(ecran.balisage).not.toContain('@/5');
		const impr = renderItem(item, createRenderContext({ printMode: true }));
		expect(impr.balisage).toContain('cloze-box');
		expect(impr.balisage).not.toContain('frac-num-input'); // pas de champ à l'impression
		expect(impr.balisage).not.toContain('@/5');
		const corrige = renderItem(item, createRenderContext({ printMode: true, corrigeMode: true }));
		expect(corrige.balisage).toContain('ans-corrige');
		expect(corrige.balisage).not.toContain('cloze-box');
	});

	it('trou sur l’entier : champ générique noté (le trou n’est PAS dans un numérateur)', () => {
		const item: Item = { text: '27/5 = @ + 2/5', answer: '5', kind: 'num' };
		const ecran = renderItem(item, createRenderContext());
		expect(ecran.balisage).toContain('class="ans'); // champ générique noté
		expect(ecran.balisage).not.toContain('frac-num-input'); // le trou n'est pas au numérateur
		expect(ecran.balisage).not.toContain('@'); // le @ a bien été remplacé par le champ
	});
});

describe('distracteurs impropres (#249) — garantie DURE (balayage exhaustif)', () => {
	it('4 choix distincts sur tout DENS_SUPERIEURE × {1,2} × [1, den-1]', () => {
		for (const den of [2, 3, 4, 5, 6, 8]) {
			for (const entier of [1, 2]) {
				for (let reste = 1; reste < den; reste++) {
					const num = entier * den + reste;
					const ds = distracteursImpropre(num, den);
					expect(ds.length).toBeGreaterThanOrEqual(3);
					// Réponse + 3 distracteurs → au moins 4 valeurs distinctes garanties.
					expect(new Set([`${num}/${den}`, ...ds]).size).toBeGreaterThanOrEqual(4);
				}
			}
		}
	});
});

describe('leçon « Encadrer une fraction » (QCM, demi-droite)', () => {
	it('bornes consécutives correctes, 4 choix texte distincts, figure, pas de vue riche', () => {
		for (const ex of genereCM1('num-frac-encadrer')) {
			expect(ex.type).toBe('qcm');
			if (ex.type !== 'qcm') continue;
			expect(ex.choices).toHaveLength(4);
			expect(new Set(ex.choices).size).toBe(4); // choix distincts
			expect(ex.choices).toContain(ex.answer);
			expect(ex.choicesView).toBeUndefined(); // choix texte « entre X et Y »
			expect(ex.figure?.balisage).toBeTruthy();
			const [num, den] = parse(ex.question.match(/(\d+)\/(\d+)/)![0]);
			expect(num).toBeGreaterThan(den); // impropre (> 1)
			expect(num).toBeLessThan(3 * den); // dans (1,3) → demi-droite 0→3
			const bas = Math.floor(num / den);
			expect(ex.answer).toBe(`entre ${bas} et ${bas + 1}`); // encadrement exact
		}
	});
});

describe('figures « fractions ≥ 1 » (#249)', () => {
	it('renderFractionSuperieure : (entier+1) barres de `den` parts, `num` parts coloriées', () => {
		for (const [num, den] of [
			[3, 2], // 1 + 1/2 → 2 barres
			[7, 3], // 2 + 1/3 → 3 barres
			[11, 4], // 2 + 3/4 → 3 barres
		]) {
			const svg = renderFractionSuperieure(num, den);
			const entier = Math.floor(num / den);
			const rects = [...svg.matchAll(/<rect/g)];
			expect(rects).toHaveLength((entier + 1) * den); // toutes les parts de toutes les barres
			const widths = [...svg.matchAll(/<rect[^>]*\bwidth="([\d.]+)"/g)].map((m) => m[1]);
			expect(new Set(widths).size).toBe(1); // parts STRICTEMENT égales (largeur = W/den)
			const points = [...svg.matchAll(/<circle/g)];
			expect(points).toHaveLength(num); // un point plein par part coloriée = numérateur
		}
	});

	it('renderFractionDemiDroite : bornes entières 0..N numérotées, repère présent', () => {
		const svg = renderFractionDemiDroite(7, 3, 3); // 7/3 sur une demi-droite 0→3
		const labels = [...svg.matchAll(/<text[^>]*>(\d+)<\/text>/g)].map((m) => m[1]);
		expect(labels).toEqual(['0', '1', '2', '3']); // bornes entières numérotées
		expect(svg).toContain('var(--clock-min)'); // repère corail présent
		expect(svg).toContain('Demi-droite graduée');
	});

	it('renderFractionBande (CE2) inchangée : bornes 0 et 1 seulement', () => {
		const svg = renderFractionBande(1, 4);
		const labels = [...svg.matchAll(/<text[^>]*>(\d+)<\/text>/g)].map((m) => m[1]);
		expect(labels).toEqual(['0', '1']); // span 0→1 : deux bornes
		expect(svg).toContain('Bande graduée');
	});
});
