/* ============================================================
   Calcul mental CM1 — divisibilité 2/5/10 & ordre de grandeur d'un produit (#250)
   — smoke e2e.
   Deux leçons QCM CM1-only (levels ['cm1']) : elles apparaissent en profil CM1,
   pas en CE2. Pattern maison : profil CM1 seedé (comme fractions-nombres.spec.ts),
   goto app.html#..., watchErrors + expect([]), sélecteurs stables (.lesson-item,
   .sprint-choice, #lqcmFeedback, .sprint-choice.correct).
   ============================================================ */
import { test, expect } from '@playwright/test';
import { watchErrors } from './helpers';

/* Profil CM1 : le catalogue est filtré sur CM1 → ces deux leçons y apparaissent
   (absentes en profil CE2 par défaut). */
const SEED_CM1 = `localStorage.setItem('ludaskia_profiles', JSON.stringify({ list: [{ uuid: 'e2e', name: 'E2E', emoji: '\\uD83E\\uDD8A', updatedAt: 1, niveauReference: 'cm1' }], active: 'e2e' }));`;

test.beforeEach(async ({ page }) => {
	await page.addInitScript(SEED_CM1);
});

test('CM1 : le Calcul mental liste les deux leçons #250', async ({ page }) => {
	const errors = watchErrors(page);
	await page.goto('app.html#categorie-math-calcul-mental', { waitUntil: 'networkidle' });
	await expect(page.locator('.lesson-item[data-id="math-divisibilite-2-5-10"]')).toBeVisible();
	await expect(page.locator('.lesson-item[data-id="math-ordre-grandeur-produit"]')).toBeVisible();
	expect(errors).toEqual([]);
});

test('CM1 divisibilité (QCM oui/non) : deux choix, un clic donne un retour', async ({ page }) => {
	const errors = watchErrors(page);
	await page.goto('app.html#lecon-math-divisibilite-2-5-10', { waitUntil: 'networkidle' }); // mono-mode QCM → direct
	await expect(page.locator('.sprint-q')).toContainText('divis'); // « divisible par » ou « diviseur de »
	const choices = page.locator('.sprint-choice');
	await choices.first().waitFor();
	await expect(choices).toHaveCount(2); // Oui / Non
	await choices.first().click();
	await expect(page.locator('#lqcmFeedback')).toBeVisible();
	await expect(page.locator('.sprint-choice.correct')).toBeVisible();
	expect(errors).toEqual([]);
});

test('CM1 ordre de grandeur (QCM) : trois classes de nombres, un clic donne un retour', async ({
	page,
}) => {
	const errors = watchErrors(page);
	await page.goto('app.html#lecon-math-ordre-grandeur-produit', { waitUntil: 'networkidle' }); // mono-mode QCM → direct
	await expect(page.locator('.sprint-q')).toContainText('le résultat sera');
	const choices = page.locator('.sprint-choice');
	await choices.first().waitFor();
	await expect(choices).toHaveCount(3); // 3 classes de nombres espacées d'un facteur 10
	await choices.first().click();
	await expect(page.locator('#lqcmFeedback')).toBeVisible();
	await expect(page.locator('.sprint-choice.correct')).toBeVisible();
	expect(errors).toEqual([]);
});
