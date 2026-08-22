/* ============================================================
   Accord dans le groupe nominal (#243, CM1) — logique de génération
   (src/data/francais/accord-groupe-nominal). QCM rigoureux : la bonne réponse est
   le groupe ENTIÈREMENT accordé, chaque distracteur casse EXACTEMENT UNE marque,
   tous les tokens sont des formes STOCKÉES réelles, et le surlignage `.term` est
   cohérent sur tous les choix. Pas de DOM.
   ============================================================ */
import { describe, it, expect } from 'vitest';
import {
	ACCORD_GN_LESSONS,
	GROUPES_NOMINAUX,
	genItem,
	type GroupeNominal,
} from '../src/data/francais/accord-groupe-nominal';
import { genLessonItem, getLessonById, getLessonsByCategory } from '../src/core/catalog';
import { ORDRE_LECONS } from '../src/data/ordre-pedagogique';

const LECON = ACCORD_GN_LESSONS[0];
const TIRAGES = 1500;

/* Toutes les formes RÉELLES stockées (départ + cible de chaque constituant). */
const FORMES_REELLES = new Set<string>(
	GROUPES_NOMINAUX.flatMap((g) => g.constituants.flatMap((c) => [c.depart, c.cible])),
);

/* Le groupe dont la bonne réponse (tous accordés) vaut `valeur`. Les valeurs sont
   distinctes d'un groupe à l'autre dans la banque. */
function groupeDeReponse(valeur: string): GroupeNominal | undefined {
	return GROUPES_NOMINAUX.find((g) => g.constituants.map((c) => c.cible).join(' ') === valeur);
}

/* Décompose un groupe affiché (valeur nue) en tokens. */
const tokens = (v: string): string[] => v.split(' ');

describe('banque GN — bornes structurelles', () => {
	it('2 ou 3 constituants, déterminant en tête, toutes les formes distinctes par sens', () => {
		for (const g of GROUPES_NOMINAUX) {
			expect(g.constituants.length).toBeGreaterThanOrEqual(2);
			expect(g.constituants.length).toBeLessThanOrEqual(3);
			expect(g.constituants[0].marque).toBe('mot'); // déterminant
			// Chaque constituant VARIE réellement (départ ≠ cible) : sinon « une marque
			// cassée » serait invisible.
			for (const c of g.constituants) expect(c.depart).not.toBe(c.cible);
		}
	});

	it('couvre des items à 2 ET à 3 marques, pluriel ET féminin', () => {
		const tailles = new Set(GROUPES_NOMINAUX.map((g) => g.constituants.length));
		expect(tailles.has(2)).toBe(true);
		expect(tailles.has(3)).toBe(true);
		const sens = new Set(GROUPES_NOMINAUX.map((g) => g.sens));
		expect(sens.has('pluriel')).toBe(true);
		expect(sens.has('feminin')).toBe(true);
	});

	it('chaque forme stockée est une vraie forme orthographiée (pas de chaîne mal accordée)', () => {
		// On vérifie en particulier le pluriel indéfini « un/une … → de … » (forme stockée).
		const deGrandesMaisons = GROUPES_NOMINAUX.find((g) => g.id === 'une-grande-maison')!;
		expect(deGrandesMaisons.constituants.map((c) => c.cible)).toEqual(['de', 'grandes', 'maisons']);
	});
});

describe('génération GN — invariants du QCM', () => {
	it('3 choix distincts, empilés, sans TTS, réponse incluse, consigne d’action', () => {
		for (let i = 0; i < TIRAGES; i++) {
			const ex = genItem();
			expect(ex.type).toBe('qcm');
			if (ex.type !== 'qcm') continue;
			expect(ex.choices).toHaveLength(3);
			expect(new Set(ex.choices).size).toBe(3); // distincts
			expect(ex.choices).toContain(ex.answer);
			expect(ex.choicesEmpilees).toBe(true);
			expect(ex.parle).toBe('');
			expect(ex.consigne === 'Mets au pluriel.' || ex.consigne === 'Mets au féminin.').toBe(true);
			expect(ex.question).toContain('→');
			expect(ex.question).toContain('@');
		}
	});

	it('la bonne réponse est le groupe ENTIÈREMENT accordé', () => {
		for (let i = 0; i < TIRAGES; i++) {
			const ex = genItem();
			if (ex.type !== 'qcm') continue;
			const g = groupeDeReponse(ex.answer);
			expect(g, ex.answer).toBeDefined();
			// = tous les constituants à leur forme cible.
			expect(ex.answer).toBe(g!.constituants.map((c) => c.cible).join(' '));
		}
	});

	it('CHAQUE distracteur casse EXACTEMENT UNE marque (un constituant resté au départ)', () => {
		for (let i = 0; i < TIRAGES; i++) {
			const ex = genItem();
			if (ex.type !== 'qcm') continue;
			const g = groupeDeReponse(ex.answer)!;
			const cibles = g.constituants.map((c) => c.cible);
			const departs = g.constituants.map((c) => c.depart);
			for (const choix of ex.choices) {
				if (choix === ex.answer) continue;
				const toks = tokens(choix);
				expect(toks).toHaveLength(g.constituants.length);
				// Compte les constituants NON accordés (égaux à la forme de départ).
				let casses = 0;
				toks.forEach((t, k) => {
					if (t === departs[k]) casses++;
					else expect(t).toBe(cibles[k]); // sinon, c'est la forme cible (jamais autre chose)
				});
				expect(casses).toBe(1); // exactement une marque cassée
			}
		}
	});

	it('tous les tokens de tous les choix sont des formes RÉELLES stockées', () => {
		for (let i = 0; i < TIRAGES; i++) {
			const ex = genItem();
			if (ex.type !== 'qcm') continue;
			for (const choix of ex.choices) {
				for (const t of tokens(choix)) expect(FORMES_REELLES.has(t)).toBe(true);
			}
		}
	});

	it('les 2 distracteurs cassent des marques DIFFÉRENTES (variété)', () => {
		for (let i = 0; i < TIRAGES; i++) {
			const ex = genItem();
			if (ex.type !== 'qcm') continue;
			const g = groupeDeReponse(ex.answer)!;
			const departs = g.constituants.map((c) => c.depart);
			const indicesCasses = ex.choices
				.filter((c) => c !== ex.answer)
				.map((choix) => tokens(choix).findIndex((t, k) => t === departs[k]));
			// 2 distracteurs, chacun casse un constituant DIFFÉRENT.
			expect(new Set(indicesCasses).size).toBe(2);
		}
	});
});

