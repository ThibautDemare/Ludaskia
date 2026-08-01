/* ============================================================
   Smoke e2e — Numération « Je range les nombres » (num-ranger, #448).
   Même runner de rangement que l'ordre alphabétique (#108, ui/lecon-ordre.ts) :
   on vérifie que la catégorie liste la leçon, que le runner se rend, que poser
   les tuiles-nombres dans le bon ordre valide la réponse, ET que le SENS tiré
   (croissant ou décroissant) est bien celui appliqué par la correction —
   sans dépendre du libellé exact de la consigne (formulation en cours de
   relecture pédagogique).
   ============================================================ */
import { test, expect } from '@playwright/test';
import { watchErrors, gotoHash, seedAideVue } from './helpers';

/* Le runner « ordre » (ranger une suite) déclenche l'aide contextuelle au 1er
   lancement, sous le type `ordreNombres` pour cette leçon (#448). On la marque
   comme déjà vue pour éviter que l'overlay bloque les interactions. */
test.beforeEach(async ({ page }) => {
	await seedAideVue(page);
});

/* Nombre affiché par une tuile → entier (pas de séparateur de milliers sous
   10 000, cf. core/nombres.ts). */
const versNombre = (libelle: string): number => Number(libelle.trim());

test('la catégorie Numération liste la leçon « Je range les nombres »', async ({ page }) => {
	const errors = watchErrors(page);
	await gotoHash(page, 'categorie-math-numeration');
	await expect(page.locator('.lesson-item').first()).toBeVisible();
	await expect(page.locator('[data-id="num-ranger"]')).toBeVisible();
	expect(errors).toEqual([]);
});

test('ranger les tuiles-nombres dans le bon ordre valide la réponse', async ({ page }) => {
	const errors = watchErrors(page);
	// Mono-mode → lancement direct du runner de rangement.
	await gotoHash(page, 'lecon-num-ranger');
	await page.locator('.lord-tuile').first().waitFor();

	// 4 ou 5 tuiles, une case par nombre.
	const nbCases = await page.locator('.lord-cell').count();
	expect(nbCases).toBeGreaterThanOrEqual(4);
	expect(nbCases).toBeLessThanOrEqual(5);

	const libelles = await page.locator('.lord-tuile').allTextContents();
	const valeurs = libelles.map(versNombre);
	const croissant = [...valeurs].sort((a, b) => a - b);

	// On pose les tuiles en ordre croissant : si la consigne demandait le sens
	// inverse, la correction le dira (cases marquées « wrong » + rappel du bon
	// rangement) — pas besoin de lire la consigne pour le savoir.
	await expect(page.locator('#lordVerif')).toBeDisabled();
	for (const val of croissant) {
		await page.locator(`.lord-tuile[data-val="${val}"]`).click();
	}
	await expect(page.locator('#lordVerif')).toBeEnabled();
	await page.locator('#lordVerif').click();

	const toutCorrect = (await page.locator('.lord-cell.wrong').count()) === 0;
	if (toutCorrect) {
		// Le sens tiré était bien croissant : toutes les cases sont validées.
		expect(await page.locator('.lord-cell.correct').count()).toBe(croissant.length);
		await expect(page.locator('.lqcm-ok')).toBeVisible();
	} else {
		// Le sens tiré était décroissant : la correction révèle le bon rangement,
		// qu'on vérifie être l'exact inverse de la suite croissante (le sens
		// demandé est donc bel et bien celui appliqué, sans lire la consigne).
		const rappel = await page.locator('.lqcm-ko strong').innerText();
		const revele = rappel.split('·').map((s) => versNombre(s));
		expect(revele).toEqual([...croissant].reverse());
	}
	// #153 : une fois la réponse validée, « Vérifier » s'efface ; seul « Continuer ▶ »
	// reste affiché.
	await expect(page.locator('#lordVerif')).toBeHidden();
	await expect(page.locator('#lordActions button')).toBeVisible();
	expect(errors).toEqual([]);
});

test('retirer une tuile-nombre placée la renvoie au bac', async ({ page }) => {
	const errors = watchErrors(page);
	await gotoHash(page, 'lecon-num-ranger');
	await page.locator('.lord-tuile').first().waitFor();
	const premier = (await page.locator('.lord-tuile').first().textContent())!.trim();
	await page.locator(`.lord-tuile[data-val="${premier}"]`).click();
	await expect(page.locator('.lord-cell.rempli')).toHaveCount(1);
	await page.locator('.lord-cell.rempli').first().click();
	await expect(page.locator('.lord-cell.rempli')).toHaveCount(0);
	expect(errors).toEqual([]);
});
