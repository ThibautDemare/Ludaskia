/* ============================================================
   Tests e2e des opérations posées (#97) : grille de colonnes,
   saisie chiffre par chiffre, correction cellule par cellule.
   ============================================================ */
import { test, expect } from '@playwright/test';
import { watchErrors, gotoHash } from './helpers';

test('Calcul : la catégorie liste les 3 opérations posées', async ({ page }) => {
	const errors = watchErrors(page);
	await gotoHash(page, 'categorie-math-calcul');
	await expect(page.locator('.lesson-item')).toHaveCount(3);
	expect(errors).toEqual([]);
});

test('Addition posée : grille, saisie correcte validée cellule par cellule', async ({ page }) => {
	const errors = watchErrors(page);
	await gotoHash(page, 'lecon-calc-addition-posee');
	await expect(page.locator('.posee').first()).toBeVisible();
	// Remplit chaque cellule-résultat de la 1re opération avec sa bonne réponse.
	const cells = page.locator('.posee').first().locator('.posee-input');
	const n = await cells.count();
	expect(n).toBeGreaterThan(0);
	for (let i = 0; i < n; i++) {
		const c = cells.nth(i);
		await c.fill((await c.getAttribute('data-answer')) ?? '');
	}
	await page.locator('#btnVerify').click();
	await expect(page.locator('.posee').first().locator('.posee-input.correct')).toHaveCount(n);
	await expect(page.locator('.posee').first().locator('.posee-input.wrong')).toHaveCount(0);
	expect(errors).toEqual([]);
});

test('Multiplication posée : la grille (produits partiels possibles) se rend', async ({ page }) => {
	const errors = watchErrors(page);
	await gotoHash(page, 'lecon-calc-multiplication-posee');
	await expect(page.locator('.posee').first()).toBeVisible();
	expect(await page.locator('.posee').first().locator('.posee-input').count()).toBeGreaterThan(0);
	expect(errors).toEqual([]);
});
