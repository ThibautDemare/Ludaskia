/* ============================================================
   Les phrases (#204) — logique des deux leçons de grammaire
   (src/data/francais/phrases). Pas de DOM.
   - F1 « Quel point à la fin ? » : banque sans ambiguïté (chaque phrase porte un
     marqueur explicite), génération en QCM variante 'ponctuation'.
   - F2 « Quel type de phrase ? » : banque équilibrée, mélange VOULU point ≠ type
     (impératif au point, déclaratif au « ! ») pour éviter la trivialité.
   ============================================================ */
import { describe, it, expect } from 'vitest';
import {
	PHRASES_PONCT,
	PHRASES_TYPE,
	TYPE_LABELS,
	ponctuationType,
	typePhraseType,
} from '../src/data/francais/phrases';
import { PONCT_MOTS, ponctView } from '../src/ui/ponctuation-view';

const TIRAGES = 400;

// Marqueurs interrogatifs : mot interrogatif EN TÊTE (suivi d'une espace/fin —
// on n'utilise pas \b qui, en JS ASCII, casse après l'accent de « où »), ou
// inversion verbe-sujet (trait d'union + pronom).
const INTERRO = /^(est-ce que|où|quand|pourquoi|comment|qui|combien)(\s|$)/i;
const INVERSION = /-(tu|on|il|elle|nous|vous|ils|elles)\b/i;
// Marqueurs exclamatifs lexicaux / interjections.
const EXCLAM = /^(quel|quelle|quels|quelles|comme|bravo|attention|aïe|oh|ah|hourra)\b/i;

describe('F1 — banque « Quel point à la fin ? »', () => {
	it('au moins 15 items, point valide, phrase non vide, sans doublon', () => {
		expect(PHRASES_PONCT.length).toBeGreaterThanOrEqual(15);
		const vus = new Set<string>();
		for (const p of PHRASES_PONCT) {
			expect(['.', '?', '!']).toContain(p.point);
			expect(p.phrase.trim().length).toBeGreaterThan(0);
			expect(p.explication.trim().length).toBeGreaterThan(0);
			expect(vus.has(p.phrase)).toBe(false); // pas de phrase répétée
			vus.add(p.phrase);
		}
	});

	it('chaque « ? » porte un marqueur interrogatif explicite (mot ou inversion)', () => {
		for (const p of PHRASES_PONCT.filter((x) => x.point === '?')) {
			expect(INTERRO.test(p.phrase) || INVERSION.test(p.phrase)).toBe(true);
		}
	});

	it('chaque « ! » porte un marqueur exclamatif explicite', () => {
		for (const p of PHRASES_PONCT.filter((x) => x.point === '!')) {
			expect(EXCLAM.test(p.phrase)).toBe(true);
		}
	});

	it('chaque « . » est neutre : aucun marqueur (anti-ambiguïté)', () => {
		for (const p of PHRASES_PONCT.filter((x) => x.point === '.')) {
			expect(INTERRO.test(p.phrase)).toBe(false);
			expect(INVERSION.test(p.phrase)).toBe(false);
			expect(EXCLAM.test(p.phrase)).toBe(false);
		}
	});

	it('les trois ponctuations sont représentées (au moins 5 chacune)', () => {
		for (const sig of ['.', '?', '!'] as const) {
			expect(PHRASES_PONCT.filter((p) => p.point === sig).length).toBeGreaterThanOrEqual(5);
		}
	});

	it('explications : citent un marqueur, jamais l’intonation', () => {
		for (const p of PHRASES_PONCT) {
			expect(/intonation|on entend|ça monte|la voix/i.test(p.explication)).toBe(false);
		}
	});
});

