/* ============================================================
   Tests e2e de la leçon « Le cercle » (#102) : rayon/diamètre et
   vocabulaire, avec support visuel SVG (cercle coté).
   ============================================================ */
import { test, expect } from '@playwright/test';
import { watchErrors, gotoHash } from './helpers';

test('Le cercle (QCM) : le cercle SVG s’affiche et un choix donne un retour', async ({ page }) => {
	const errors = watchErrors(page);
	await gotoHash(page, 'lecon-geom-cercle'); // mode conseillé = QCM → runner direct
	await expect(page.locator('.figure svg').first()).toBeVisible();
	await expect(page.locator('.sprint-choice')).toHaveCount(4);
	await page.locator('.sprint-choice').first().click();
	await expect(page.locator('#lqcmFeedback')).toBeVisible();
	expect(errors).toEqual([]);
});

test('Le cercle (saisie) : la fiche montre le cercle et corrige la réponse', async ({ page }) => {
	const errors = watchErrors(page);
	await gotoHash(page, 'mode-geom-cercle'); // écran de choix de mode
	await page.locator('.mode-btn[data-mode="saisie"]').click();
	await expect(page.locator('.figure svg').first()).toBeVisible();
	const field = page.locator('.ans').first();
	await field.waitFor();
	const good = await field.getAttribute('data-answer');
	await field.fill(good ?? '');
	await page.locator('#btnVerify').click();
	await expect(page.locator('.mark.correct').first()).toBeVisible();
	expect(errors).toEqual([]);
});
