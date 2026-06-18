/* ============================================================
   Smoke e2e — Vocabulaire « Ordre alphabétique » (#108).
   Nouveau type d'exercice : ranger une suite de tuiles-mots (runner
   ui/lecon-ordre.ts). On vérifie que la catégorie liste ses leçons, que le
   runner se rend, et qu'en plaçant les mots dans l'ordre alphabétique la
   correction valide — sans erreur de rendu.
   ============================================================ */
import { test, expect } from '@playwright/test';
import { watchErrors, gotoHash } from './helpers';

test('la catégorie Vocabulaire liste les leçons d’ordre alphabétique', async ({ page }) => {
	const errors = watchErrors(page);
	await gotoHash(page, 'categorie-fr-vocabulaire');
	await expect(page.locator('.lesson-item').first()).toBeVisible();
	await expect(page.locator('[data-id="fr-vocab-alpha-initiale"]')).toBeVisible();
	await expect(page.locator('[data-id="fr-vocab-alpha-deuxieme"]')).toBeVisible();
	expect(errors).toEqual([]);
});

test('ranger les tuiles dans le bon ordre valide la réponse', async ({ page }) => {
	const errors = watchErrors(page);
	// Mono-mode → lancement direct du runner de rangement.
	await gotoHash(page, 'lecon-fr-vocab-alpha-initiale');
	await page.locator('.lord-tuile').first().waitFor();
	// La rangée-réponse a une case par mot ; au départ aucune n'est remplie.
	const nbMots = await page.locator('.lord-cell').count();
	expect(nbMots).toBeGreaterThanOrEqual(4);

	// Lire les mots et calculer l'ordre alphabétique attendu (même tri que l'app).
	const mots = await page.locator('.lord-tuile').allTextContents();
	const ordre = [...mots].sort((a, b) => a.localeCompare(b, 'fr'));

	// Vérifier est désactivé tant que toutes les cases ne sont pas remplies.
	await expect(page.locator('#lordVerif')).toBeDisabled();
	for (const mot of ordre) {
		await page.locator(`.lord-tuile[data-val="${mot}"]`).click();
	}
	await expect(page.locator('#lordVerif')).toBeEnabled();
	await page.locator('#lordVerif').click();

	// Toutes les cases correctes, aucune erreur, message de réussite.
	await expect(page.locator('.lord-cell.wrong')).toHaveCount(0);
	expect(await page.locator('.lord-cell.correct').count()).toBe(ordre.length);
	await expect(page.locator('.lqcm-ok')).toBeVisible();
	// #153 : une fois la réponse validée, « Vérifier » s'efface ; seul « Continuer ▶ »
	// reste affiché (pas deux boutons à la fois).
	await expect(page.locator('#lordVerif')).toBeHidden();
	await expect(page.locator('#lordNext')).toBeVisible();
	expect(errors).toEqual([]);
});

test('retirer une tuile placée la renvoie au bac', async ({ page }) => {
	const errors = watchErrors(page);
	await gotoHash(page, 'lecon-fr-vocab-alpha-initiale');
	await page.locator('.lord-tuile').first().waitFor();
	const premier = (await page.locator('.lord-tuile').first().textContent())!.trim();
	await page.locator(`.lord-tuile[data-val="${premier}"]`).click();
	// La première case est remplie ; un clic dessus la vide.
	await expect(page.locator('.lord-cell.rempli')).toHaveCount(1);
	await page.locator('.lord-cell.rempli').first().click();
	await expect(page.locator('.lord-cell.rempli')).toHaveCount(0);
	expect(errors).toEqual([]);
});
