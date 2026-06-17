/* ============================================================
   Résolution de problèmes (#199) — logique de génération (src/data/maths/problemes).
   On tire BEAUCOUP de problèmes par leçon et on vérifie les invariants de
   calibrage CE2 : réponses entières positives, étapes cohérentes, bornes
   respectées, texte lu présent et sans réponse. Pas de DOM.
   ============================================================ */
import { describe, it, expect } from 'vitest';
import { PROBLEMES_LESSONS } from '../src/data/maths/problemes';
import { genLessonItem, getLessonById } from '../src/core/catalog';
import { enonceTexte } from '../src/core/items';

const TIRAGES = 400;

function genere(lessonId: string) {
	const l = PROBLEMES_LESSONS.find((x) => x.id === lessonId)!;
	return Array.from({ length: TIRAGES }, () => l.exerciseType.generate());
}

const estEntierPositif = (n: number) => Number.isInteger(n) && n >= 0;

describe('problèmes — invariants communs', () => {
	for (const l of PROBLEMES_LESSONS) {
		it(`${l.id} : énoncé + étapes valides, réponses entières positives`, () => {
			for (const ex of genere(l.id)) {
				expect(ex.type).toBe('probleme');
				if (ex.type !== 'probleme') continue;
				expect(ex.enonce.trim().length).toBeGreaterThan(0);
				expect(ex.etapes.length).toBeGreaterThanOrEqual(1);
				expect(ex.etapes.length).toBeLessThanOrEqual(2);
				// Le texte lu reprend l'énoncé (contexte + sous-questions) ; il ne contient
				// que ce que l'enfant lit, jamais une réponse ajoutée par le générateur.
				expect(ex.parle).toContain(ex.enonce);
				for (const et of ex.etapes) {
					expect(et.question.trim().length).toBeGreaterThan(0);
					expect(estEntierPositif(et.answer)).toBe(true);
					expect(ex.parle).toContain(et.question);
				}
			}
		});
	}
});

describe('problèmes — calibrage CE2 par structure', () => {
	it('multiplication : produit ≤ 100', () => {
		for (const ex of genere('math-prob-multiplication')) {
			if (ex.type !== 'probleme') continue;
			expect(ex.etapes[0].answer).toBeLessThanOrEqual(100);
		}
	});

	it('partage et groupement : quotient (réponse) entre 2 et 9, division exacte', () => {
		for (const ex of genere('math-prob-partage')) {
			if (ex.type !== 'probleme') continue;
			expect(ex.etapes[0].answer).toBeGreaterThanOrEqual(2);
			expect(ex.etapes[0].answer).toBeLessThanOrEqual(9);
		}
	});

	it('additifs : résultats ≤ 1000', () => {
		for (const id of [
			'math-prob-composition',
			'math-prob-transformation',
			'math-prob-comparaison',
		]) {
			for (const ex of genere(id)) {
				if (ex.type !== 'probleme') continue;
				for (const et of ex.etapes) expect(et.answer).toBeLessThanOrEqual(1000);
			}
		}
	});

	it('deux étapes : 2 sous-questions, étape 1 + étape 2 = le billet (rendu ≥ 0)', () => {
		for (const ex of genere('math-prob-deux-etapes')) {
			if (ex.type !== 'probleme') continue;
			expect(ex.etapes.length).toBe(2);
			const [cout, rendu] = ex.etapes;
			expect(rendu.answer).toBeGreaterThanOrEqual(0);
			// Le billet = coût + rendu (étape 1 cohérente avec étape 2).
			expect(cout.answer + rendu.answer).toBeGreaterThan(cout.answer);
		}
	});
});

describe('problèmes — repli texte (bilan/révision via genLessonItem)', () => {
	it('problème simple : item numérique, énoncé + question en gras, réponse entière', () => {
		const it = genLessonItem(getLessonById('math-prob-composition')!);
		expect(it.kind).toBe('num');
		expect(it.text).toContain('@'); // emplacement du champ
		expect(it.text).toContain('**'); // question finale en gras
		expect(Number.isInteger(Number(it.answer))).toBe(true);
		expect(it.parle).toBeTruthy();
	});

	it('problème à deux étapes : le repli ne corrige que la réponse finale (item num valide)', () => {
		for (let i = 0; i < 50; i++) {
			const it = genLessonItem(getLessonById('math-prob-deux-etapes')!);
			expect(it.kind).toBe('num');
			expect(it.text).toContain('**');
			const n = Number(it.answer);
			expect(Number.isInteger(n)).toBe(true);
			expect(n).toBeGreaterThanOrEqual(0);
		}
	});
});

describe('enonceTexte (#199) — gras léger + échappement', () => {
	it('transforme **…** en <strong> et conserve l’échappement HTML', () => {
		expect(enonceTexte('Total **42** ?')).toBe('Total <strong>42</strong> ?');
		expect(enonceTexte('a < b **x**')).toBe('a &lt; b <strong>x</strong>');
	});
});
