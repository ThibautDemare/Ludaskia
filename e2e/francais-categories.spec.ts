/* ============================================================
   Smoke e2e — catégories Français Grammaire & Vocabulaire (FR-A, #107).
   Scaffolding pur : les deux catégories existent dans la navigation mais
   arrivent VIDES → l'écran d'une catégorie affiche « Bientôt disponible »
   (les leçons de contenu suivront par issues dépendantes). On vérifie
   surtout que les vues se rendent sans erreur.
   ============================================================ */
import { test, expect } from '@playwright/test';
import { watchErrors, gotoHash } from './helpers';

test('la matière Français liste Grammaire et Vocabulaire', async ({ page }) => {
	const errors = watchErrors(page);
	await gotoHash(page, 'matiere-francais');
	await expect(page.locator('[data-category="fr-grammaire"]')).toBeVisible();
	await expect(page.locator('[data-category="fr-vocabulaire"]')).toBeVisible();
	// Les catégories historiques restent présentes.
	await expect(page.locator('[data-category="fr-conjugaison"]')).toBeVisible();
	await expect(page.locator('[data-category="fr-orthographe"]')).toBeVisible();
	expect(errors).toEqual([]);
});

test('Grammaire liste ses leçons (pronom/accord, #115) sans erreur', async ({ page }) => {
	// Depuis #115, la catégorie Grammaire n'est plus vide.
	const errors = watchErrors(page);
	await gotoHash(page, 'categorie-fr-grammaire');
	await expect(page.locator('.lesson-item').first()).toBeVisible();
	expect(errors).toEqual([]);
});

test('Vocabulaire liste ses leçons (ordre alphabétique, #108) sans erreur', async ({ page }) => {
	// Depuis #108, la catégorie Vocabulaire n'est plus vide.
	const errors = watchErrors(page);
	await gotoHash(page, 'categorie-fr-vocabulaire');
	await expect(page.locator('.lesson-item').first()).toBeVisible();
	expect(errors).toEqual([]);
});
