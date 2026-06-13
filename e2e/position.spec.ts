/* ============================================================
   Tests e2e de la valeur de position / décomposition (#94) :
   leçons mono-mode (saisie), réponse numérique unique.
   ============================================================ */
import { test, expect } from '@playwright/test';
import { watchErrors, gotoHash } from './helpers';

test('Numération : « La valeur des chiffres » se lance et se corrige', async ({ page }) => {
	const errors = watchErrors(page);
	await gotoHash(page, 'lecon-num-valeur-position'); // mono-mode → fiche directe
	const field = page.locator('.ans').first();
	await field.waitFor();
	const good = await field.getAttribute('data-answer');
	await field.fill(good ?? '');
	await page.locator('#btnVerify').click();
	await expect(page.locator('.mark.correct').first()).toBeVisible();
	expect(errors).toEqual([]);
});

test('Numération : « Je décompose jusqu’à 1 000 » se lance et se corrige', async ({ page }) => {
	const errors = watchErrors(page);
	await gotoHash(page, 'lecon-num-decompose-1000');
	const fields = page.locator('.ans');
	await fields.first().waitFor();
	const good = await fields.first().getAttribute('data-answer');
	await fields.first().fill(good ?? '');
	await fields.nth(1).fill('123456'); // réponse volontairement fausse
	await page.locator('#btnVerify').click();
	await expect(page.locator('.mark.correct').first()).toBeVisible();
	await expect(page.locator('.mark.wrong').first()).toBeVisible();
	expect(errors).toEqual([]);
});
