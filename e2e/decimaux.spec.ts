/* ============================================================
   Nombres décimaux CM1 (#246) — smoke e2e.
   En profil CM1 : la Numération liste les leçons de décimaux ; la numération de
   position décimale, la comparaison et l'encadrement se jouent en saisie et se
   valident ; les QCM (rôle du zéro, rangement) se rendent et marquent la bonne
   réponse. Pattern maison : goto app.html#..., watchErrors + expect([]),
   sélecteurs stables (#btnVerify, .lesson-item, .ans[data-answer], .mark.correct,
   .sprint-choice.correct, .lqcm-ok).
   ============================================================ */
import { test, expect } from '@playwright/test';
import { watchErrors, seedAideVue } from './helpers';

/* Profil CM1 : le catalogue est filtré sur CM1 → les leçons de décimaux apparaissent. */
const SEED_CM1 = `localStorage.setItem('ludaskia_profiles', JSON.stringify({ list: [{ uuid: 'e2e', name: 'E2E', emoji: '\\uD83E\\uDD8A', updatedAt: 1, niveauReference: 'cm1' }], active: 'e2e' }));`;

test.beforeEach(async ({ page }) => {
	await seedAideVue(page); // le mode tuiles déclenche l'aide au 1er lancement
	await page.addInitScript(SEED_CM1);
});

test('CM1 : la Numération liste les leçons de nombres décimaux', async ({ page }) => {
	const errors = watchErrors(page);
	await page.goto('app.html#categorie-math-numeration', { waitUntil: 'networkidle' });
	await expect(page.locator('.lesson-item[data-id="num-dec-position"]')).toBeVisible();
	await expect(page.locator('.lesson-item[data-id="num-dec-comparer"]')).toBeVisible();
	await expect(page.locator('.lesson-item[data-id="num-dec-ranger"]')).toBeVisible();
	expect(errors).toEqual([]);
});

test('CM1 position décimale : on tape le chiffre du rang, validé', async ({ page }) => {
	const errors = watchErrors(page);
	await page.goto('app.html#lecon-num-dec-position', { waitUntil: 'networkidle' }); // mono-mode → fiche directe
	const field = page.locator('.ans').first();
	await field.waitFor();
	await expect(page.locator('.fiche')).toContainText('chiffre des');
	const good = await field.getAttribute('data-answer');
	await field.fill(good ?? '');
	await page.locator('#btnVerify').click();
	await expect(page.locator('.mark.correct').first()).toBeVisible();
	expect(errors).toEqual([]);
});

test('CM1 comparer décimaux (saisie) : on tape le signe, validé', async ({ page }) => {
	const errors = watchErrors(page);
	await page.goto('app.html#lecon-num-dec-comparer', { waitUntil: 'networkidle' }); // saisie par défaut
	const field = page.locator('.ans').first();
	await field.waitFor();
	await expect(page.locator('.fiche')).toContainText('Compare');
	const expected = await field.getAttribute('data-answer');
	expect(['<', '=', '>']).toContain(expected);
	await field.fill(expected ?? '');
	await page.locator('#btnVerify').click();
	await expect(page.locator('.mark.correct').first()).toBeVisible();
	expect(errors).toEqual([]);
});

test('CM1 encadrer décimaux (saisie) : on tape l’entier, validé', async ({ page }) => {
	const errors = watchErrors(page);
	await page.goto('app.html#lecon-num-dec-encadrer', { waitUntil: 'networkidle' });
	const field = page.locator('.ans').first();
	await field.waitFor();
	await expect(page.locator('.fiche')).toContainText('juste');
	const good = await field.getAttribute('data-answer');
	await field.fill(good ?? '');
	await page.locator('#btnVerify').click();
	await expect(page.locator('.mark.correct').first()).toBeVisible();
	expect(errors).toEqual([]);
});

test('CM1 rôle du zéro (QCM) : « le même nombre ? », la bonne réponse est marquée', async ({
	page,
}) => {
	const errors = watchErrors(page);
	await page.goto('app.html#lecon-num-dec-egales', { waitUntil: 'networkidle' }); // mono-mode QCM → direct
	const choices = page.locator('.sprint-choice');
	await choices.first().waitFor();
	await expect(choices).toHaveCount(2);
	// On calcule la bonne réponse depuis l'énoncé (les deux écritures affichées).
	const enonce = await page.locator('.sprint-q-qcm').innerText();
	const nums = [...enonce.matchAll(/(\d+),(\d+)/g)].map((m) => Number(`${m[1]}.${m[2]}`));
	expect(nums.length).toBe(2);
	const meme = nums[0] === nums[1];
	await page.locator('.sprint-choice', { hasText: meme ? 'Oui' : 'Non' }).click();
	await expect(page.locator('.lqcm-ok')).toContainText('Bravo');
	expect(errors).toEqual([]);
});

test('CM1 ranger décimaux (QCM) : la leçon se rend et marque la bonne suite', async ({ page }) => {
	const errors = watchErrors(page);
	await page.goto('app.html#lecon-num-dec-ranger', { waitUntil: 'networkidle' });
	const choices = page.locator('.sprint-choice');
	await choices.first().waitFor();
	// Consigne d'action visible en permanence (« Range du plus petit... ») + question.
	await expect(page.locator('.lqcm-consigne')).toContainText('Range');
	await expect(page.locator('.sprint-q-qcm')).toContainText('rangée');
	await choices.first().click();
	// La bonne suite est toujours mise en évidence (classe .correct), quelle que soit
	// l'option tapée.
	await expect(page.locator('.sprint-choice.correct')).toBeVisible();
	expect(errors).toEqual([]);
});
