/* ============================================================
   Helpers de `src/core/utils.ts` — logique pure.
   ============================================================ */
import { describe, it, expect } from 'vitest';
import { cleRecherche, elisionDe, normalizeText } from '../src/core/utils';

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

/* ============================================================
   cleRecherche — clé de RECHERCHE d'un texte libre (#496, #556).
   ------------------------------------------------------------
   Partagée depuis #556 par la banque de mots et le sélecteur de leçon : deux copies
   divergeraient. Attendus dérivés du besoin d'usage (« sur un clavier tactile, taper
   `etre` doit trouver `être` et `geometrie` doit trouver `Géométrie` »), pas de la suite
   d'appels qui les produit. La règle CONTRAIRE — exiger les accents — vaut pour la
   correction des réponses (`normalizeText`) : les deux ne doivent surtout pas fusionner.
   ============================================================ */
describe('cleRecherche', () => {
	it('la casse est indifférente', () => {
		expect(cleRecherche('GÉOMÉTRIE')).toBe(cleRecherche('géométrie'));
		expect(cleRecherche('GeOmEtRiE')).toBe('geometrie');
		expect(cleRecherche('École')).toBe('ecole');
	});

	it('les accents tombent (é/è/ê/ë/î/ô/û/ç)', () => {
		expect(cleRecherche('être')).toBe('etre');
		expect(cleRecherche('Noël')).toBe('noel');
		expect(cleRecherche('français')).toBe('francais');
		expect(cleRecherche('août')).toBe('aout');
		expect(cleRecherche('problème')).toBe('probleme');
	});

	it('les ligatures se déplient (NFD ne les décompose pas)', () => {
		expect(cleRecherche('cœur')).toBe('coeur');
		expect(cleRecherche('ex æquo')).toBe('ex aequo');
		// Les deux graphies d'un même mot se rejoignent : c'est le but côté RECHERCHE.
		expect(cleRecherche('cœur')).toBe(cleRecherche('coeur'));
	});

	it('les espaces sont normalisés (bords rognés, suite d’espaces réduite)', () => {
		expect(cleRecherche('  Deux   mots  ')).toBe('deux mots');
	});

	it('chaîne vide ou toute blanche → clé vide (l’appelant y lit « aucun filtre »)', () => {
		expect(cleRecherche('')).toBe('');
		expect(cleRecherche('   ')).toBe('');
		expect(cleRecherche('\n\t ')).toBe('');
	});

	it('apostrophe, trait d’union, chiffres et ponctuation sont CONSERVÉS', () => {
		// Apostrophe droite (choix acté du projet) : la clé ne doit pas la manger, sans quoi
		// « l'heure » ne se chercherait plus comme il s'écrit.
		expect(cleRecherche("L'heure")).toBe("l'heure");
		expect(cleRecherche('Ajouter 9, 19...')).toBe('ajouter 9, 19...');
		expect(cleRecherche('× 10, × 100')).toBe('× 10, × 100');
		expect(cleRecherche('demi-droite')).toBe('demi-droite');
	});

	it('idempotente : re-normaliser une clé ne la change plus', () => {
		for (const s of ['Géométrie', "  L'ÉTÉ  ", 'ex æquo', ''])
			expect(cleRecherche(cleRecherche(s))).toBe(cleRecherche(s));
	});

	it('à NE PAS confondre avec normalizeText, qui EXIGE les accents (correction)', () => {
		expect(normalizeText('été')).toBe('été'); // la correction distingue « ete » de « été »
		expect(cleRecherche('été')).toBe('ete'); // la recherche, non — et c'est voulu
		expect(cleRecherche('cote')).toBe(cleRecherche('côté'));
	});
});
