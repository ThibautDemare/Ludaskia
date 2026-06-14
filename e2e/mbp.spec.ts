/* ============================================================
   Smoke e2e — Orthographe : règle « m devant m, b, p » (#111).
   Rubrique « Les règles » : exercice « m ou n ? » (QCM 2 options) + feedback.
   ============================================================ */
import { test, expect } from '@playwright/test';
import { watchErrors, gotoHash } from './helpers';

test('la rubrique « Les règles » propose la leçon m/b/p', async ({ page }) => {
	const errors = watchErrors(page);
	await gotoHash(page, 'categorie-fr-orthographe');
	await expect(page.locator('.cat-rubrique').filter({ hasText: 'Les règles' })).toBeVisible();
	await expect(page.locator('[data-lecon="fr-mbp"]')).toBeVisible();
	expect(errors).toEqual([]);
});

test('m/b/p : QCM « m ou n ? » à 2 options + retour avec la règle', async ({ page }) => {
	const errors = watchErrors(page);
	await gotoHash(page, 'categorie-fr-orthographe');
	await page.locator('[data-lecon="fr-mbp"]').click();
	const choices = page.locator('.sprint-choice');
	await choices.first().waitFor();
	expect(await choices.count()).toBe(2);
	const labels = (await choices.allTextContents()).map((s) => s.trim()).sort();
	expect(labels).toEqual(['m', 'n']);
	await choices.first().click();
	// Feedback : la règle (ou le cas) est rappelée.
	await expect(page.locator('.lqcm-expl')).toBeVisible();
	expect(errors).toEqual([]);
});
