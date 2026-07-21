/* ============================================================
   Helpers de `src/core/utils.ts` — logique pure.
   ============================================================ */
import { describe, it, expect } from 'vitest';
import { elisionDe } from '../src/core/utils';

/* Règle « tranchée une fois, testée une fois » : l'élision de « de » → « d' » est un helper
   PARTAGÉ (données, géométrie…). Attendus dérivés de la règle linguistique (élision devant
   une voyelle), et du comportement RÉEL du helper là où la règle française est plus large. */
describe('elisionDe', () => {
	it("initiale vocalique simple (a/e/i/o/u) → « d'… »", () => {
		expect(elisionDe('avions')).toBe("d'avions");
		expect(elisionDe('escargots')).toBe("d'escargots");
		expect(elisionDe('images')).toBe("d'images");
		expect(elisionDe('oranges')).toBe("d'oranges");
		expect(elisionDe('unités')).toBe("d'unités");
	});

	it("initiale vocalique ACCENTUÉE (é/è/ê/â/î) → « d'… »", () => {
		expect(elisionDe('élèves')).toBe("d'élèves");
		expect(elisionDe('êtres')).toBe("d'êtres");
		expect(elisionDe('ânes')).toBe("d'ânes");
		expect(elisionDe('îles')).toBe("d'îles");
		expect(elisionDe('arêtes')).toBe("d'arêtes");
	});

	it('initiale consonantique → « de … »', () => {
		expect(elisionDe('billes')).toBe('de billes');
		expect(elisionDe('cartes')).toBe('de cartes');
		expect(elisionDe('crabes')).toBe('de crabes');
		expect(elisionDe('bandes dessinées')).toBe('de bandes dessinées');
	});

	it("« y » n'est PAS élidé (semi-voyelle, traitée comme consonantique) → « de … »", () => {
		expect(elisionDe('yaourts')).toBe('de yaourts');
		expect(elisionDe('yeux')).toBe('de yeux');
	});

	it("« h » n'est PAS élidé (choix assumé : aspiré/muet ambigu) → « de … »", () => {
		expect(elisionDe('hiboux')).toBe('de hiboux');
		expect(elisionDe('haricots')).toBe('de haricots');
	});

	it('MAJUSCULE initiale : le flag `i` de la regex élide aussi une voyelle capitale', () => {
		// Comportement RÉEL verrouillé. En usage courant, les objets des banques sont en
		// minuscules → ce chemin est dormant, mais le helper est désormais général.
		expect(elisionDe('Images')).toBe("d'Images");
		expect(elisionDe('Oranges')).toBe("d'Oranges");
		expect(elisionDe('Billes')).toBe('de Billes');
	});

	it("ligatures « œ » / « æ » : élidées → « d'… » (forme française correcte)", () => {
		// La classe inclut désormais œ (U+0153) et æ (U+00E6) : « d'œufs », « d'ægagropiles ».
		expect(elisionDe('œufs')).toBe("d'œufs");
		expect(elisionDe('ægagropiles')).toBe("d'ægagropiles");
	});
});
