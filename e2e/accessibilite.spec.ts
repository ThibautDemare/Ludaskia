/* ============================================================
   Accessibilité (#42) : confort de lecture + réglages de lecture vocale.
   Le BOUTON « Écouter » dépend d'une voix FR de l'appareil — absente en
   Chromium headless (dicteeDisponible() faux → pas de bouton). On teste donc
   le déterministe : le confort de lecture (classe + espacement, persistance) et
   le bloc Préférences (réglage auto + statut de la lecture vocale).
   ============================================================ */
import { test, expect } from '@playwright/test';
import { watchErrors, gotoHash } from './helpers';

test('Confort de lecture : classe, espacement et persistance', async ({ page }) => {
	const errors = watchErrors(page);
	await gotoHash(page, 'profils');

	const toggle = page.locator('#prefConfort');
	await expect(toggle).toBeVisible();
	await expect(page.locator('html')).not.toHaveClass(/confort-lecture/);

	await toggle.check();
	await expect(page.locator('html')).toHaveClass(/confort-lecture/);
	// L'espacement inter-lettres devient non nul (Nunito gardée, juste aérée).
	const ls = await page
		.locator('body')
		.evaluate((el) => parseFloat(getComputedStyle(el).letterSpacing) || 0);
	expect(ls).toBeGreaterThan(0);

	// Réglage rangé dans la méta de profil → survit au rechargement.
	await gotoHash(page, 'profils');
	await expect(page.locator('html')).toHaveClass(/confort-lecture/);
	await expect(page.locator('#prefConfort')).toBeChecked();

	expect(errors).toEqual([]);
});

test('Préférences : réglage de lecture auto + statut de la lecture vocale', async ({ page }) => {
	const errors = watchErrors(page);
	await gotoHash(page, 'profils');

	await expect(page.locator('#prefLectureAuto')).toHaveCount(1);
	await expect(page.locator('.pref-tts-statut')).toBeVisible();

	expect(errors).toEqual([]);
});
