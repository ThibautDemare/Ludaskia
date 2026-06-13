/* ============================================================
   Tests e2e de la leçon « Lire l'heure » (#88) : premier client du
   moteur de figures SVG. On vérifie que l'horloge SVG se rend et que
   les deux modes (saisie / QCM) fonctionnent.
   ============================================================ */
import { test, expect } from '@playwright/test';
import { watchErrors, gotoHash } from './helpers';

test("Lire l'heure (saisie) : l'horloge s'affiche et la bonne réponse est validée", async ({
	page,
}) => {
	const errors = watchErrors(page);
	await gotoHash(page, 'lecon-mes-lecture-heure'); // accès direct → mode conseillé (saisie)
	// L'horloge SVG accompagne la question.
	await expect(page.locator('.figure svg').first()).toBeVisible();
	const field = page.locator('.ans').first();
	await field.waitFor();
	const good = await field.getAttribute('data-answer'); // forme canonique « H h MM »
	await field.fill(good ?? '');
	await page.locator('#btnVerify').click();
	await expect(page.locator('.mark.correct').first()).toBeVisible();
	expect(errors).toEqual([]);
});

test("Lire l'heure (QCM) : l'horloge s'affiche et un choix donne un retour", async ({ page }) => {
	const errors = watchErrors(page);
	await gotoHash(page, 'mode-mes-lecture-heure'); // écran de choix de mode
	await page.locator('.mode-btn[data-mode="qcm"]').click();
	await expect(page.locator('.figure svg').first()).toBeVisible();
	await expect(page.locator('.sprint-choice')).toHaveCount(4);
	await page.locator('.sprint-choice').first().click(); // feedback immédiat
	await expect(page.locator('#lqcmFeedback')).toBeVisible();
	await expect(page.locator('#lqcmNext')).toBeVisible();
	expect(errors).toEqual([]);
});
