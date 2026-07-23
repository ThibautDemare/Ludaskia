/* ============================================================
   Smoke e2e — réglage « Masquer le minuteur » / sprint sans pression
   temporelle (#223).
   Vérifie trois comportements :
   1. Témoin (réglage inactif) : #sprintTime et #sprintScore sont
      visibles dans le HUD du sprint.
   2. Option active : après avoir coché l'aménagement « Masquer le
      minuteur » dans l'espace encadrants (#234), #sprintTime et
      #sprintScore sont absents du DOM pendant le sprint, mais
      #sprintStage se rend normalement.
   3. Persistance : l'aménagement coché survit à la navigation
      (rangé dans la méta du profil).
   ============================================================ */
import { test, expect } from '@playwright/test';
import { watchErrors, gotoHash } from './helpers';

/* L'aménagement « Masquer le minuteur » vit dans l'espace encadrants (#234),
   onglet Réglages (#459). */
const SANS_CHRONO = '[data-act="set-amenagement"][data-pref="sansPressionTemporelle"]';

test('sprint normal (témoin) : minuteur et score visibles dans le HUD', async ({ page }) => {
	const errors = watchErrors(page);
	await gotoHash(page, 'sprint-config');

	await page.locator('#scLaunch').click();
	await expect(page.locator('#sprintTime')).toBeVisible();
	await expect(page.locator('#sprintScore')).toBeVisible();

	expect(errors).toEqual([]);
});

test('option active : #sprintTime et #sprintScore absents, #sprintStage présent', async ({
	page,
}) => {
	const errors = watchErrors(page);

	// Activer l'aménagement dans l'espace encadrants.
	await gotoHash(page, 'encadrant/reglages');
	const toggle = page.locator(SANS_CHRONO);
	await expect(toggle).toBeVisible();
	await toggle.check();

	// Naviguer vers la config du sprint et le lancer.
	await gotoHash(page, 'sprint-config');
	await page.locator('#scLaunch').click();

	// Le sprint tourne : la zone de question est rendue.
	await expect(page.locator('#sprintStage')).toBeVisible();

	// Le minuteur et le score live sont absents du DOM (pas juste cachés).
	await expect(page.locator('#sprintTime')).toHaveCount(0);
	await expect(page.locator('#sprintScore')).toHaveCount(0);

	expect(errors).toEqual([]);
});

test('persistance : l’aménagement « Masquer le minuteur » survit à la navigation', async ({
	page,
}) => {
	const errors = watchErrors(page);

	// Cocher l'aménagement dans l'espace encadrants.
	await gotoHash(page, 'encadrant/reglages');
	await page.locator(SANS_CHRONO).check();

	// Revenir : la méta du profil a survécu à la navigation.
	await gotoHash(page, 'encadrant/reglages');
	await expect(page.locator(SANS_CHRONO)).toBeChecked();

	expect(errors).toEqual([]);
});
