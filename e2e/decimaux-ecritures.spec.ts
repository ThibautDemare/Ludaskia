/* ============================================================
   Écritures des décimaux CM1 (#247) — smoke e2e.
   En profil CM1 : la Numération liste les leçons ; la leçon « grille » se rend avec
   sa figure SVG et se joue en QCM ; la leçon « fraction décimale > 1 » se joue en
   QCM ; la décomposition se joue en saisie et se valide. Pattern maison : goto
   app.html#..., watchErrors + expect([]), sélecteurs stables (#btnVerify,
   .lesson-item, .ans[data-answer], .mark.correct, .sprint-choice.correct).
   ============================================================ */
import { test, expect } from '@playwright/test';
import { watchErrors } from './helpers';

/* Profil CM1 : le catalogue est filtré sur CM1 → les leçons de décimaux apparaissent. */
const SEED_CM1 = `localStorage.setItem('ludaskia_profiles', JSON.stringify({ list: [{ uuid: 'e2e', name: 'E2E', emoji: '\\uD83E\\uDD8A', updatedAt: 1, niveauReference: 'cm1' }], active: 'e2e' }));`;

test.beforeEach(async ({ page }) => {
	await page.addInitScript(SEED_CM1);
});

test('CM1 : la Numération liste les leçons d’écritures des décimaux', async ({ page }) => {
	const errors = watchErrors(page);
	await page.goto('app.html#categorie-math-numeration', { waitUntil: 'networkidle' });
	await expect(page.locator('.lesson-item[data-id="num-dec-grille"]')).toBeVisible();
	await expect(page.locator('.lesson-item[data-id="num-dec-frac-superieure"]')).toBeVisible();
	await expect(page.locator('.lesson-item[data-id="num-dec-decomposer"]')).toBeVisible();
	expect(errors).toEqual([]);
});

test('CM1 grille (QCM) : la figure SVG se rend, un choix donne un retour immédiat', async ({
	page,
}) => {
	const errors = watchErrors(page);
	await page.goto('app.html#lecon-num-dec-grille', { waitUntil: 'networkidle' }); // mono-mode QCM → direct
	await expect(page.locator('.figure svg').first()).toBeVisible();
	const choices = page.locator('.sprint-choice');
	await choices.first().waitFor();
	await expect(choices).toHaveCount(4);
	await choices.first().click();
	// La bonne réponse est toujours mise en évidence (classe .correct), quel que soit le clic.
	await expect(page.locator('.sprint-choice.correct')).toBeVisible();
	await expect(page.locator('#lqcmFeedback')).toBeVisible();
	expect(errors).toEqual([]);
});

test('CM1 fraction décimale > 1 (QCM) : la leçon se rend et marque la bonne réponse', async ({
	page,
}) => {
	const errors = watchErrors(page);
	await page.goto('app.html#lecon-num-dec-frac-superieure', { waitUntil: 'networkidle' });
	const choices = page.locator('.sprint-choice');
	await choices.first().waitFor();
	await expect(page.locator('.sprint-q-qcm')).toContainText('égale à');
	await choices.first().click();
	await expect(page.locator('.sprint-choice.correct')).toBeVisible();
	expect(errors).toEqual([]);
});

test('CM1 décomposer (saisie) : on tape l’entier du trou, validé', async ({ page }) => {
	const errors = watchErrors(page);
	await page.goto('app.html#lecon-num-dec-decomposer', { waitUntil: 'networkidle' }); // mono-mode → fiche directe
	const field = page.locator('.ans').first();
	await field.waitFor();
	await expect(page.locator('.fiche')).toContainText('=');
	const good = await field.getAttribute('data-answer');
	await field.fill(good ?? '');
	await page.locator('#btnVerify').click();
	await expect(page.locator('.mark.correct').first()).toBeVisible();
	expect(errors).toEqual([]);
});

test('CM1 décomposer : le trou d’un rang décimal se rend en fraction empilée et se valide', async ({
	page,
}) => {
	const errors = watchErrors(page);
	// Le rang troué varie (entier / dixième / centième, cf. decomposeDecFact dans
	// data/maths/decimaux-ecritures.ts) ; on recharge jusqu'à tomber sur un trou de rang
	// décimal (dixième OU centième, 6/8 ≈ 75 % par tirage), qui se rend comme un champ DANS
	// le numérateur d'une fraction.
	// `page.goto` vers une URL IDENTIQUE à l'URL courante est un no-op côté Chromium (aucune
	// navigation, aucun re-rendu, cf. mesures-decimaux.spec.ts et helpers.ts/gotoHash) : sans
	// `.reload()` explicite, les « relances » ci-dessous revoyaient TOUTES le tirage du tout
	// premier chargement — la boucle ne retirait donc jamais qu'UN seul tirage réel, à ~25 %
	// de risque d'échec par run (l'inverse du taux de succès du rang décimal). Avec un vrai
	// rechargement à chaque tentative, 12 tentatives ramènent le résidu à 0,25¹² ≈ 6×10⁻⁸.
	for (let i = 0; i < 12; i++) {
		await page.goto('app.html#lecon-num-dec-decomposer', { waitUntil: 'networkidle' });
		await page.reload({ waitUntil: 'networkidle' });
		if (await page.locator('.frac .frac-num-input').count()) break;
	}
	const num = page.locator('.frac .frac-num-input').first();
	await num.waitFor();
	const good = await num.getAttribute('data-answer');
	await num.fill(good ?? '');
	await page.locator('#btnVerify').click();
	await expect(page.locator('.mark.correct').first()).toBeVisible();
	expect(errors).toEqual([]);
});

test('CM1 recomposer (QCM) : la somme se rend, la bonne réponse est marquée', async ({ page }) => {
	const errors = watchErrors(page);
	await page.goto('app.html#lecon-num-dec-recomposer', { waitUntil: 'networkidle' });
	const choices = page.locator('.sprint-choice');
	await choices.first().waitFor();
	await expect(page.locator('.sprint-q-qcm')).toContainText('=');
	await choices.first().click();
	await expect(page.locator('.sprint-choice.correct')).toBeVisible();
	expect(errors).toEqual([]);
});
