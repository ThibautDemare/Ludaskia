/* ============================================================
   Tests e2e de la leçon « Les angles » (#202) : reconnaissance
   d'un angle via figure SVG et QCM mono-mode.
   ============================================================ */
import { test, expect } from '@playwright/test';
import { watchErrors, gotoHash } from './helpers';

test("Les angles (QCM) : la figure SVG s'affiche et un choix donne un retour", async ({ page }) => {
	const errors = watchErrors(page);
	await gotoHash(page, 'lecon-geo-angles'); // mono-mode QCM → runner direct
	await expect(page.locator('.figure svg').first()).toBeVisible();
	// Le nombre de choix varie selon la question tirée (2 ou 3) : on vérifie ≥ 2
	const choices = page.locator('.sprint-choice');
	await expect(choices.first()).toBeVisible();
	expect(await choices.count()).toBeGreaterThanOrEqual(2);
	await choices.first().click();
	await expect(page.locator('#lqcmFeedback')).toBeVisible();
	expect(errors).toEqual([]);
});
