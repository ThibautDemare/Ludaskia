/* ============================================================
   Smoke e2e — Vocabulaire : sens propre / sens figuré (#112).
   QCM 3 options (les 2 sens + un distracteur) + feedback du sens employé.
   ============================================================ */
import { test, expect } from '@playwright/test';
import { watchErrors, gotoHash } from './helpers';

test('la catégorie Vocabulaire propose la leçon sens propre / figuré', async ({ page }) => {
	const errors = watchErrors(page);
	await gotoHash(page, 'categorie-fr-vocabulaire');
	await expect(page.locator('[data-id="fr-vocab-sens"]')).toBeVisible();
	expect(errors).toEqual([]);
});

test('sens propre / figuré : QCM 3 options + feedback du sens', async ({ page }) => {
	const errors = watchErrors(page);
	await gotoHash(page, 'lecon-fr-vocab-sens'); // mono-mode QCM → lancement direct
	const choices = page.locator('.sprint-choice');
	await choices.first().waitFor();
	expect(await choices.count()).toBe(3);
	// Consigne d'action visible (#265) : cadre la tâche (choisir le sens du mot).
	await expect(page.locator('.lqcm-consigne')).toContainText('Quel est le sens du mot');
	await choices.first().click();
	await expect(page.locator('.lqcm-expl')).toBeVisible();
	await expect(page.locator('.lqcm-expl')).toContainText('sens');
	expect(errors).toEqual([]);
});
