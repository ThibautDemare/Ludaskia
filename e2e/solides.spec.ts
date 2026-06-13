/* ============================================================
   Tests e2e de la Géométrie — les solides (#103) : reconnaissance
   (schéma SVG + QCM / saisie) et propriétés (QCM textuel).
   ============================================================ */
import { test, expect } from '@playwright/test';
import { watchErrors, gotoHash } from './helpers';

test('Reconnaître un solide (QCM) : un schéma SVG et 4 noms, un clic donne un retour', async ({
	page,
}) => {
	const errors = watchErrors(page);
	await gotoHash(page, 'lecon-geo-solides-reconnaitre'); // mode conseillé = QCM → runner direct
	await expect(page.locator('.figure svg').first()).toBeVisible();
	// La série compte PLUSIEURS questions (régression : énoncé constant dédupé à 1).
	await expect(page.locator('.lqcm-progress-lab')).toHaveText(/Question 1 \/ ([2-9]|\d\d)/);
	await expect(page.locator('.sprint-choice')).toHaveCount(4);
	await page.locator('.sprint-choice').first().click();
	await expect(page.locator('#lqcmFeedback')).toBeVisible();
	expect(errors).toEqual([]);
});

test('Reconnaître un solide (saisie) : la fiche montre le schéma et corrige le nom', async ({
	page,
}) => {
	const errors = watchErrors(page);
	await gotoHash(page, 'mode-geo-solides-reconnaitre'); // écran de choix de mode
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

test('Propriétés des solides (QCM) : question textuelle, 4 choix, retour immédiat', async ({
	page,
}) => {
	const errors = watchErrors(page);
	await gotoHash(page, 'lecon-geo-solides-proprietes'); // mono-mode QCM → runner direct
	await expect(page.locator('.sprint-choice')).toHaveCount(4);
	await page.locator('.sprint-choice').first().click();
	await expect(page.locator('#lqcmFeedback')).toBeVisible();
	expect(errors).toEqual([]);
});
