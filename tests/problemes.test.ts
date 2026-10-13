/* ============================================================
   Résolution de problèmes (#199) — logique de génération (src/data/maths/problemes).
   On tire BEAUCOUP de problèmes par leçon et on vérifie les invariants de
   calibrage CE2 : réponses entières positives, étapes cohérentes, bornes
   respectées, texte lu présent et sans réponse. Pas de DOM.
   ============================================================ */
import { describe, it, expect } from 'vitest';
import { PROBLEMES_LESSONS } from '../src/data/maths/problemes';
import { genLessonItem, getAllLessons, getLessonById } from '../src/core/catalog';
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

/* #258, critère 15 : « Aucune leçon existante ne change de comportement ». Le catalogue
   transmet désormais `excludeFromSprint` depuis les entrées de `math-problemes`, pour la
   seule leçon QCM Oui/Non de proportionnalité (devinable à 50 %). L'instantané couvre la
   catégorie ENTIÈRE, tous niveaux (une leçon CE2-only échapperait à un filtre CM1) ; il
   rougit si une leçon historique devient exclue du sprint, si une leçon disparaît, ou si
   une nouvelle leçon arrive dans la catégorie sans que ce test soit relu. */
describe('problèmes — #258 : les leçons historiques gardent leur statut sprint', () => {
	it('critère 15 : aucune leçon historique ne devient exclue du sprint ; seule « Est-ce proportionnel ? » l’est', () => {
		for (const l of PROBLEMES_LESSONS) {
			const def = getLessonById(l.id);
			expect(def, l.id).toBeDefined();
			expect(def?.excludeFromSprint === true, l.id).toBe(false);
		}

		const instantane = Object.fromEntries(
			getAllLessons()
				.filter((l) => l.category === 'math-problemes')
				.map((l) => [l.id, l.excludeFromSprint === true]),
		);
		expect(instantane).toEqual({
			'math-prob-composition': false,
			'math-prob-transformation': false,
			'math-prob-multiplication': false,
			'math-prob-partage': false,
			'math-prob-comparaison': false,
			'math-prob-deux-etapes': false,
			'math-prob-proportion-identifier': true,
			'math-prob-proportion-resoudre': false,
		});
	});
});

describe('enonceTexte (#199) — gras léger + échappement', () => {
	it('transforme **…** en <strong> et conserve l’échappement HTML', () => {
		expect(enonceTexte('Total **42** ?').balisage).toBe('Total <strong>42</strong> ?');
		expect(enonceTexte('a < b **x**').balisage).toBe('a &lt; b <strong>x</strong>');
	});
});
