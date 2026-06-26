/* ============================================================
   #331 — Easter eggs (module pur core/eggs.ts).
   Couvre : la décision d'apparition ambiante (plancher anti-malchance +
   plafond/cooldown) et l'album des trouvailles (idempotence, ordre,
   robustesse aux ids orphelins). Aucun DOM ici (module pur).
   ============================================================ */
import { beforeEach, describe, it, expect } from 'vitest';
import {
	decideAmbient,
	AMBIENT_MIN_GAP,
	AMBIENT_PITY,
	AMBIENT_CHANCE,
	markEggFound,
	hasFoundEgg,
	foundEggs,
	foundEggIds,
	getEgg,
	EGGS,
} from '../src/core/eggs';
import { initProfiles, touchActiveProfile } from '../src/core/profiles';
import { setOnDataWrite, lsSet } from '../src/core/storage';

beforeEach(() => {
	localStorage.clear();
	setOnDataWrite(touchActiveProfile);
	initProfiles();
});

describe('apparition ambiante : cooldown (plafond)', () => {
	it("ne montre jamais l'egg juste après une apparition (compteur < MIN_GAP)", () => {
		// Compteur 0 = on vient de la montrer. Même un tirage « gagnant » (0) ne doit
		// pas la remontrer tout de suite (anti-spam).
		const d = decideAmbient(0, 0);
		expect(d.show).toBe(false);
		expect(d.next).toBe(1);
		// Tant que v < MIN_GAP, jamais d'apparition quel que soit le tirage.
		for (let since = 0; since < AMBIENT_MIN_GAP - 1; since++) {
			expect(decideAmbient(since, 0).show).toBe(false);
		}
	});
});

describe('apparition ambiante : plancher anti-malchance', () => {
	it('force une apparition au plus tard à AMBIENT_PITY (même malchance totale)', () => {
		// roll = 0.99 → jamais sous AMBIENT_CHANCE : seul le plancher peut déclencher.
		const malchance = 0.99;
		let since = 0;
		let vu = -1;
		for (let i = 1; i <= AMBIENT_PITY; i++) {
			const d = decideAmbient(since, malchance);
			since = d.next;
			if (d.show) {
				vu = i;
				break;
			}
		}
		// Apparition garantie en au plus AMBIENT_PITY occasions (« pas d'attente infinie »).
		expect(vu).toBe(AMBIENT_PITY);
	});

	it('au seuil de plancher, montre quel que soit le tirage et remet le compteur à 0', () => {
		const d = decideAmbient(AMBIENT_PITY - 1, 0.99); // v = AMBIENT_PITY
		expect(d.show).toBe(true);
		expect(d.next).toBe(0);
	});
});

describe('apparition ambiante : tirage entre cooldown et plancher', () => {
	it('montre si roll < AMBIENT_CHANCE, pas sinon', () => {
		// since = MIN_GAP - 1 → v = MIN_GAP (première occasion « tirable »).
		const since = AMBIENT_MIN_GAP - 1;
		expect(decideAmbient(since, 0).show).toBe(true); // tirage gagnant → apparaît, compteur remis
		expect(decideAmbient(since, 0).next).toBe(0);
		expect(decideAmbient(since, AMBIENT_CHANCE).show).toBe(false); // borne haute exclue
		expect(decideAmbient(since, 0.99).show).toBe(false);
	});
});

describe('album des trouvailles', () => {
	it('markEggFound est idempotent : true à la 1re découverte, false ensuite', () => {
		expect(markEggFound('mascotte-rieuse')).toBe(true);
		expect(markEggFound('mascotte-rieuse')).toBe(false);
		expect(hasFoundEgg('mascotte-rieuse')).toBe(true);
		expect(foundEggs()).toHaveLength(1);
	});

	it('conserve l’ordre de découverte', () => {
		markEggFound('luciole');
		markEggFound('ecureuil-foret');
		expect(foundEggIds()).toEqual(['luciole', 'ecureuil-foret']);
		expect(foundEggs().map((e) => e.id)).toEqual(['luciole', 'ecureuil-foret']);
	});

	it('persiste à la relecture (clé dédiée par profil)', () => {
		markEggFound('mascotte-rieuse');
		// Relecture depuis le stockage (pas de cache mémoire).
		expect(foundEggIds()).toContain('mascotte-rieuse');
	});

	it('ignore un id inconnu (rien rangé, pas de découverte)', () => {
		expect(markEggFound('inconnu-xyz')).toBe(false);
		expect(hasFoundEgg('inconnu-xyz')).toBe(false);
		expect(foundEggs()).toHaveLength(0);
	});

	it('filtre les ids orphelins (egg retiré du catalogue) au rendu de l’album', () => {
		// Stockage forgé avec un id valide + un orphelin : l'orphelin n'apparaît pas.
		lsSet('ludaskia_eggs', { found: ['luciole', 'orphelin-disparu'] });
		expect(foundEggIds()).toEqual(['luciole']);
		expect(foundEggs().map((e) => e.id)).toEqual(['luciole']);
	});

	it('catalogue : ids et familles attendus (dont l’egg cookie #336)', () => {
		expect(EGGS.map((e) => e.id)).toEqual([
			'mascotte-rieuse',
			'ecureuil-foret',
			'luciole',
			'pluie-de-cookies',
		]);
		expect(getEgg('luciole')?.family).toBe('ambient');
		expect(getEgg('mascotte-rieuse')?.family).toBe('exploration');
		// L'egg cookie a un déclencheur OUVERT (pied de page), d'où la famille 'visible'.
		expect(getEgg('pluie-de-cookies')?.family).toBe('visible');
		expect(getEgg('pluie-de-cookies')?.emoji).toBe('🍪');
	});

	it('range la pluie de cookies dans l’album (1re fois seulement)', () => {
		// Même chemin idempotent que les autres eggs : recordCookieEgg() s'appuie dessus.
		expect(markEggFound('pluie-de-cookies')).toBe(true);
		expect(markEggFound('pluie-de-cookies')).toBe(false);
		expect(foundEggs().map((e) => e.id)).toEqual(['pluie-de-cookies']);
	});
});
