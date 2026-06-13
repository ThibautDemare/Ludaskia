/* ============================================================
   Tests e2e des leçons « Le périmètre » (#99) : clientes du moteur
   de figures SVG (polygone coté + quadrillage). On vérifie que la
   figure se rend et que la réponse numérique est corrigée.
   ============================================================ */
import { test, expect } from '@playwright/test';
import { watchErrors, gotoHash } from './helpers';

test('Périmètre (côtés) : la figure cotée s’affiche, la bonne réponse est validée', async ({
	page,
}) => {
	const errors = watchErrors(page);
	await gotoHash(page, 'lecon-mes-perimetre-cotes'); // mono-mode → fiche directe
	await expect(page.locator('.figure svg').first()).toBeVisible();
	const field = page.locator('.ans').first();
	await field.waitFor();
	const good = await field.getAttribute('data-answer');
	await field.fill(good ?? '');
	await page.locator('#btnVerify').click();
	await expect(page.locator('.mark.correct').first()).toBeVisible();
	expect(errors).toEqual([]);
});

test('Périmètre (quadrillage) : la figure sur grille s’affiche et se corrige', async ({ page }) => {
	const errors = watchErrors(page);
	await gotoHash(page, 'lecon-mes-perimetre-quadrillage');
	await expect(page.locator('.figure svg').first()).toBeVisible();
	const field = page.locator('.ans').first();
	await field.waitFor();
	const good = await field.getAttribute('data-answer');
	await field.fill(good ?? '');
	await page.locator('#btnVerify').click();
	await expect(page.locator('.mark.correct').first()).toBeVisible();
	expect(errors).toEqual([]);
});