describe('génération GN — surlignage .term cohérent', () => {
	it('chaque choix a une vue alignée ; .term sur CHAQUE constituant, label = forme nue', () => {
		for (let i = 0; i < 800; i++) {
			const ex = genItem();
			if (ex.type !== 'qcm') continue;
			const g = groupeDeReponse(ex.answer)!;
			expect(ex.choicesView).toBeDefined();
			expect(ex.choicesView).toHaveLength(ex.choices.length);
			ex.choices.forEach((c, k) => {
				const view = ex.choicesView![k];
				expect(view.label).toBe(c); // libellé parlé = forme nue
				// Un span .term par constituant (déterminant, [adjectif], nom) — surlignage
				// UNIFORME quel que soit le choix (un suffixe vide reste un span vide).
				const nbTerm = (view.html.balisage.match(/<span class="term">/g) ?? []).length;
				expect(nbTerm).toBe(g.constituants.length);
			});
		}
	});

	it('la marque surlignée n’est pas un indice : les distracteurs ont AUSSI des .term', () => {
		// Garde-fou anti-triche : si seul le bon choix portait un suffixe non vide, le
		// surlignage trahirait. On vérifie qu'un distracteur (constituant non accordé)
		// garde bien un span .term (éventuellement vide) sur ce constituant.
		for (let i = 0; i < 800; i++) {
			const ex = genItem();
			if (ex.type !== 'qcm') continue;
			ex.choices.forEach((c, k) => {
				if (c === ex.answer) return;
				const view = ex.choicesView![k];
				const nbTerm = (view.html.balisage.match(/<span class="term">/g) ?? []).length;
				expect(nbTerm).toBe(tokens(c).length);
			});
		}
	});
});

describe('check — correction', () => {
	it('valide le groupe accordé, refuse un distracteur', () => {
		for (let i = 0; i < 400; i++) {
			const ex = genItem();
			if (ex.type !== 'qcm') continue;
			expect(LECON.exerciseType.check(ex, ex.answer)).toBe(true);
			const autre = ex.choices.find((c) => c !== ex.answer)!;
			expect(LECON.exerciseType.check(ex, autre)).toBe(false);
		}
	});
});

describe('intégration catalogue — leçon GN', () => {
	it('fr-accords-groupe-nominal : Orthographe, « Les accords », CM1, hors sprint, « plus dur »', () => {
		const def = getLessonById('fr-accords-groupe-nominal');
		expect(def).toBeDefined();
		expect(def!.category).toBe('fr-orthographe');
		expect(def!.rubrique).toBe('Les accords');
		expect(def!.levels).toEqual(['cm1']);
		expect(def!.excludeFromSprint).toBe(true);
		expect(def!.repere).toBe('plus-difficile');
		expect(def!.label).toBe('Accorder tout le groupe');
		expect(getLessonsByCategory('fr-orthographe').some((l) => l.id === def!.id)).toBe(true);
	});

	it('insérée dans l’ordre pédagogique français CM1 (après fr-accords-cm1)', () => {
		const ordre = ORDRE_LECONS.francais.cm1!;
		expect(ordre).toContain('fr-accords-groupe-nominal');
		expect(ordre.indexOf('fr-accords-groupe-nominal')).toBeGreaterThan(
			ordre.indexOf('fr-accords-cm1'),
		);
	});

	it('repli fiche/bilan : item texte QCM, sans TTS, réponse non vide', () => {
		const item = genLessonItem(getLessonById('fr-accords-groupe-nominal')!);
		expect(item.kind).toBe('text');
		expect(item.parle).toBe('');
		expect(String(item.answer).length).toBeGreaterThan(0);
	});
});
