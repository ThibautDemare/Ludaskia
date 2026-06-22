/* ============================================================
   Smoke e2e — périmètre du sprint (#208, lot 2).
   Deux périmètres : « Tout » et « Ce que je connais déjà » (leçons rencontrées).
   On amorce 2 leçons de maths comme « déjà vues » → le sélecteur apparaît, le
   périmètre par défaut est « déjà vues », et le français (rien vu) est grisé.
   ============================================================ */
import { test, expect } from '@playwright/test';
import { watchErrors, gotoHash } from './helpers';

/* Seede 2 leçons de maths comme rencontrées (clé namespacée @ce2, profil e2e). */
const SEED_SEEN = `localStorage.setItem('e2e/ludaskia_lessonFirstSeen', JSON.stringify({
  'math-tables-addition@ce2': 1700000000000,
  'math-doubles@ce2': 1700000000000
}));`;

test('le sélecteur de périmètre apparaît quand seules quelques leçons sont vues', async ({
	page,
}) => {
	const errors = watchErrors(page);
	await page.addInitScript(SEED_SEEN);
	await gotoHash(page, 'sprint-config');

	// Le choix de périmètre est proposé (mélange vu / pas-vu).
	await expect(page.locator('.sc-perimetre')).toBeVisible();
	// Défaut adaptatif = « Ce que je connais déjà ».
	await expect(page.locator('.sc-scope[value="seen"]')).toBeChecked();
	// Périmètre « déjà vues » : « Toutes les matières » ne compte que les 2 leçons vues.
	await expect(page.locator('.sc-option', { hasText: 'Toutes les matières' })).toContainText(
		'2 leçons',
	);
	// Le français (rien de vu) est présent mais grisé (option vide, non sélectionnable).
	await expect(page.locator('.sc-option-disabled').first()).toBeVisible();
	expect(errors).toEqual([]);
});

test('basculer sur « Tout » réintègre toutes les leçons éligibles', async ({ page }) => {
	const errors = watchErrors(page);
	await page.addInitScript(SEED_SEEN);
	await gotoHash(page, 'sprint-config');

	await page.locator('.sc-scope[value="all"]').check();
	// En mode « Tout », « Toutes les matières » compte bien plus que 2 leçons.
	await expect(page.locator('.sc-option', { hasText: 'Toutes les matières' })).not.toContainText(
		'2 leçons',
	);
	// Le sprint démarre sans erreur.
	await page.locator('#scLaunch').click();
	await expect(page.locator('#sprintTime')).toBeVisible();
	expect(errors).toEqual([]);
});

test('périmètre « déjà vues » : le sprint démarre sur les leçons rencontrées', async ({ page }) => {
	const errors = watchErrors(page);
	await page.addInitScript(SEED_SEEN);
	await gotoHash(page, 'sprint-config');

	await expect(page.locator('.sc-scope[value="seen"]')).toBeChecked();
	await page.locator('#scLaunch').click();
	await expect(page.locator('#sprintTime')).toBeVisible();
	// Une première question est posée (saisie ou QCM) sans erreur de rendu.
	await expect(page.locator('#sprintStage')).toBeVisible();
	expect(errors).toEqual([]);
});
