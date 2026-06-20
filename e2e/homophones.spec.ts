/* ============================================================
   Smoke e2e — Orthographe : homophones grammaticaux (#110).
   Rubrique « Les homophones » : 5 paires, QCM à 2 options (jamais de forme
   fautive) + feedback du critère de substitution après la réponse.
   ============================================================ */
import { test, expect } from '@playwright/test';
import { watchErrors, gotoHash } from './helpers';

test('la rubrique « Les homophones » liste les 5 paires', async ({ page }) => {
	const errors = watchErrors(page);
	await gotoHash(page, 'categorie-fr-orthographe');
	await expect(page.locator('.cat-rubrique').filter({ hasText: 'Les homophones' })).toBeVisible();
	for (const id of [
		'fr-homophones-a',
		'fr-homophones-et',
		'fr-homophones-on',
		'fr-homophones-son',
		'fr-homophones-ou',
	]) {
		await expect(page.locator(`[data-lecon="${id}"]`)).toBeVisible();
	}
	expect(errors).toEqual([]);
});

test('homophone a/à : QCM à 2 options + feedback de substitution', async ({ page }) => {
	const errors = watchErrors(page);
	await gotoHash(page, 'categorie-fr-orthographe');
	// Mono-mode QCM → lancement direct du runner (pas d'écran de choix).
	await page.locator('[data-lecon="fr-homophones-a"]').click();
	const choices = page.locator('.sprint-choice');
	await choices.first().waitFor();
	// Exactement deux options, qui sont « a » et « à ».
	expect(await choices.count()).toBe(2);
	const labels = (await choices.allTextContents()).map((s) => s.trim()).sort();
	expect(labels).toEqual(['a', 'à']);
	// Consigne d'action visible (#265) : l'enfant sait quoi faire sans cliquer « Écouter ».
	await expect(page.locator('.lqcm-consigne')).toContainText('Choisis le bon mot');
	await choices.first().click();
	// Retour immédiat + critère de substitution (« avait »).
	await expect(page.locator('.lqcm-expl')).toBeVisible();
	await expect(page.locator('.lqcm-expl')).toContainText('avait');
	expect(errors).toEqual([]);
});
