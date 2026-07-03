/* ============================================================
   Tests e2e de la leçon « Le miroir magique » (symétrie axiale, #201).
   QCM mono-mode mêlant oui/non (a-t-elle un axe ? / cet axe est-il correct ?)
   et le format reflet (désigner A/B/C). Smoke : la figure SVG s’affiche, un
   choix donne un retour, sans erreur console. On itère quelques questions pour
   croiser les formats (nombre de choix variable : 2 = oui/non, 3 = reflet).
   ============================================================ */
import { test, expect } from '@playwright/test';
import { watchErrors, gotoHash } from './helpers';

test('Le miroir magique (QCM) : la figure SVG s’affiche et un choix donne un retour', async ({
	page,
}) => {
	const errors = watchErrors(page);
	await gotoHash(page, 'lecon-geo-symetrie-axiale'); // mono-mode QCM → runner direct
	await expect(page.locator('.figure svg').first()).toBeVisible();
	const choices = page.locator('.sprint-choice');
	await expect(choices.first()).toBeVisible();
	expect(await choices.count()).toBeGreaterThanOrEqual(2);
	await choices.first().click();
	await expect(page.locator('#lqcmFeedback')).toBeVisible();
	expect(errors).toEqual([]);
});

test('Le miroir magique : on enchaîne plusieurs questions à figure sans erreur', async ({
	page,
}) => {
	const errors = watchErrors(page);
	await gotoHash(page, 'lecon-geo-symetrie-axiale');
	for (let i = 0; i < 3; i++) {
		await expect(page.locator('.figure svg').first()).toBeVisible();
		await page.locator('.sprint-choice').first().click();
		await expect(page.locator('#lqcmFeedback')).toBeVisible();
		const next = page.locator('#lqcmActions button');
		if (await next.isVisible()) await next.click();
	}
	expect(errors).toEqual([]);
});
