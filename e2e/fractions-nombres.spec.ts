/* ============================================================
   Fractions comme NOMBRES au CM1 (#249) — smoke e2e.
   Trois nouvelles leçons CM1-only (fraction ≥ 1) qui n'apparaissent PAS au
   CE2 : une fraction plus grande que 1 (QCM, figure « aire itérée »
   plusieurs barres empilées), je décompose une fraction (saisie, entier +
   reste), encadrer une fraction (QCM, figure demi-droite graduée 0→3).
   Pattern maison : profil CM1 seedé (comme decimaux-ecritures.spec.ts,
   mesures-decimaux.spec.ts), goto app.html#..., watchErrors + expect([]),
   sélecteurs stables (.lesson-item, .figure svg, .sprint-choice, .frac,
   #lqcmFeedback, .ans[data-answer], #btnVerify, .mark.correct).
   ============================================================ */
import { test, expect } from '@playwright/test';
import { watchErrors } from './helpers';

/* Profil CM1 : le catalogue est filtré sur CM1 → ces trois leçons (levels:
   ['cm1']) y apparaissent ; elles seraient absentes en profil CE2 par défaut. */
const SEED_CM1 = `localStorage.setItem('ludaskia_profiles', JSON.stringify({ list: [{ uuid: 'e2e', name: 'E2E', emoji: '\\uD83E\\uDD8A', updatedAt: 1, niveauReference: 'cm1' }], active: 'e2e' }));`;

test.beforeEach(async ({ page }) => {
	await page.addInitScript(SEED_CM1);
});

test('CM1 : la Numération liste les trois leçons de fractions comme nombres', async ({ page }) => {
	const errors = watchErrors(page);
	await page.goto('app.html#categorie-math-numeration', { waitUntil: 'networkidle' });
	await expect(page.locator('.lesson-item[data-id="num-frac-superieure"]')).toBeVisible();
	await expect(page.locator('.lesson-item[data-id="num-frac-decomposer"]')).toBeVisible();
	await expect(page.locator('.lesson-item[data-id="num-frac-encadrer"]')).toBeVisible();
	expect(errors).toEqual([]);
});

test('CM1 fraction plus grande que 1 (QCM) : figure aire itérée à plusieurs barres, un choix donne un retour', async ({
	page,
}) => {
	const errors = watchErrors(page);
	await page.goto('app.html#lecon-num-frac-superieure', { waitUntil: 'networkidle' }); // mono-mode QCM → direct
	// Figure « aire itérée » : plusieurs barres pleines empilées + une partielle, jamais une
	// seule barre plate (c'est l'exigence cœur de #249 : une fraction lue au-delà de 1).
	const figure = page.locator('.figure svg.figure-fraction-superieure');
	await expect(figure).toBeVisible();
	expect(await figure.locator('rect').count()).toBeGreaterThanOrEqual(4); // ≥ 2 barres empilées
	const choices = page.locator('.sprint-choice');
	await choices.first().waitFor();
	await expect(choices).toHaveCount(4);
	// Choix riches : la fraction est rendue EMPILÉE (comme les autres leçons #200), pas « a/b » à plat.
	await expect(choices.first().locator('.frac')).toBeVisible();
	await expect(choices.first()).toHaveAttribute('aria-label', /.+/);
	await choices.first().click();
	await expect(page.locator('#lqcmFeedback')).toBeVisible();
	await expect(page.locator('.sprint-choice.correct')).toBeVisible();
	expect(errors).toEqual([]);
});

test('CM1 je décompose une fraction (saisie) : le trou (entier ou numérateur) se valide', async ({
	page,
}) => {
	const errors = watchErrors(page);
	await page.goto('app.html#lecon-num-frac-decomposer', { waitUntil: 'networkidle' }); // mono-mode saisie → fiche directe
	await expect(page.locator('.fiche')).toContainText('=');
	const field = page.locator('.ans').first();
	await field.waitFor();
	const answer = await field.getAttribute('data-answer');
	await field.fill(answer ?? '');
	await page.locator('#btnVerify').click();
	await expect(page.locator('.mark.correct').first()).toBeVisible();
	expect(errors).toEqual([]);
});

test('CM1 encadrer une fraction (QCM) : demi-droite graduée 0→3, un choix donne un retour', async ({
	page,
}) => {
	const errors = watchErrors(page);
	await page.goto('app.html#lecon-num-frac-encadrer', { waitUntil: 'networkidle' }); // mono-mode QCM → direct
	// Figure demi-droite étendue (statut de nombre, #249) : bornes entières 0..3 numérotées,
	// jamais la simple bande 0→1 du CE2.
	const figure = page.locator('.figure svg.figure-fraction-demi-droite');
	await expect(figure).toBeVisible();
	await expect(figure.locator('text')).toHaveText(['0', '1', '2', '3']);
	const choices = page.locator('.sprint-choice');
	await choices.first().waitFor();
	await expect(choices).toHaveCount(4);
	await expect(choices.first()).toContainText(/entre \d+ et \d+/);
	// Choix TEXTE (pas de fraction empilée) : contrairement à la leçon « supérieure ».
	await expect(choices.first().locator('.frac')).toHaveCount(0);
	await choices.first().click();
	await expect(page.locator('#lqcmFeedback')).toBeVisible();
	await expect(page.locator('.sprint-choice.correct')).toBeVisible();
	expect(errors).toEqual([]);
});
