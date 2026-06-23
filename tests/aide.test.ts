/* ============================================================
   Aide contextuelle des exercices (#272) — logique pure : contenu des aides
   et mémoire « aide déjà vue » par profil. (Le rendu est testé en e2e.)
   ============================================================ */
import { beforeEach, describe, it, expect } from 'vitest';
import {
	AIDES,
	AIDE_VUE_KEY,
	aideVue,
	marquerAideVue,
	texteTtsAide,
	type TypeAide,
} from '../src/core/aide';
import { setActivePrefix } from '../src/core/storage';

const TYPES: TypeAide[] = ['tuiles', 'ordre', 'tri', 'atelier', 'lettres'];

beforeEach(() => {
	localStorage.clear();
	setActivePrefix(''); // profil par défaut
});

describe('contenu des aides', () => {
	it('expose les 5 types, chacun avec un titre et au moins une étape', () => {
		for (const t of TYPES) {
			expect(AIDES[t].titre.trim().length).toBeGreaterThan(0);
			expect(AIDES[t].etapes.length).toBeGreaterThan(0);
			expect(AIDES[t].etapes.every((e) => e.trim().length > 0)).toBe(true);
		}
	});

	it('limite les étapes à 3 (charge cognitive CE2)', () => {
		for (const t of TYPES) {
			expect(AIDES[t].etapes.length).toBeLessThanOrEqual(3);
		}
	});

	it("l'atelier présente une voie alternative ET un filet anti-erreur", () => {
		expect(AIDES.atelier.alternative?.trim().length).toBeGreaterThan(0);
		expect(AIDES.atelier.reparation?.trim().length).toBeGreaterThan(0);
	});

	it('le texte TTS enchaîne titre, étapes et filets', () => {
		const txt = texteTtsAide('ordre');
		expect(txt).toContain(AIDES.ordre.titre);
		expect(txt).toContain(AIDES.ordre.etapes[0]);
		expect(txt).toContain(AIDES.ordre.reparation!);
	});
});

describe('mémoire « aide déjà vue » par profil', () => {
	it('une aide est « non vue » par défaut, puis « vue » après marquage', () => {
		expect(aideVue('tuiles')).toBe(false);
		marquerAideVue('tuiles');
		expect(aideVue('tuiles')).toBe(true);
	});

	it('marque chaque type indépendamment', () => {
		marquerAideVue('atelier');
		expect(aideVue('atelier')).toBe(true);
		expect(aideVue('tuiles')).toBe(false);
		expect(aideVue('ordre')).toBe(false);
		expect(aideVue('tri')).toBe(false);
	});

	it('est idempotent (marquer deux fois ne casse rien)', () => {
		marquerAideVue('tri');
		marquerAideVue('tri');
		expect(aideVue('tri')).toBe(true);
		expect(localStorage.getItem(AIDE_VUE_KEY)).toContain('tri');
	});

	it('est isolée par profil (préfixe de clé)', () => {
		setActivePrefix('u-a/');
		marquerAideVue('tuiles');
		expect(aideVue('tuiles')).toBe(true);
		// Autre profil : l'état ne fuit pas.
		setActivePrefix('u-b/');
		expect(aideVue('tuiles')).toBe(false);
		marquerAideVue('ordre');
		// Retour au 1er profil : son état est intact.
		setActivePrefix('u-a/');
		expect(aideVue('tuiles')).toBe(true);
		expect(aideVue('ordre')).toBe(false);
	});
});
