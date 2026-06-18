/* ============================================================
   Smoke e2e — Division par le sens (#104).
   Deux leçons de calcul mental (fiche en saisie) : « Moitié et quart » et
   « Je partage ». On vérifie que la catégorie les liste et qu'une bonne réponse
   est validée (réponse exposée via data-answer, comme tous les champs .ans).
   ============================================================ */
import { test, expect, type Page } from '@playwright/test';
import { watchErrors, gotoHash } from './helpers';

async function repondPremier(page: Page): Promise<void> {
	const champ = page.locator('.ans').first();
	await champ.waitFor();
	const bonne = await champ.getAttribute('data-answer');
	await champ.fill(bonne ?? '');
	await page.locator('#btnVerify').click();
	await expect(page.locator('.mark.correct').first()).toBeVisible();
}

test('la catégorie Calcul mental liste les leçons de division', async ({ page }) => {
	const errors = watchErrors(page);
	await gotoHash(page, 'categorie-math-calcul-mental');
	await expect(page.locator('[data-id="math-div-moitie-quart"]')).toBeVisible();
	await expect(page.locator('[data-id="math-div-partage"]')).toBeVisible();
	await expect(page.locator('[data-id="math-div-reste"]')).toBeVisible();
	expect(errors).toEqual([]);
});

test('Moitié et quart : la fiche se rend et une bonne réponse est validée', async ({ page }) => {
	const errors = watchErrors(page);
	await gotoHash(page, 'lecon-math-div-moitie-quart');
	await repondPremier(page);
	expect(errors).toEqual([]);
});

test('Je partage : la fiche se rend et une bonne réponse est validée', async ({ page }) => {
	const errors = watchErrors(page);
	await gotoHash(page, 'lecon-math-div-partage');
	await repondPremier(page);
	expect(errors).toEqual([]);
});
