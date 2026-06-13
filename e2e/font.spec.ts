/* ============================================================
   Tests e2e de la police (#137) : Nunito à l'écran partout (y compris
   les fiches d'exercice), serif réservé à l'IMPRESSION.
   ============================================================ */
import { test, expect } from '@playwright/test';
import { watchErrors, gotoHash } from './helpers';

test("à l'écran, la fiche d'exercice est en Nunito (comme le reste du site)", async ({ page }) => {
	const errors = watchErrors(page);
	await gotoHash(page, 'lecon-math-tables-addition');
	const title = page.locator('.fiche-title').first();
	await title.waitFor();
	const ff = await title.evaluate((el) => getComputedStyle(el).fontFamily.toLowerCase());
	expect(ff).toContain('nunito');
	expect(ff).not.toContain('georgia');
	expect(errors).toEqual([]);
});

test("à l'impression, la fiche repasse en serif (effet « cahier »)", async ({ page }) => {
	await gotoHash(page, 'lecon-math-tables-addition');
	await page.locator('.sheets').first().waitFor();
	await page.emulateMedia({ media: 'print' });
	const ff = await page
		.locator('.sheets')
		.first()
		.evaluate((el) => getComputedStyle(el).fontFamily.toLowerCase());
	expect(ff).toContain('georgia');
});
