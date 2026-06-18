/* ============================================================
   Smoke e2e — Résolution de problèmes (#199).
   Catégorie + runner dédié (un problème à la fois, saisie numérique).
   Énoncé lisible, réponse correcte validée ; problème à deux étapes = 2 champs.
   ============================================================ */
import { test, expect } from '@playwright/test';
import { watchErrors, gotoHash } from './helpers';

test('la catégorie Résolution de problèmes liste ses leçons', async ({ page }) => {
	const errors = watchErrors(page);
	await gotoHash(page, 'categorie-math-problemes');
	await expect(page.locator('[data-id="math-prob-composition"]')).toBeVisible();
	await expect(page.locator('[data-id="math-prob-deux-etapes"]')).toBeVisible();
	expect(errors).toEqual([]);
});

test('un problème simple : énoncé affiché, bonne réponse validée', async ({ page }) => {
	const errors = watchErrors(page);
	await gotoHash(page, 'lecon-math-prob-composition');
	await expect(page.locator('.prob-enonce')).toBeVisible();
	const input = page.locator('.prob-input').first();
	await input.waitFor();
	// La bonne réponse est exposée (comme tous les champs .ans de l'app) → on la saisit.
	const answer = await input.getAttribute('data-answer');
	await input.fill(answer!);
	await page.locator('#probVerif').click();
	await expect(page.locator('.prob-mark.correct').first()).toBeVisible();
	// #153 : une fois la réponse validée, « Vérifier » s'efface ; seul « Continuer ▶ »
	// reste affiché (pas deux boutons à la fois).
	await expect(page.locator('#probVerif')).toBeHidden();
	await expect(page.locator('#probNext')).toBeVisible();
	expect(errors).toEqual([]);
});

test('le brouillon se déplie à la demande', async ({ page }) => {
	const errors = watchErrors(page);
	await gotoHash(page, 'lecon-math-prob-composition');
	const panel = page.locator('.brouillon-panel');
	await expect(panel).toBeHidden(); // replié par défaut
	await page.locator('.brouillon-toggle').click();
	await expect(panel).toBeVisible();
	await expect(page.locator('.brouillon-canvas')).toBeVisible();
	expect(errors).toEqual([]);
});

test('un problème à deux étapes : deux sous-questions, deux champs', async ({ page }) => {
	const errors = watchErrors(page);
	await gotoHash(page, 'lecon-math-prob-deux-etapes');
	const inputs = page.locator('.prob-input');
	await inputs.first().waitFor();
	expect(await inputs.count()).toBe(2);
	// On répond correctement aux deux étapes.
	const n = await inputs.count();
	for (let i = 0; i < n; i++) {
		const inp = inputs.nth(i);
		await inp.fill((await inp.getAttribute('data-answer'))!);
	}
	await page.locator('#probVerif').click();
	expect(await page.locator('.prob-mark.correct').count()).toBe(2);
	expect(errors).toEqual([]);
});
