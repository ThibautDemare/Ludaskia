/* ============================================================
   Tests e2e de la Numération (#98) : les deux modes (saisie au
   clavier, tuiles à déplacer) bout en bout dans le navigateur.
   ============================================================ */
import { test, expect } from '@playwright/test';
import { watchErrors, gotoHash } from './helpers';

test('Numération : la catégorie liste ses leçons', async ({ page }) => {
	const errors = watchErrors(page);
	await gotoHash(page, 'categorie-math-numeration');
	await expect(page.locator('.lesson-item').first()).toBeVisible();
	// comparer/encadrer/intercaler (#98) + valeur de position/décomposition (#94)
	expect(await page.locator('.lesson-item').count()).toBeGreaterThanOrEqual(3);
	expect(errors).toEqual([]);
});

test('Numération : taper une leçon ouvre le choix de mode (saisie + tuiles)', async ({ page }) => {
	await gotoHash(page, 'mode-num-comparer');
	await expect(page.locator('.mode-btn')).toHaveCount(2);
	await expect(page.getByText("J'écris la réponse")).toBeVisible();
	await expect(page.getByText('Je déplace les tuiles')).toBeVisible();
});

test('comparer (saisie) : on tape le signe, la correction le valide', async ({ page }) => {
	const errors = watchErrors(page);
	await gotoHash(page, 'lecon-num-comparer'); // mode par défaut = saisie
	const field = page.locator('.ans').first();
	await field.waitFor();
	const expected = await field.getAttribute('data-answer'); // le signe attendu
	expect(['<', '=', '>']).toContain(expected);
	await field.fill(expected ?? '');
	await page.locator('#btnVerify').click();
	await expect(page.locator('.mark.correct').first()).toBeVisible();
	expect(errors).toEqual([]);
});

test('comparer (tuiles) : on place la bonne tuile, feedback positif', async ({ page }) => {
	const errors = watchErrors(page);
	await gotoHash(page, 'mode-num-comparer');
	await page.getByText('Je déplace les tuiles').click();
	await expect(page.locator('#ltuiSlot')).toBeVisible();
	// Déduit le bon signe depuis les deux nombres de l'énoncé.
	const enonce = await page.locator('.ltui-enonce').innerText();
	expect(enonce).toContain('Compare'); // consigne d'action dans l'énoncé (#265)
	const m = enonce.match(/(\d+)\D+?(\d+)/);
	expect(m).not.toBeNull();
	const a = Number(m![1]),
		b = Number(m![2]);
	const signe = a < b ? '<' : a > b ? '>' : '=';
	await page.locator('.ltui-tuile', { hasText: signe }).first().click();
	await page.locator('#ltuiVerif').click();
	await expect(page.locator('#ltuiFeedback')).toContainText('Bravo'); // feedback positif
	await expect(page.locator('#ltuiSlot')).toHaveClass(/correct/);
	// #153 : une fois la réponse validée, « Vérifier » s'efface ; seul le bouton
	// « Continuer ▶ » reste affiché (pas deux boutons à la fois).
	await expect(page.locator('#ltuiVerif')).toBeHidden();
	await expect(page.locator('#ltuiNext')).toBeVisible();
	expect(errors).toEqual([]);
});

test('encadrer (tuiles) : placer un nombre, la case se remplit', async ({ page }) => {
	const errors = watchErrors(page);
	await gotoHash(page, 'mode-num-encadrer-intercaler');
	await page.getByText('Je déplace les tuiles').click();
	await expect(page.locator('#ltuiSlot')).toBeVisible();
	const tuile = page.locator('.ltui-tuile').first();
	const val = await tuile.innerText();
	await tuile.click();
	await expect(page.locator('#ltuiSlot')).toHaveText(val); // la tuile est posée
	await page.locator('#ltuiVerif').click();
	await expect(page.locator('#ltuiSlot')).toHaveClass(/correct|wrong/); // corrigé
	expect(errors).toEqual([]);
});
