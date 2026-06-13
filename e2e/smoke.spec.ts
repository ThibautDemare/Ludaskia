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
	expect(errors).toEqual([]);
});

test('une catégorie sans leçon affiche « Bientôt disponible »', async ({ page }) => {
	const errors = watchErrors(page);
	await gotoHash(page, 'categorie-math-geometrie'); // encore vide (Géométrie)
	await expect(page.locator('.cat-empty')).toBeVisible();
	await expect(page.getByText('Bientôt disponible')).toBeVisible();
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
