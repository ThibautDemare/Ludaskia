/* ============================================================
   Smoke e2e — Grammaire : pronom sujet & accord sujet-verbe (#115).
   Deux leçons QCM (4 options) + feedback (explication).
   ============================================================ */
import { test, expect } from '@playwright/test';
import { watchErrors, gotoHash } from './helpers';

test('la catégorie Grammaire propose les deux leçons', async ({ page }) => {
	const errors = watchErrors(page);
	await gotoHash(page, 'categorie-fr-grammaire');
	await expect(page.locator('[data-id="fr-gram-pronom-sujet"]')).toBeVisible();
	await expect(page.locator('[data-id="fr-gram-accord-sujet-verbe"]')).toBeVisible();
	expect(errors).toEqual([]);
});

test('pronom sujet : QCM 4 options + feedback', async ({ page }) => {
	const errors = watchErrors(page);
	await gotoHash(page, 'lecon-fr-gram-pronom-sujet'); // mono-mode QCM → lancement direct
	const choices = page.locator('.sprint-choice');
	await choices.first().waitFor();
	expect(await choices.count()).toBe(4);
	await choices.first().click();
	await expect(page.locator('.lqcm-expl')).toBeVisible();
	expect(errors).toEqual([]);
});

test('accord sujet-verbe : QCM 4 formes + feedback', async ({ page }) => {
	const errors = watchErrors(page);
	await gotoHash(page, 'lecon-fr-gram-accord-sujet-verbe');
	const choices = page.locator('.sprint-choice');
	await choices.first().waitFor();
	expect(await choices.count()).toBe(4);
	await choices.first().click();
	await expect(page.locator('.lqcm-expl')).toBeVisible();
	expect(errors).toEqual([]);
});
