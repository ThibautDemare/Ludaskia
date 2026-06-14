/* ============================================================
   Smoke e2e — Grammaire : classes de mots, articles, adverbes (#116).
   QCM d'étiquetage (3 options) + feedback (explication).
   ============================================================ */
import { test, expect } from '@playwright/test';
import { watchErrors, gotoHash } from './helpers';

test('la catégorie Grammaire propose la leçon classes/articles/adverbes', async ({ page }) => {
	const errors = watchErrors(page);
	await gotoHash(page, 'categorie-fr-grammaire');
	await expect(page.locator('[data-id="fr-gram-classes"]')).toBeVisible();
	expect(errors).toEqual([]);
});

test('classes/articles/adverbes : QCM 3 options + feedback', async ({ page }) => {
	const errors = watchErrors(page);
	await gotoHash(page, 'lecon-fr-gram-classes'); // mono-mode QCM → lancement direct
	const choices = page.locator('.sprint-choice');
	await choices.first().waitFor();
	expect(await choices.count()).toBe(3);
	await choices.first().click();
	await expect(page.locator('.lqcm-expl')).toBeVisible();
	expect(errors).toEqual([]);
});
