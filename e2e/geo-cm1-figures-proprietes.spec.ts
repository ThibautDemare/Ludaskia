/* ============================================================
   Smoke e2e — Géométrie CM1 « Reconnaître une figure par ses propriétés » (#253).
   Leçon CM1-only à DEUX modes : Vrai/Faux mono-propriété (runner QCM existant,
   ui/lecon-qcm.ts, `.sprint-choice`) et Coche « toutes les propriétés qui
   s'appliquent » (NOUVEAU runner multi-sélection, ui/lecon-qcm-multi.ts,
   `.lqcm-multi-choice` + validation tout-ou-rien `#lqmValider`).
   Le mode Coche est le cœur de ce smoke (nouveau runner) : bouton de validation
   désactivé tant qu'aucune case n'est cochée, feedback tout-ou-rien + badge,
   boutons désactivés après validation (garde anti double-clic), enchaînement
   jusqu'à l'écran de résultat. Le mode Vrai/Faux reste un simple smoke (runner
   déjà couvert ailleurs, ex. angles-cm1.spec.ts / divisibilite-ordre-grandeur.spec.ts).
   Quelle que soit la figure tirée (carré, losange, triangle…), une figure SVG
   codée est toujours présente — on ne dépend d'aucune figure précise (aléatoire).
   Profil CM1 seedé (comme angles-cm1.spec.ts) avec les drapeaux « déjà vu » du
   tour enfant / mot aux parents, pour que l'onboarding ne bloque pas le clic.
   ============================================================ */
import { test, expect } from '@playwright/test';
import { watchErrors } from './helpers';

const SEED_CM1 = `(() => {
	localStorage.setItem('ludaskia_profiles', JSON.stringify({ list: [{ uuid: 'e2e', name: 'E2E', emoji: '\\uD83E\\uDD8A', updatedAt: 1, niveauReference: 'cm1' }], active: 'e2e' }));
	localStorage.setItem('e2e/ludaskia_tour_seen', 'true');
	localStorage.setItem('e2e/ludaskia_parents_seen', 'true');
})();`;

test.beforeEach(async ({ page }) => {
	await page.addInitScript(SEED_CM1);
});

test('CM1 « Reconnaître une figure par ses propriétés » propose 2 modes', async ({ page }) => {
	const errors = watchErrors(page);
	await page.goto('app.html#mode-geo-cm1-figures-proprietes', { waitUntil: 'networkidle' });
	await expect(page.locator('.mode-btn')).toHaveCount(2);
	await expect(page.locator('.mode-btn[data-mode="qcm"]')).toBeVisible();
	await expect(page.locator('.mode-btn[data-mode="coche"]')).toBeVisible();
	expect(errors).toEqual([]);
});

test('mode Coche : 4 propositions, « Vérifier » désactivé sans coche, feedback tout-ou-rien, jusqu’au résultat', async ({
	page,
}) => {
	const errors = watchErrors(page);
	await page.goto('app.html#mode-geo-cm1-figures-proprietes', { waitUntil: 'networkidle' });
	await page.locator('.mode-btn[data-mode="coche"]').click();

	const choices = page.locator('.lqcm-multi-choice');
	await expect(choices).toHaveCount(4);
	// Figure codée toujours présente, quelle que soit la forme tirée.
	await expect(page.locator('.figure svg').first()).toBeVisible();

	const validate = page.locator('#lqmValider');
	await expect(validate).toBeDisabled(); // rien coché → « Vérifier » inactif
	await choices.first().click();
	await expect(validate).toBeEnabled(); // une case cochée → actif

	await validate.click();
	await expect(page.locator('.lqm-badge')).toBeVisible(); // feedback tout-ou-rien + badge
	await expect(page.locator('.lqcm-multi-choice:disabled')).toHaveCount(4); // garde anti double-clic

	// Enchaîne les 5 questions restantes (tour de 6) jusqu'à l'écran de résultat.
	for (let i = 1; i < 6; i++) {
		await page.locator('#lqmActions button').click();
		await expect(choices).toHaveCount(4);
		await choices.first().click();
		await page.locator('#lqmValider').click();
		await expect(page.locator('.lqm-badge')).toBeVisible();
	}
	await page.locator('#lqmActions button').click();
	await expect(page.locator('#leconAgain')).toBeVisible(); // écran de résultat

	expect(errors).toEqual([]);
});

test('mode Vrai/Faux (smoke) : figure rendue, un choix donne un retour', async ({ page }) => {
	const errors = watchErrors(page);
	await page.goto('app.html#mode-geo-cm1-figures-proprietes', { waitUntil: 'networkidle' });
	await page.locator('.mode-btn[data-mode="qcm"]').click();

	await expect(page.locator('.figure svg').first()).toBeVisible();
	const choices = page.locator('.sprint-choice');
	await expect(choices).toHaveCount(2); // Vrai / Faux
	await choices.first().click();
	await expect(page.locator('#lqcmFeedback')).toBeVisible();

	expect(errors).toEqual([]);
});
