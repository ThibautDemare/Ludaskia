/* ============================================================
   Smoke e2e — Vocabulaire « Les contraires » & « Les mots de sens proche » (#203).
   QCM 3 options, mot-cible en gras dans une phrase, consigne renforcée avec picto
   (↔ / =) et champ explication. On vérifie le rendu de chaque leçon et l'évaluation
   d'une réponse — sans erreur de rendu. (Le haut-parleur par mot/option dépend de
   la présence d'une voix FR sur l'appareil : non testé ici, couvert en Vitest.)
   ============================================================ */
import { test, expect } from '@playwright/test';
import { watchErrors, gotoHash } from './helpers';

test('la catégorie Vocabulaire liste les leçons contraires et sens proche', async ({ page }) => {
	const errors = watchErrors(page);
	await gotoHash(page, 'categorie-fr-vocabulaire');
	await expect(page.locator('[data-id="fr-vocab-contraires"]')).toBeVisible();
	await expect(page.locator('[data-id="fr-vocab-sens-proche"]')).toBeVisible();
	expect(errors).toEqual([]);
});

test('Les contraires : consigne ↔, mot-cible en gras, QCM 3 options + feedback', async ({
	page,
}) => {
	const errors = watchErrors(page);
	await gotoHash(page, 'lecon-fr-vocab-contraires'); // mono-mode QCM → lancement direct
	const choices = page.locator('.sprint-choice');
	await choices.first().waitFor();
	expect(await choices.count()).toBe(3);
	// Consigne renforcée + picto décoratif (« ↔ »).
	await expect(page.locator('.lqcm-consigne')).toContainText('contraire');
	await expect(page.locator('.lqcm-picto')).toHaveText('↔');
	// Mot-cible mis en gras dans la phrase.
	await expect(page.locator('.sprint-q-qcm strong')).toBeVisible();
	// Évaluation d'une réponse → explication affichée.
	await choices.first().click();
	await expect(page.locator('.lqcm-expl')).toBeVisible();
	await expect(page.locator('.lqcm-expl')).toContainText('contraire');
	expect(errors).toEqual([]);
});

test('Les mots de sens proche : consigne =, mot-cible en gras, QCM 3 options + feedback', async ({
	page,
}) => {
	const errors = watchErrors(page);
	await gotoHash(page, 'lecon-fr-vocab-sens-proche'); // mono-mode QCM → lancement direct
	const choices = page.locator('.sprint-choice');
	await choices.first().waitFor();
	expect(await choices.count()).toBe(3);
	await expect(page.locator('.lqcm-picto')).toHaveText('=');
	await expect(page.locator('.sprint-q-qcm strong')).toBeVisible();
	await choices.first().click();
	await expect(page.locator('.lqcm-expl')).toBeVisible();
	await expect(page.locator('.lqcm-expl')).toContainText('même chose');
	expect(errors).toEqual([]);
});
