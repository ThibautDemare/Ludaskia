/* ============================================================
   Smoke e2e — Fractions CE2 (#200) : six leçons de la rubrique
   « Fractions » dans la catégorie Numération.
   ============================================================ */
import { test, expect } from '@playwright/test';
import { watchErrors, gotoHash } from './helpers';

/* ---- Catégorie ---- */

test('la catégorie Numération liste les leçons de fractions', async ({ page }) => {
	const errors = watchErrors(page);
	await gotoHash(page, 'categorie-math-numeration');
	await expect(page.locator('[data-id="num-frac-sens"]')).toBeVisible();
	await expect(page.locator('[data-id="num-frac-collection"]')).toBeVisible();
	await expect(page.locator('[data-id="num-frac-bande"]')).toBeVisible();
	expect(errors).toEqual([]);
});

/* ---- Leçon 1 : sens (QCM, figure barre SVG) ---- */

test('Lire une fraction (QCM) : figure barre SVG, 4 choix, un clic donne un retour', async ({
	page,
}) => {
	const errors = watchErrors(page);
	await gotoHash(page, 'lecon-num-frac-sens'); // mono-mode QCM → runner direct
	await expect(page.locator('.figure svg').first()).toBeVisible();
	const choices = page.locator('.sprint-choice');
	await choices.first().waitFor();
	expect(await choices.count()).toBe(4);
	// Choix riches (#200) : la fraction est rendue EMPILÉE (barre horizontale),
	// pas « 6/8 » à plat, et le bouton porte un libellé parlé pour l'accessibilité.
	await expect(choices.first().locator('.frac')).toBeVisible();
	await expect(choices.first()).toHaveAttribute('aria-label', /.+/);
	await choices.first().click();
	await expect(page.locator('#lqcmFeedback')).toBeVisible();
	await expect(page.locator('#lqcmNext')).toBeVisible();
	expect(errors).toEqual([]);
});

/* ---- Leçon 2 : fraction d'une collection (saisie numérique, figure collection SVG) ---- */

test("Fraction d'une collection (saisie) : figure SVG affichée, bonne réponse validée", async ({
	page,
}) => {
	const errors = watchErrors(page);
	await gotoHash(page, 'lecon-num-frac-collection'); // mono-mode saisie → fiche directe
	await expect(page.locator('.figure svg').first()).toBeVisible();
	const field = page.locator('.ans').first();
	await field.waitFor();
	const answer = await field.getAttribute('data-answer');
	await field.fill(answer ?? '');
	await page.locator('#btnVerify').click();
	await expect(page.locator('.mark.correct').first()).toBeVisible();
	expect(errors).toEqual([]);
});

/* ---- Leçon 4 : fractions égales (QCM oui/non, figure deux barres) ---- */

test('Fractions égales (QCM deux barres) : figure SVG, 2 choix, retour immédiat', async ({
	page,
}) => {
	const errors = watchErrors(page);
	await gotoHash(page, 'lecon-num-frac-egalites'); // mono-mode QCM → runner direct
	await expect(page.locator('.figure svg').first()).toBeVisible();
	const choices = page.locator('.sprint-choice');
	await choices.first().waitFor();
	expect(await choices.count()).toBe(2);
	await choices.first().click();
	await expect(page.locator('#lqcmFeedback')).toBeVisible();
	expect(errors).toEqual([]);
});
