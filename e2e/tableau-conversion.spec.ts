/* ============================================================
   Tests e2e du mode « tableau de conversion » (#394) : 2ᵉ mode des leçons
   de mesures (longueurs, masses, contenances — pas les durées, base 60).
   L'enfant remplit une colonne d'unité par case via un pavé de chiffres
   externe (jamais de clavier natif), avec avance automatique.
   ============================================================ */
import { test, expect } from '@playwright/test';
import { watchErrors, gotoHash, seedAideVue } from './helpers';

/* Le mode « tableau » déclenche l'aide contextuelle au 1er lancement (overlay
   bloquant, cf. numeration.spec.ts) : on la marque comme déjà vue. */
test.beforeEach(async ({ page }) => {
	await seedAideVue(page);
});

/* Remplit toutes les cases dans l'ordre de `data-i` croissant via le pavé, en
   utilisant le chiffre attendu (`data-answer`) de chaque case. L'avance auto
   suit l'ordre : cliquer les bons boutons du pavé dans l'ordre suffit. */
async function remplirTableau(page: import('@playwright/test').Page): Promise<void> {
	const cellules = page.locator('.tc-cell');
	const n = await cellules.count();
	for (let i = 0; i < n; i++) {
		const cellule = page.locator(`.tc-cell[data-i="${i}"]`);
		const chiffre = await cellule.getAttribute('data-answer');
		await page.locator(`.tc-pave-btn[data-chiffre="${chiffre}"]`).click();
	}
}

test('mes-longueurs : le choix de mode propose saisie et tableau', async ({ page }) => {
	const errors = watchErrors(page);
	await gotoHash(page, 'mode-mes-longueurs');
	await expect(page.locator('.mode-btn[data-mode="saisie"]')).toBeVisible();
	await expect(page.locator('.mode-btn[data-mode="tableau"]')).toBeVisible();
	expect(errors).toEqual([]);
});

test('mes-longueurs (tableau) : le tableau se rend avec au moins 2 cases', async ({ page }) => {
	const errors = watchErrors(page);
	await gotoHash(page, 'mode-mes-longueurs');
	await page.locator('.mode-btn[data-mode="tableau"]').click();
	await expect(page.locator('#tcTable')).toBeVisible();
	expect(await page.locator('.tc-cell').count()).toBeGreaterThanOrEqual(2);
	expect(errors).toEqual([]);
});

test('mes-longueurs (tableau) : remplir toutes les cases juste donne Bravo', async ({ page }) => {
	const errors = watchErrors(page);
	await gotoHash(page, 'mode-mes-longueurs');
	await page.locator('.mode-btn[data-mode="tableau"]').click();
	await expect(page.locator('#tcTable')).toBeVisible();

	await remplirTableau(page);
	await expect(page.locator('#tcVerif')).toBeEnabled();
	await page.locator('#tcVerif').click();

	const n = await page.locator('.tc-cell').count();
	for (let i = 0; i < n; i++) {
		await expect(page.locator(`.tc-cell[data-i="${i}"]`)).toHaveClass(/correct/);
	}
	await expect(page.locator('#tcFeedback')).toContainText('Bravo');
	await expect(page.locator('#tcActions button')).toBeVisible();
	expect(errors).toEqual([]);
});

test('mes-masses (tableau) : une case fausse donne un ✗ et affiche la bonne réponse', async ({
	page,
}) => {
	const errors = watchErrors(page);
	await gotoHash(page, 'mode-mes-masses');
	await page.locator('.mode-btn[data-mode="tableau"]').click();
	await expect(page.locator('#tcTable')).toBeVisible();

	const cellules = page.locator('.tc-cell');
	const n = await cellules.count();
	// Remplit toutes les cases juste, sauf la première qu'on trompe volontairement.
	for (let i = 0; i < n; i++) {
		const cellule = page.locator(`.tc-cell[data-i="${i}"]`);
		const bon = await cellule.getAttribute('data-answer');
		const chiffre = i === 0 ? String((Number(bon) + 1) % 10) : (bon ?? '0');
		await page.locator(`.tc-pave-btn[data-chiffre="${chiffre}"]`).click();
	}
	await expect(page.locator('#tcVerif')).toBeEnabled();
	await page.locator('#tcVerif').click();

	await expect(page.locator('.tc-cell[data-i="0"]')).toHaveClass(/wrong/);
	const bonneReponse = await page.locator('.tc-cell').first().getAttribute('data-answer');
	// data-answer reste posé après correction : on vérifie juste la présence du feedback détaillé.
	expect(bonneReponse).not.toBeNull();
	await expect(page.locator('#tcFeedback')).toContainText('La bonne réponse était');
	expect(errors).toEqual([]);
});
