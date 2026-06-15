/* ============================================================
   Smoke e2e — Vocabulaire « Champs lexicaux » (#114).
   Deux leçons : « Le mot juste » (QCM 4 options : définition → mot + intrus)
   et « Ranger par thème » (tri de tuiles dans deux colonnes, runner
   ui/lecon-tri.ts). On vérifie le rendu, l'interaction clé de chaque format et
   la correction — sans erreur de rendu.
   ============================================================ */
import { test, expect } from '@playwright/test';
import { watchErrors, gotoHash } from './helpers';

test('la catégorie Vocabulaire liste les deux leçons de champs lexicaux', async ({ page }) => {
	const errors = watchErrors(page);
	await gotoHash(page, 'categorie-fr-vocabulaire');
	await expect(page.locator('[data-id="fr-vocab-champs-mots"]')).toBeVisible();
	await expect(page.locator('[data-id="fr-vocab-champs-tri"]')).toBeVisible();
	expect(errors).toEqual([]);
});

test('« Le mot juste » : QCM 4 options + feedback (explication)', async ({ page }) => {
	const errors = watchErrors(page);
	await gotoHash(page, 'lecon-fr-vocab-champs-mots'); // mono-mode QCM → lancement direct
	const choices = page.locator('.sprint-choice');
	await choices.first().waitFor();
	expect(await choices.count()).toBe(4);
	await choices.first().click();
	await expect(page.locator('.lqcm-expl')).toBeVisible();
	expect(errors).toEqual([]);
});

test('« Ranger par thème » : trier les tuiles puis vérifier corrige tuile par tuile', async ({
	page,
}) => {
	const errors = watchErrors(page);
	await gotoHash(page, 'lecon-fr-vocab-champs-tri'); // mono-mode → lancement direct
	await page.locator('.ltri-tuile').first().waitFor();
	expect(await page.locator('.ltri-tuile').count()).toBe(6); // 3 + 3 tuiles fournies

	// Vérifier est désactivé tant que toutes les tuiles ne sont pas rangées.
	await expect(page.locator('#ltriVerif')).toBeDisabled();

	// Interaction tap en deux temps : on sélectionne chaque tuile puis on tape le
	// titre de la 1re colonne. Tout va dans le thème 0 → résultat déterministe :
	// les 3 mots de ce thème sont corrects, les 3 autres sont faux.
	while ((await page.locator('.ltri-tuile').count()) > 0) {
		await page.locator('.ltri-tuile').first().click();
		await page.locator('.ltri-col').first().locator('.ltri-col-titre').click();
	}

	await expect(page.locator('#ltriVerif')).toBeEnabled();
	await page.locator('#ltriVerif').click();

	expect(await page.locator('.ltri-posee.correct').count()).toBe(3);
	expect(await page.locator('.ltri-posee.wrong').count()).toBe(3);
	await expect(page.locator('.lqcm-ko')).toBeVisible(); // bon classement montré
	expect(errors).toEqual([]);
});

test('« Ranger par thème » : taper une tuile posée la renvoie au bac', async ({ page }) => {
	const errors = watchErrors(page);
	await gotoHash(page, 'lecon-fr-vocab-champs-tri');
	await page.locator('.ltri-tuile').first().waitFor();
	const avant = await page.locator('.ltri-tuile').count();
	// Sélectionner une tuile puis la déposer dans la 1re colonne.
	await page.locator('.ltri-tuile').first().click();
	await page.locator('.ltri-col').first().locator('.ltri-col-titre').click();
	await expect(page.locator('.ltri-posee')).toHaveCount(1);
	expect(await page.locator('.ltri-tuile').count()).toBe(avant - 1);
	// Taper la tuile posée la renvoie au bac.
	await page.locator('.ltri-posee').first().click();
	await expect(page.locator('.ltri-posee')).toHaveCount(0);
	expect(await page.locator('.ltri-tuile').count()).toBe(avant);
	expect(errors).toEqual([]);
});
