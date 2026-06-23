/* ============================================================
   #234 — verrou optionnel de l'espace encadrant (PIN haché + récupération GUID).
   DÉSACTIVÉ par défaut. Seuls des hachés sont stockés ; le code ne se réinitialise
   qu'avec le secret de récupération. Clé GLOBALE (non préfixée profil).
   ============================================================ */
import { beforeEach, describe, it, expect } from 'vitest';
import {
	pinValide,
	pinActif,
	definirPin,
	verifierPin,
	reinitViaRecuperation,
	desactiverPin,
	ENCADRANT_LOCK_KEY,
} from '../src/core/encadrant-lock';

beforeEach(() => {
	localStorage.clear();
});

describe('pinValide', () => {
	it('exactement 4 chiffres', () => {
		expect(pinValide('1234')).toBe(true);
		expect(pinValide('0000')).toBe(true);
		expect(pinValide('123')).toBe(false);
		expect(pinValide('12345')).toBe(false);
		expect(pinValide('12a4')).toBe(false);
		expect(pinValide('')).toBe(false);
	});
});

describe('cycle de vie du verrou', () => {
	it('désactivé par défaut', () => {
		expect(pinActif()).toBe(false);
	});

	it('définir → actif ; ne stocke pas le code en clair', async () => {
		const secret = await definirPin('1234');
		expect(typeof secret).toBe('string');
		expect(secret.length).toBeGreaterThan(8); // GUID à haute entropie
		expect(pinActif()).toBe(true);
		// Ni le code ni le secret ne figurent en clair dans le stockage.
		const brut = localStorage.getItem(ENCADRANT_LOCK_KEY) ?? '';
		expect(brut).not.toContain('1234');
		expect(brut).not.toContain(secret);
	});

	it('verifierPin : bon code accepté, mauvais refusé', async () => {
		await definirPin('1234');
		expect(await verifierPin('1234')).toBe(true);
		expect(await verifierPin('0000')).toBe(false);
	});

	it('reinitViaRecuperation : mauvais secret refusé, bon secret retire le verrou', async () => {
		const secret = await definirPin('1234');
		expect(await reinitViaRecuperation('mauvais-secret')).toBe(false);
		expect(pinActif()).toBe(true); // toujours verrouillé
		expect(await reinitViaRecuperation(secret)).toBe(true);
		expect(pinActif()).toBe(false); // verrou retiré → on peut définir un nouveau code
	});

	it('desactiverPin retire le verrou', async () => {
		await definirPin('1234');
		desactiverPin();
		expect(pinActif()).toBe(false);
	});

	it('verifierPin sans verrou → false (pas d’exception)', async () => {
		expect(await verifierPin('1234')).toBe(false);
	});
});
