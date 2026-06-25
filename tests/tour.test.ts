/* ============================================================
   Guide de première visite (#330) — logique pure : contenu des étapes du tour
   et drapeaux « déjà vu » (tour enfant + mot aux parents), par profil.
   (Le rendu — spotlight, encart, mot parents — est testé en e2e.)
   ============================================================ */
import { beforeEach, describe, it, expect } from 'vitest';
import {
	TOUR_ETAPES,
	TOUR_VU_KEY,
	MOT_PARENTS_VU_KEY,
	texteTtsEtape,
	tourVu,
	marquerTourVu,
	motParentsVu,
	marquerMotParentsVu,
} from '../src/core/tour';
import { setActivePrefix } from '../src/core/storage';

beforeEach(() => {
	localStorage.clear();
	setActivePrefix(''); // profil par défaut
});

describe('contenu du tour enfant', () => {
	it('expose 3 grands repères, chacun avec une cible, un titre et un texte', () => {
		expect(TOUR_ETAPES).toHaveLength(3);
		for (const e of TOUR_ETAPES) {
			expect(e.cible.trim().length).toBeGreaterThan(0);
			expect(e.titre.trim().length).toBeGreaterThan(0);
			expect(e.texte.trim().length).toBeGreaterThan(0);
		}
	});

	it('reste court (≤ 4 étapes, charge cognitive CE2)', () => {
		expect(TOUR_ETAPES.length).toBeLessThanOrEqual(4);
	});

	it('cible des sélecteurs DOM stables de l’accueil', () => {
		// On vérifie le périmètre acté : par où jouer / progrès / récompenses.
		const cibles = TOUR_ETAPES.map((e) => e.cible);
		expect(cibles).toContain('.cards');
		expect(cibles).toContain('#progression');
		expect(cibles).toContain('#rewardNav');
	});

	it('le texte TTS enchaîne titre puis explication de chaque étape', () => {
		TOUR_ETAPES.forEach((e, i) => {
			const txt = texteTtsEtape(i);
			expect(txt).toContain(e.titre);
			expect(txt).toContain(e.texte);
		});
	});

	it('renvoie une chaîne vide pour un index hors bornes', () => {
		expect(texteTtsEtape(-1)).toBe('');
		expect(texteTtsEtape(TOUR_ETAPES.length)).toBe('');
	});
});

describe('drapeaux « déjà vu » par profil', () => {
	it('tour : non vu par défaut, puis vu après marquage', () => {
		expect(tourVu()).toBe(false);
		marquerTourVu();
		expect(tourVu()).toBe(true);
	});

	it('mot aux parents : non vu par défaut, puis vu après marquage', () => {
		expect(motParentsVu()).toBe(false);
		marquerMotParentsVu();
		expect(motParentsVu()).toBe(true);
	});

	it('les deux drapeaux sont indépendants', () => {
		marquerTourVu();
		expect(tourVu()).toBe(true);
		expect(motParentsVu()).toBe(false); // marquer le tour ne marque pas le mot parents
	});

	it('est idempotent (marquer deux fois ne casse rien)', () => {
		marquerTourVu();
		marquerTourVu();
		expect(tourVu()).toBe(true);
		expect(localStorage.getItem(TOUR_VU_KEY)).toBeTruthy();
	});

	it('est isolé par profil (préfixe de clé)', () => {
		setActivePrefix('u-a/');
		marquerTourVu();
		marquerMotParentsVu();
		expect(tourVu()).toBe(true);
		expect(motParentsVu()).toBe(true);
		// Autre profil : l'état ne fuit pas — chaque enfant revoit son guide.
		setActivePrefix('u-b/');
		expect(tourVu()).toBe(false);
		expect(motParentsVu()).toBe(false);
		// Retour au 1er profil : son état est intact.
		setActivePrefix('u-a/');
		expect(tourVu()).toBe(true);
		expect(motParentsVu()).toBe(true);
	});

	it('utilise des clés distinctes pour les deux drapeaux', () => {
		expect(TOUR_VU_KEY).not.toBe(MOT_PARENTS_VU_KEY);
	});
});
