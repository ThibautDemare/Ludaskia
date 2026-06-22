/* ============================================================
   Smoke e2e — réglage « Masquer le minuteur » / sprint sans pression
   temporelle (#223).
   Vérifie trois comportements :
   1. Témoin (réglage inactif) : #sprintTime et #sprintScore sont
      visibles dans le HUD du sprint.
   2. Option active : après avoir coché #prefSansChrono dans les
      préférences profil, #sprintTime et #sprintScore sont absents du
      DOM pendant le sprint, mais #sprintStage se rend normalement.
   3. Persistance : le réglage coché survit à un rechargement de
      l'écran Profils (rangé dans la méta du profil).
   ============================================================ */
import { test, expect } from '@playwright/test';
import { watchErrors, gotoHash } from './helpers';

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

	// Activer le réglage dans l'écran Profils.
	await gotoHash(page, 'profils');
	const toggle = page.locator('#prefSansChrono');
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

test('persistance : #prefSansChrono reste coché après retour sur Profils', async ({ page }) => {
	const errors = watchErrors(page);

	// Cocher le réglage.
	await gotoHash(page, 'profils');
	await page.locator('#prefSansChrono').check();

	// Revenir sur l'écran Profils : la méta du profil a survécu à la navigation.
	await gotoHash(page, 'profils');
	await expect(page.locator('#prefSansChrono')).toBeChecked();

	expect(errors).toEqual([]);
});
