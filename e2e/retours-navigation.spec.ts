/* ============================================================
   Smoke e2e — retours de navigation (#179).
   (a) Boutons « ← Retour » en HAUT du contenu dans les vues
       catégories / catégorie : remontent d'un cran (sans scroll).
   (b) Fin de leçon en mode saisie : bouton « ← Retour à la
       catégorie » ramène à la vue catégorie ; « Quitter » → accueil.
   ============================================================ */
import { test, expect } from '@playwright/test';
import { watchErrors, gotoHash } from './helpers';

test("vue catégorie : le bouton du haut remonte d'un cran vers la matière", async ({ page }) => {
	const errors = watchErrors(page);
	await gotoHash(page, 'categorie-math-calcul-mental');
	const back = page.locator('#backCategorieTop');
	await expect(back).toBeVisible();
	await expect(back).toHaveText(/Retour aux catégories/);
	await back.click();
	// Remonte vers la vue « catégories d'une matière » (la matière parente).
	await expect(page.locator('#categories')).toBeVisible();
	expect(errors).toEqual([]);
});

test('vue catégories : le bouton du haut remonte vers les matières', async ({ page }) => {
	const errors = watchErrors(page);
	await gotoHash(page, 'matiere-math');
	const back = page.locator('#backMatieresTop');
	await expect(back).toBeVisible();
	await expect(back).toHaveText(/Retour aux matières/);
	await back.click();
	await expect(page.locator('#matieres')).toBeVisible();
	expect(errors).toEqual([]);
});

test("vue matières : le bouton du haut ramène à l'accueil", async ({ page }) => {
	const errors = watchErrors(page);
	await gotoHash(page, 'matieres');
	const back = page.locator('#backHomeMatieresTop');
	await expect(back).toBeVisible();
	await expect(back).toHaveText(/Retour à l'accueil/);
	await back.click();
	await expect(page.locator('#home')).toBeVisible();
	expect(errors).toEqual([]);
});

test('fin de leçon (saisie) : « Retour à la catégorie » ramène à la vue catégorie', async ({
	page,
}) => {
	const errors = watchErrors(page);
	await gotoHash(page, 'lecon-math-tables-addition');
	const fields = page.locator('.ans');
	await fields.first().waitFor();
	// Remplir toutes les réponses correctement pour terminer la leçon.
	const count = await fields.count();
	for (let i = 0; i < count; i++) {
		const ans = (await fields.nth(i).getAttribute('data-answer')) ?? '';
		await fields.nth(i).fill(ans);
	}
	await page.locator('#btnVerify').click();
	// Un sans-faute peut déclencher la modale de niveau (puis célébration) :
	// la fermer avant d'atteindre le bandeau, sinon elle intercepte les clics.
	for (const ok of ['#levelupOk', '#celebrateOk']) {
		const btn = page.locator(ok);
		if (await btn.isVisible().catch(() => false)) await btn.click();
	}
	// Le bandeau résultat propose le retour catégorie À CÔTÉ de « Quitter ».
	const back = page.locator('#btnBackCategorie');
	await expect(back).toBeVisible();
	await expect(page.locator('#btnQuitter')).toBeVisible();
	await back.click();
	await expect(page.locator('#categorie')).toBeVisible();
	await expect(page.locator('.lesson-item').first()).toBeVisible();
	expect(errors).toEqual([]);
});
