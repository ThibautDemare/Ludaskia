/* ============================================================
   Smoke e2e — Vocabulaire : familles, préfixes, suffixes (#113).
   QCM de reconnaissance (3 options) + feedback (explication).
   ============================================================ */
import { test, expect } from '@playwright/test';
import { watchErrors, gotoHash } from './helpers';

test('la catégorie Vocabulaire propose la leçon familles/préfixes/suffixes', async ({ page }) => {
	const errors = watchErrors(page);
	await gotoHash(page, 'categorie-fr-vocabulaire');
	await expect(page.locator('[data-id="fr-vocab-familles"]')).toBeVisible();
	expect(errors).toEqual([]);
});

test('familles/préfixes/suffixes : QCM 3 options + feedback', async ({ page }) => {
	const errors = watchErrors(page);
	await gotoHash(page, 'lecon-fr-vocab-familles'); // mono-mode QCM → lancement direct
	const choices = page.locator('.sprint-choice');
	await choices.first().waitFor();
	expect(await choices.count()).toBe(3);
	// Consigne d'action visible (#265) : chaque item (famille / préfixe-suffixe) en porte une.
	await expect(page.locator('.lqcm-consigne')).toBeVisible();
	await choices.first().click();
	await expect(page.locator('.lqcm-expl')).toBeVisible();
	expect(errors).toEqual([]);
});
