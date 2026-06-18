/* ============================================================
   Smoke e2e — Orthographe : accord du participe passé avec « être » (#205).
   Rubrique « Les accords ». QCM mono-mode 3 options EMPILÉES, terminaison
   surlignée, sujet en gras, sans TTS ; leçon signalée « plus dur ».
   ============================================================ */
import { test, expect } from '@playwright/test';
import { watchErrors, gotoHash } from './helpers';

const LECON = 'fr-accords-participe-etre';

test('la leçon est dans « Les accords » et signalée « plus dur »', async ({ page }) => {
	const errors = watchErrors(page);
	await gotoHash(page, 'categorie-fr-orthographe');
	await expect(page.locator('.cat-rubrique').filter({ hasText: 'Les accords' })).toBeVisible();
	const carte = page.locator(`[data-lecon="${LECON}"]`);
	await expect(carte).toBeVisible();
	// Repère de difficulté : badge texte (pas seulement une couleur).
	await expect(carte.locator('.lz-level')).toHaveText('plus dur');
	expect(errors).toEqual([]);
});

test('QCM : 3 options empilées, terminaison surlignée, sujet en gras, sans TTS', async ({
	page,
}) => {
	const errors = watchErrors(page);
	await gotoHash(page, 'categorie-fr-orthographe');
	// Mono-mode QCM → lancement direct du runner (pas d'écran de choix).
	await page.locator(`[data-lecon="${LECON}"]`).click();
	const choices = page.locator('.sprint-choice');
	await choices.first().waitFor();
	// Exactement 3 options, disposées en colonne (variante empilée).
	expect(await choices.count()).toBe(3);
	await expect(page.locator('#lqcmChoices.sprint-choices--pile')).toBeVisible();
	// Chaque option surligne sa terminaison.
	expect(await page.locator('.sprint-choice .term').count()).toBe(3);
	// Sujet de la phrase transformée en gras.
	await expect(page.locator('.sprint-q-qcm strong')).toBeVisible();
	// Pas de bouton « Écouter » : l'énoncé ne porte pas de data-tts (formes homophones).
	expect(await page.locator('.sprint-q-qcm[data-tts]').count()).toBe(0);
	expect(errors).toEqual([]);
});

test("QCM : une réponse est évaluée et la règle d'accord est rappelée", async ({ page }) => {
	const errors = watchErrors(page);
	await gotoHash(page, 'categorie-fr-orthographe');
	await page.locator(`[data-lecon="${LECON}"]`).click();
	const choices = page.locator('.sprint-choice');
	await choices.first().waitFor();
	await choices.first().click();
	// La bonne forme est marquée (correction effectuée) et l'explication s'affiche.
	await expect(page.locator('.sprint-choice.correct')).toHaveCount(1);
	await expect(page.locator('.lqcm-expl')).toBeVisible();
	await expect(page.locator('.lqcm-expl')).toContainText('accorde');
	expect(errors).toEqual([]);
});
