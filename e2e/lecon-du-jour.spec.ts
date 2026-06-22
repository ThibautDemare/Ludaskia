/* ============================================================
   Smoke e2e — carte « leçon du jour » (#208).
   La carte de l'accueil (rangée `.cards`, #leconDuJour) : rendu, lancement de la
   leçon proposée, et contournement « Voir une autre leçon ». Profil neuf (CE2 via
   helpers) → la 1re leçon de l'ordre est `num-comparer`.
   ============================================================ */
import { test, expect } from '@playwright/test';
import { watchErrors, gotoHash } from './helpers';

test('la carte leçon du jour propose la 1re leçon de l’ordre', async ({ page }) => {
	const errors = watchErrors(page);
	await gotoHash(page, 'accueil');
	const carte = page.locator('#leconDuJour');
	await expect(carte).toBeVisible();
	// Profil neuf CE2 → tête de l'ordre maths = « Je compare les nombres ».
	await expect(carte).toHaveAttribute('data-lesson', 'num-comparer');
	await expect(carte.locator('.lj-title')).toHaveText('Je compare les nombres');
	expect(errors).toEqual([]);
});

test('cliquer la carte lance la leçon proposée', async ({ page }) => {
	const errors = watchErrors(page);
	await gotoHash(page, 'accueil');
	await page.locator('#leconDuJour .lj-title').click();
	// startLecon route vers la leçon (mono-mode) ou l'écran de choix de mode.
	await expect(page).toHaveURL(/#(mode|lecon)-num-comparer/);
	expect(errors).toEqual([]);
});

test('« Voir une autre leçon » propose la suivante du fil', async ({ page }) => {
	const errors = watchErrors(page);
	await gotoHash(page, 'accueil');
	const carte = page.locator('#leconDuJour');
	await expect(carte).toHaveAttribute('data-lesson', 'num-comparer');
	await page.locator('#leconDuJour .lj-autre').click();
	// Entrelacement 1:1 maths/français → la suivante est la 1re leçon de français.
	await expect(carte).toHaveAttribute('data-lesson', 'fr-gram-ponctuation');
	expect(errors).toEqual([]);
});
