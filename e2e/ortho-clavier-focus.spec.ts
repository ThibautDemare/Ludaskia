/* ============================================================
   Frictions clavier/focus en séance de dictée (#702), écrites AVANT
   l'implémentation à partir des critères NUMÉROTÉS de l'issue :

   - critère 3 : sur le mot caché, la touche Entrée déclenche « Cacher et
     écrire → » (zone de saisie révélée, champ focalisé) — SANS souris —
     dans le parcours ET dans la carte de révision espacée, les deux hôtes
     partageant `renderMotCache` (ui/ortho-taches.ts).
   - critère 4 : en dictée, un clic sur « Écouter le mot »/« Écouter la
     phrase » renvoie le focus dans #orthoInput.
   - critère 5 : à l'arrivée sur une dictée, le focus est DÉJÀ dans
     #orthoInput (la lecture démarre pourtant seule).
   - critère 6 : en mot caché, une fois la zone de saisie visible, « Écouter »
     ramène lui aussi le focus dans #orthoInput.
   - critère 7 (NÉGATIF) : tant que le mot est encore AFFICHÉ (zone de
     saisie masquée), « Écouter » ne focalise PAS #orthoInput — il n'y a
     rien à taper dans un champ invisible.
   - critère 8 (NÉGATIF) : sur les tuiles, « Écouter » ne déplace le focus
     dans aucun champ (pas de saisie sur cette marche).

   Stub voix FR (STUB_VOIX_FR, `journal-couverture.ts`) : sans lui, aucun
   bouton « Écouter » n'est greffé (Chromium headless n'expose aucune voix
   par défaut), et le mode « dictée » n'est même pas proposé par l'écran de
   choix. Balisage inchangé (#btnCacher, #motStage, #zoneSaisie, #orthoInput,
   #btnEcouterMot, #btnEcouter, #btnEcouterTuiles) : seul le câblage du focus
   est visé par cette issue.
   ============================================================ */
import { test, expect } from '@playwright/test';
import type { Page } from '@playwright/test';
import { watchErrors, gotoHash } from './helpers';
import { STUB_VOIX_FR } from './journal-couverture';

const LESSON_ID = 'l-e2e-clavier-focus';

/* Liste à un seul mot, découverte, rien de validé : les trois modes ciblés
   (tuiles, mot caché, dictée — cette dernière dès que la voix est stubbée)
   sont donc tous proposés par l'écran de choix. */
const ORTHO_SEED = {
	banque: {
		w1: {
			id: 'w1',
			mot: 'bonjour',
			entourage: [],
			atelierFait: true,
			validation: { motCache: false, tuiles: false, dictee: false },
			revision: { palier: 0, prochaineRevision: null, reussites: 0, dernierTest: null },
			origine: 'liste',
		},
	},
	listes: [
		{ id: LESSON_ID, label: 'Test clavier focus', motIds: ['w1'], createdAt: 1, updatedAt: 1 },
	],
	motIdParForme: { bonjour: 'w1' },
};

/* Mot DÛ en révision espacée sur la marche motCache (tuiles déjà validé,
   motCache pas encore) — même seed que revision-ortho.spec.ts, ici pour
   isoler le critère 3 sur le second hôte (#revStage plutôt que #sheets). */
const ORTHO_SEED_DUE = {
	banque: {
		w1: {
			id: 'w1',
			mot: 'bonjour',
			entourage: [],
			atelierFait: true,
			validation: { tuiles: true, motCache: false, dictee: false },
			revision: { palier: 2, prochaineRevision: 1, reussites: 2, dernierTest: 1 },
			origine: 'liste',
		},
	},
	listes: [
		{
			id: 'l-e2e-clavier-focus-rev',
			label: 'Test révision focus',
			motIds: ['w1'],
			createdAt: 1,
			updatedAt: 1,
		},
	],
	motIdParForme: { bonjour: 'w1' },
};

async function seedOrtho(page: Page, seed: unknown): Promise<void> {
	await page.addInitScript((s) => {
		localStorage.setItem('e2e/ludaskia_ortho', JSON.stringify(s));
	}, seed);
}

/* ============================================================
   Critère 3 — pas besoin de voix ici, le geste ne touche pas « Écouter ».
   ============================================================ */

test('critère 3 (parcours) : Entrée sur le mot caché déclenche « Cacher et écrire → »', async ({
	page,
}) => {
	const errors = watchErrors(page);
	await seedOrtho(page, ORTHO_SEED);
	await gotoHash(page, 'ortho-mode-' + LESSON_ID);
	await page.locator('.mode-btn[data-mode="motCache"]').click();

	await expect(page.locator('#motAffiche')).toBeVisible();
	await expect(page.locator('#zoneSaisie')).toBeHidden();

	// Aucun clic : seule la touche Entrée, sans avoir touché la souris.
	await page.keyboard.press('Enter');

	await expect(page.locator('#zoneSaisie')).toBeVisible();
	await expect(page.locator('#orthoInput')).toBeFocused();

	expect(errors).toEqual([]);
});

