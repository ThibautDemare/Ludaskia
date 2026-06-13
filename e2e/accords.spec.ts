/* ============================================================
   Smoke e2e — Orthographe : accords (pluriel & féminin) + rubriques (#109).
   La catégorie Orthographe sépare désormais « Les accords » (exercices de
   transformation, moteur saisie/QCM) des « dictées de mots ». On vérifie la
   structure en rubriques, l'écran de choix de mode, la fiche de saisie
   corrigée, et le panneau « formes » de l'éditeur de listes du parent.
   ============================================================ */
import { test, expect } from '@playwright/test';
import { watchErrors, gotoHash } from './helpers';

test('la catégorie Orthographe sépare « Les accords » et « Les dictées »', async ({ page }) => {
	const errors = watchErrors(page);
	await gotoHash(page, 'categorie-fr-orthographe');
	const rubriques = page.locator('.cat-rubrique');
	await expect(rubriques.filter({ hasText: 'Les accords' })).toBeVisible();
	await expect(rubriques.filter({ hasText: 'Les dictées' })).toBeVisible();
	await expect(page.locator('[data-accord="fr-accords-reguliers"]')).toBeVisible();
	await expect(page.locator('[data-accord="fr-accords-irreguliers"]')).toBeVisible();
	// Les dictées de mots restent présentes (mots de base).
	await expect(page.locator('[data-ortho]').first()).toBeVisible();
	expect(errors).toEqual([]);
});

test('leçon d’accords : choix de mode puis saisie corrigée', async ({ page }) => {
	const errors = watchErrors(page);
	await gotoHash(page, 'categorie-fr-orthographe');
	await page.locator('[data-accord="fr-accords-reguliers"]').click();
	// Écran de choix de mode (#69) : saisie (conseillé) + QCM.
	await expect(page.locator('.mode-btn[data-mode="saisie"]')).toBeVisible();
	await expect(page.locator('.mode-btn[data-mode="qcm"]')).toBeVisible();
	await page.locator('.mode-btn[data-mode="saisie"]').click();
	// Fiche de saisie : on remplit chaque champ avec sa bonne réponse.
	const fields = page.locator('.ans');
	await fields.first().waitFor();
	const n = await fields.count();
	for (let i = 0; i < n; i++) {
		const f = fields.nth(i);
		await f.fill((await f.getAttribute('data-answer')) ?? '');
	}
	await page.locator('#btnVerify').click();
	await expect(page.locator('.mark.correct').first()).toBeVisible();
	await expect(page.locator('.mark.wrong')).toHaveCount(0);
	expect(errors).toEqual([]);
});

test('leçon d’accords : le mode QCM propose des choix et donne un retour', async ({ page }) => {
	const errors = watchErrors(page);
	await gotoHash(page, 'categorie-fr-orthographe');
	await page.locator('[data-accord="fr-accords-irreguliers"]').click();
	await page.locator('.mode-btn[data-mode="qcm"]').click();
	const choices = page.locator('.sprint-choice');
	await choices.first().waitFor();
	expect(await choices.count()).toBe(4);
	await choices.first().click();
	// Retour immédiat (bon ou mauvais), puis bouton pour continuer.
	await expect(page.locator('.lqcm-ok, .lqcm-ko')).toBeVisible();
	expect(errors).toEqual([]);
});

test('éditeur de liste : le panneau « accords » se déplie et la liste s’enregistre', async ({
	page,
}) => {
	const errors = watchErrors(page);
	await gotoHash(page, 'ortho-new');
	const firstMot = page.locator('.ortho-mot').first();
	await firstMot.waitFor();
	await firstMot.fill('chat');
	// Les formes sont masquées par défaut ; le bouton ✍️ les révèle.
	const panel = page.locator('.ortho-formes').first();
	await expect(panel).toBeHidden();
	await page.locator('.ortho-formes-toggle').first().click();
	await expect(panel).toBeVisible();
	await page.locator('.ortho-f-mp').first().fill('chats');
	await page.locator('#orthoLabel').fill('Test accords');
	await page.locator('#orthoSave').click();
	// Retour à la catégorie Orthographe sans erreur.
	await expect(page.locator('.cat-rubrique').first()).toBeVisible();
	expect(errors).toEqual([]);
});