describe('F1 — génération (variante ponctuation)', () => {
	const type = ponctuationType();
	it('produit un QCM variante=ponctuation, choix « . ? ! » fixes, réponse cohérente', () => {
		for (let i = 0; i < TIRAGES; i++) {
			const ex = type.generate();
			if (ex.type !== 'qcm') throw new Error('attendu qcm');
			expect(ex.variante).toBe('ponctuation');
			expect(ex.choices).toEqual(['.', '?', '!']); // ordre stable (palette)
			expect(ex.choices).toContain(ex.answer);
			expect(ex.question.endsWith('@')).toBe(true); // le trou est en fin
			// check() : juste pour la bonne réponse, faux pour les autres signes.
			expect(type.check(ex, ex.answer)).toBe(true);
			for (const autre of ['.', '?', '!'].filter((c) => c !== ex.answer)) {
				expect(type.check(ex, autre)).toBe(false);
			}
		}
	});
});

describe('F2 — banque « Quel type de phrase ? »', () => {
	const TYPES = ['declaratif', 'interrogatif', 'imperatif'] as const;

	it('au moins 15 items, type valide, phrase ponctuée, sans doublon', () => {
		expect(PHRASES_TYPE.length).toBeGreaterThanOrEqual(15);
		const vus = new Set<string>();
		for (const p of PHRASES_TYPE) {
			expect(TYPES as readonly string[]).toContain(p.type);
			expect(/[.?!]$/.test(p.phrase)).toBe(true); // phrase complète, ponctuée
			expect(p.explication.trim().length).toBeGreaterThan(0);
			expect(vus.has(p.phrase)).toBe(false);
			vus.add(p.phrase);
		}
	});

	it('les trois types sont représentés (au moins 5 chacun)', () => {
		for (const t of TYPES) {
			expect(PHRASES_TYPE.filter((p) => p.type === t).length).toBeGreaterThanOrEqual(5);
		}
	});

	it('mélange anti-trivialité : un déclaratif au « ! » ET un impératif au « . »', () => {
		expect(PHRASES_TYPE.some((p) => p.type === 'declaratif' && p.phrase.endsWith('!'))).toBe(true);
		expect(PHRASES_TYPE.some((p) => p.type === 'imperatif' && p.phrase.endsWith('.'))).toBe(true);
	});

	it('explications : citent le sens, jamais l’intonation', () => {
		for (const p of PHRASES_TYPE) {
			expect(/intonation|on entend|ça monte|la voix/i.test(p.explication)).toBe(false);
		}
	});
});

describe('F2 — génération (QCM texte)', () => {
	const type = typePhraseType();
	const LABELS = Object.values(TYPE_LABELS);

	it('propose les 3 libellés enfant (jamais « exclamatif »), réponse cohérente', () => {
		for (let i = 0; i < TIRAGES; i++) {
			const ex = type.generate();
			if (ex.type !== 'qcm') throw new Error('attendu qcm');
			expect([...ex.choices].sort()).toEqual([...LABELS].sort()); // les 3 libellés, mélangés
			expect(ex.consigne).toBe('Que fait cette phrase ?'); // consigne d'action visible (#265)
			expect(ex.choices).toContain(ex.answer);
			expect(LABELS).toContain(ex.answer);
			expect(ex.choices.join(' ')).not.toMatch(/exclamati/i); // l'exclamative n'est pas un type
			expect(type.check(ex, ex.answer)).toBe(true);
			for (const autre of LABELS.filter((l) => l !== ex.answer)) {
				expect(type.check(ex, autre)).toBe(false);
			}
		}
	});
});

describe('Présentation des signes (ponctuation-view, partagée runner/révision)', () => {
	it('PONCT_MOTS nomme les trois signes', () => {
		expect(PONCT_MOTS['.']).toBe('point');
		expect(PONCT_MOTS['?']).toBe("point d'interrogation");
		expect(PONCT_MOTS['!']).toBe("point d'exclamation");
	});

	it('ponctView : glyphe + mot, label = mot, point grossi', () => {
		const v = ponctView('!');
		expect(v.label).toBe("point d'exclamation");
		expect(v.html).toContain('lqcm-sym-glyph');
		expect(v.html).toContain("point d'exclamation");
		expect(v.html).toContain('!');
		// Le point reçoit la classe modificatrice (grossi) ; pas les autres.
		expect(ponctView('.').html).toContain('lqcm-sym-glyph--point');
		expect(ponctView('?').html).not.toContain('lqcm-sym-glyph--point');
	});
});
