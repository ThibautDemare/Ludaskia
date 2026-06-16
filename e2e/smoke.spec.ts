/* ============================================================
   Smoke tests e2e (#129) : navigation par hash et rendu réel,
   ce que les tests Vitest (logique pure) ne couvrent pas.
   Contenu testé = celui présent sur `main` (calcul mental,
   catégories vides, sprint) — pas les leçons en cours de PR.
   ============================================================ */
import { test, expect } from '@playwright/test';
import { watchErrors, gotoHash } from './helpers';

test("l'accueil se charge sans erreur", async ({ page }) => {
	const errors = watchErrors(page);
	await gotoHash(page, 'accueil');
	await expect(page.locator('#btnVerify')).toBeHidden(); // pas en exercice
	// L'identité est portée par l'en-tête (logo « arbre » dans sa pastille, #182).
	await expect(page.locator('.toolbar-logo img')).toBeVisible();
	// Le bloc d'accueil n'affiche plus le nom « Ludaskia » (plus de doublon).
	await expect(page.locator('#home .big')).not.toContainText('Ludaskia');
	// Sur mobile (Pixel 5, < 600px), la barre reste sur une ligne : le mot
	// « Ludaskia » est masqué, seul le logo porte l'identité.
	await expect(page.locator('.toolbar-title')).toBeHidden();
	expect(errors).toEqual([]);
});

test('une catégorie inconnue retombe proprement sur les matières', async ({ page }) => {
	// Repli défensif d'un identifiant de catégorie INCONNU (absent du catalogue) :
	// retour aux matières. À distinguer d'une catégorie connue mais VIDE
	// (ex. Grammaire/Vocabulaire, #107), qui affiche « Bientôt disponible ».
	const errors = watchErrors(page);
	await gotoHash(page, 'categorie-math-inexistant');
	await expect(page.locator('#matieres')).toBeVisible();
	expect(errors).toEqual([]);
});

test('une catégorie peuplée liste ses leçons', async ({ page }) => {
	const errors = watchErrors(page);
	await gotoHash(page, 'categorie-math-calcul-mental');
	await expect(page.locator('.lesson-item').first()).toBeVisible();
	expect(await page.locator('.lesson-item').count()).toBeGreaterThan(1);
	expect(errors).toEqual([]);
});

test('leçon de calcul mental : bonne réponse validée, mauvaise rejetée', async ({ page }) => {
	const errors = watchErrors(page);
	await gotoHash(page, 'lecon-math-tables-addition');
	const fields = page.locator('.ans');
	await fields.first().waitFor();
	const good = await fields.first().getAttribute('data-answer');
	await fields.first().fill(good ?? '');
	await fields.nth(1).fill('999999'); // réponse volontairement fausse
	await page.locator('#btnVerify').click();
	await expect(page.locator('.mark.correct').first()).toBeVisible();
	await expect(page.locator('.mark.wrong').first()).toBeVisible();
	expect(errors).toEqual([]);
});

test('le sprint démarre avec son compte à rebours', async ({ page }) => {
	const errors = watchErrors(page);
	await gotoHash(page, 'sprint');
	await expect(page.locator('#sprintTime')).toBeVisible();
	await expect(page.locator('#sprintTime')).toHaveText(/0[45]:\d\d/); // ~05:00
	expect(errors).toEqual([]);
});

test('Sprint : la touche Entrée enchaîne après la correction', async ({ page }) => {
	const errors = watchErrors(page);
	await gotoHash(page, 'sprint');

	// On veut une question À SAISIE (maths) : une bonne réponse enchaîne seule (✓),
	// seule une erreur affiche le bouton « Continuer » qu'on veut tester au clavier.
	// Les tirages mêlent saisie et QCM, on relance le sprint jusqu'à une saisie.
	let typed = false;
	for (let i = 0; i < 25 && !typed; i++) {
		await page.locator('#sprintStage').waitFor();
		if (await page.locator('#sprintInput').count()) {
			typed = true;
			break;
		}
		await gotoHash(page, 'accueil');
		await gotoHash(page, 'sprint');
	}
	expect(typed).toBeTruthy();

	// Réponse volontairement fausse → correction + bouton « Continuer » (chrono en pause).
	await page.locator('#sprintInput').fill('999999');
	await page.locator('#sprintInput').press('Enter');
	await expect(page.locator('#sprintContinue')).toBeVisible();

	// Entrée enchaîne sur la question suivante, sans cliquer le bouton.
	await page.locator('#sprintContinue').press('Enter');
	await expect(page.locator('#sprintContinue')).toBeHidden();
	expect(errors).toEqual([]);
});