test('critère 3 (révision espacée) : même geste sur la carte de révision', async ({ page }) => {
	const errors = watchErrors(page);
	await seedOrtho(page, ORTHO_SEED_DUE);
	await gotoHash(page, 'revision-espacee');

	await expect(page.locator('#motAffiche')).toBeVisible();
	await expect(page.locator('#zoneSaisie')).toBeHidden();

	await page.keyboard.press('Enter');

	await expect(page.locator('#zoneSaisie')).toBeVisible();
	await expect(page.locator('#orthoInput')).toBeFocused();

	expect(errors).toEqual([]);
});

/* ============================================================
   Critères 4-8 — focus autour des boutons « Écouter », voix disponible.
   ============================================================ */
test.describe('voix disponible (stub STUB_VOIX_FR)', () => {
	test.beforeEach(async ({ page }) => {
		await page.addInitScript(STUB_VOIX_FR);
	});

	test('critère 5 : arrivée sur une dictée, le focus est déjà dans #orthoInput', async ({
		page,
	}) => {
		const errors = watchErrors(page);
		await seedOrtho(page, ORTHO_SEED);
		await gotoHash(page, 'ortho-mode-' + LESSON_ID);
		await page.locator('.mode-btn[data-mode="dictee"]').click();

		await expect(page.locator('#orthoInput')).toBeVisible();
		// Aucune interaction depuis l'arrivée : ni clic, ni touche — seule la lecture
		// automatique s'est déclenchée.
		await expect(page.locator('#orthoInput')).toBeFocused();

		expect(errors).toEqual([]);
	});

	test('critère 4 : en dictée, cliquer « Écouter » renvoie le focus dans #orthoInput', async ({
		page,
	}) => {
		const errors = watchErrors(page);
		await seedOrtho(page, ORTHO_SEED);
		await gotoHash(page, 'ortho-mode-' + LESSON_ID);
		await page.locator('.mode-btn[data-mode="dictee"]').click();
		await expect(page.locator('#orthoInput')).toBeVisible();

		await page.locator('#btnEcouter').click();

		await expect(page.locator('#orthoInput')).toBeFocused();

		expect(errors).toEqual([]);
	});

	test('critère 6 : en mot caché, zone de saisie visible, « Écouter » ramène le focus dans #orthoInput', async ({
		page,
	}) => {
		const errors = watchErrors(page);
		await seedOrtho(page, ORTHO_SEED);
		await gotoHash(page, 'ortho-mode-' + LESSON_ID);
		await page.locator('.mode-btn[data-mode="motCache"]').click();
		await page.locator('#btnCacher').click();
		await expect(page.locator('#zoneSaisie')).toBeVisible();

		await page.locator('#btnEcouterMot').click();

		await expect(page.locator('#orthoInput')).toBeFocused();

		expect(errors).toEqual([]);
	});

	test('critère 7 (NÉGATIF) : mot encore affiché, « Écouter » ne focalise pas #orthoInput', async ({
		page,
	}) => {
		const errors = watchErrors(page);
		await seedOrtho(page, ORTHO_SEED);
		await gotoHash(page, 'ortho-mode-' + LESSON_ID);
		await page.locator('.mode-btn[data-mode="motCache"]').click();

		await expect(page.locator('#motAffiche')).toBeVisible();
		await expect(page.locator('#zoneSaisie')).toBeHidden(); // rien à taper pour l'instant

		await page.locator('#btnEcouterMot').click();

		// La zone reste masquée : rien à taper, donc rien à focaliser dedans.
		await expect(page.locator('#zoneSaisie')).toBeHidden();
		await expect(page.locator('#orthoInput')).not.toBeFocused();

		expect(errors).toEqual([]);
	});

	test('critère 8 (NÉGATIF) : sur les tuiles, « Écouter » ne déplace le focus dans aucun champ', async ({
		page,
	}) => {
		const errors = watchErrors(page);
		await seedOrtho(page, ORTHO_SEED);
		await gotoHash(page, 'ortho-mode-' + LESSON_ID);
		await page.locator('.mode-btn[data-mode="tuiles"]').click();
		await expect(page.locator('#btnEcouterTuiles')).toBeVisible();

		// Profil neuf : la bulle d'aide au geste (« lettres ») s'auto-affiche au 1er
		// lancement des tuiles (maybeAutoAide, ortho-taches.ts) et intercepte le clic
		// tant qu'elle est ouverte — même patron de fermeture qu'aide-exercice.spec.ts.
		await expect(page.locator('#aideOverlay')).toBeVisible();
		await page.locator('.aide-ok').click();
		await expect(page.locator('#aideOverlay')).toHaveCount(0);

		// Cette marche n'a aucune saisie texte : rien à focaliser, structurellement.
		await expect(page.locator('#orthoInput')).toHaveCount(0);

		await page.locator('#btnEcouterTuiles').click();

		await expect(page.locator('#orthoInput')).toHaveCount(0);
		const tag = await page.evaluate(() => document.activeElement?.tagName);
		expect(tag).not.toBe('INPUT');

		expect(errors).toEqual([]);
	});
});
