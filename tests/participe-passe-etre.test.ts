/* ============================================================
   Accord du participe passé avec « être » (#205) — logique de génération
   (src/data/francais/participe-passe-etre). On tire beaucoup d'items et on
   vérifie les invariants : QCM 3 vraies formes du MÊME verbe, jamais
   l'auxiliaire « avoir », terminaison surlignée alignée, explication de la
   règle, sujet en gras, pas de TTS. Pas de DOM.
   ============================================================ */
import { describe, it, expect } from 'vitest';
import {
	PARTICIPE_LESSONS,
	VERBES,
	forme,
	type Forme,
} from '../src/data/francais/participe-passe-etre';
import { genLessonItem, getLessonById, getLessonsByCategory } from '../src/core/catalog';

const TIRAGES = 600;
const LECON = PARTICIPE_LESSONS[0];
const FORMES: Forme[] = ['ms', 'fs', 'mp', 'fp'];

function tirages() {
	return Array.from({ length: TIRAGES }, () => LECON.exerciseType.generate('qcm'));
}

/* Le verbe (unique) dont une des 4 formes vaut `f` — les radicaux sont distincts. */
function verbeDeForme(f: string) {
	return VERBES.find((v) => FORMES.some((g) => forme(v, g) === f));
}
/* Le genre/nombre d'une forme pour un verbe donné. */
function formeType(verbe: (typeof VERBES)[number], f: string): Forme | undefined {
	return FORMES.find((g) => forme(verbe, g) === f);
}

describe('génération — invariants du QCM', () => {
	it('QCM à 3 options distinctes, empilées, sans TTS, réponse parmi les choix', () => {
		for (const ex of tirages()) {
			expect(ex.type).toBe('qcm');
			if (ex.type !== 'qcm') continue;
			expect(ex.choices).toHaveLength(3);
			expect(new Set(ex.choices).size).toBe(3);
			expect(ex.choices).toContain(ex.answer);
			expect(ex.choicesEmpilees).toBe(true);
			expect(ex.parle).toBe(''); // formes homophones → pas de bouton « Écouter »
		}
	});

	it('phrase de transformation : sujet en gras, trou, auxiliaire « être » (jamais « avoir »)', () => {
		for (const ex of tirages()) {
			if (ex.type !== 'qcm') continue;
			expect(ex.question).toContain('@'); // emplacement du QCM
			expect(ex.question).toContain('→'); // transformation guidée
			// Sujet cible en gras (**…**), rendu par enonceTexte.
			expect(ex.question).toMatch(/\*\*(Elle|Ils|Elles)\*\*/);
			// Auxiliaire être présent, avoir absent.
			expect(ex.question).toMatch(/\b(est|sont)\b/);
			expect(ex.question).not.toMatch(/\b(a|ont|avait|avaient)\b/);
		}
	});

	it('la forme source (à gauche de la flèche) est cohérente avec le sujet source', () => {
		// Garde-fou contre une erreur future dans la table PATRONS : « Il est <ms> »,
		// « Elle est <fs> » — jamais une source déjà accordée autrement.
		for (const ex of tirages()) {
			if (ex.type !== 'qcm') continue;
			// Le participe est le 1er mot après « est » (suivi d'un point OU d'un complément).
			const m = ex.question.match(/^(Il|Elle) est (\S+?)(?:\.| )/);
			expect(m).not.toBeNull();
			const [, sujet, source] = m!;
			const v = verbeDeForme(source)!;
			expect(formeType(v, source)).toBe(sujet === 'Il' ? 'ms' : 'fs');
		}
	});

	it('les 3 options sont de VRAIES formes du même verbe (jamais une forme inventée)', () => {
		for (const ex of tirages()) {
			if (ex.type !== 'qcm') continue;
			const v = verbeDeForme(ex.answer);
			expect(v).toBeDefined();
			const valides = new Set(FORMES.map((g) => forme(v!, g)));
			for (const c of ex.choices) expect(valides.has(c)).toBe(true);
		}
	});

	it('terminaison surlignée alignée sur chaque option (choicesView)', () => {
		for (const ex of tirages()) {
			if (ex.type !== 'qcm') continue;
			expect(ex.choicesView).toBeDefined();
			expect(ex.choicesView).toHaveLength(ex.choices.length);
			ex.choices.forEach((c, i) => {
				const view = ex.choicesView![i];
				expect(view.label).toBe(c); // libellé parlé = forme nue
				expect(view.html).toContain('<span class="term">'); // terminaison surlignée
				const v = verbeDeForme(c)!;
				expect(view.html.startsWith(v.base)).toBe(true); // radical avant la marque
			});
		}
	});

	it("l'explication rappelle la règle d'accord avec « être » et cite la réponse", () => {
		for (const ex of tirages()) {
			if (ex.type !== 'qcm') continue;
			expect(ex.explication).toMatch(/accorde/);
			expect(ex.explication).toContain('être');
			expect(ex.explication).toContain(ex.answer);
		}
	});
});

describe('couverture des 4 patrons', () => {
	it('les cibles atteignent le féminin sing., le masculin plur. ET le féminin plur.', () => {
		const ciblesVues = new Set<Forme>();
		const sujetsCible = new Set<string>();
		for (const ex of tirages()) {
			if (ex.type !== 'qcm') continue;
			const v = verbeDeForme(ex.answer)!;
			const t = formeType(v, ex.answer)!;
			ciblesVues.add(t);
			const m = ex.question.match(/\*\*(Elle|Ils|Elles)\*\*/);
			if (m) sujetsCible.add(m[1]);
		}
		// fs (il→elle), mp (il→ils), fp (elle→elles ET il→elles) ; jamais ms en cible.
		expect(ciblesVues.has('fs')).toBe(true);
		expect(ciblesVues.has('mp')).toBe(true);
		expect(ciblesVues.has('fp')).toBe(true);
		expect(ciblesVues.has('ms')).toBe(false);
		expect(sujetsCible).toEqual(new Set(['Elle', 'Ils', 'Elles']));
	});
});

describe('check — correction', () => {
	it('valide la forme accordée, refuse une autre vraie forme du verbe', () => {
		for (const ex of tirages()) {
			if (ex.type !== 'qcm') continue;
			expect(LECON.exerciseType.check(ex, ex.answer)).toBe(true);
			const autre = ex.choices.find((c) => c !== ex.answer)!;
			expect(LECON.exerciseType.check(ex, autre)).toBe(false);
		}
	});
});

describe('intégration catalogue', () => {
	it('leçon dans Orthographe, rubrique « Les accords », exclue du sprint et signalée « plus dur »', () => {
		const def = getLessonById('fr-accords-participe-etre');
		expect(def).toBeDefined();
		expect(def!.category).toBe('fr-orthographe');
		expect(def!.rubrique).toBe('Les accords');
		expect(def!.excludeFromSprint).toBe(true);
		expect(def!.repere).toBe('plus-difficile');
		// Bien rattachée à la catégorie Orthographe.
		expect(getLessonsByCategory('fr-orthographe').some((l) => l.id === def!.id)).toBe(true);
	});

	it('repli fiche/bilan : item texte (sujet en gras conservé), sans TTS', () => {
		const item = genLessonItem(getLessonById('fr-accords-participe-etre')!);
		expect(item.kind).toBe('text');
		expect(String(item.text)).toContain('**'); // gras du sujet conservé pour enonceTexte
		expect(item.parle).toBe(''); // pas de TTS en fiche non plus
		expect(String(item.answer).length).toBeGreaterThan(0);
	});
});
