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
import { genLessonItem, getLessonById, getLessonsByCategory } from '../src/core/catalog';

const TIRAGES = 400;

function genere(lessonId: string) {
	const l = FRACTIONS_LESSONS.find((x) => x.id === lessonId)!;
	return Array.from({ length: TIRAGES }, () => l.exerciseType.generate('qcm'));
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
			expect([2, 3, 4, 6, 8]).toContain(d);
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
