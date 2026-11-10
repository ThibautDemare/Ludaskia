/* ============================================================
   #785 — Guide parents (`guide.html`) et vitrine : le décor y est décrit, et le bouton y est.
   Écrit AVANT la rédaction du guide : seuls les deux libellés cités sont figés (ils
   désignent un geste que le parent doit retrouver à l'écran) ; le reste se contrôle par les
   MOTS qui portent le sens (flocons, décembre, trophées de Noël), jamais par une phrase.

   - Critère 9 : le guide décrit le bouton, la case, le décor de saison, les trophées de Noël.
   - Le guide n'a JAMAIS de flocons (contrat), même en décembre ; son bouton est dans
     `.v-footer`. Sur la vitrine, le bouton est aussi dans `.v-footer`.
   Horloge : voir `decor-aide.ts` (juillet pour le texte : la description ne doit pas
   dépendre de la saison).
   ============================================================ */
import { test, expect } from '@playwright/test';
import { watchErrors } from './helpers';
import { DATES, FUSEAU, ouvrirGuide, ouvrirVitrine } from './decor-aide';

test.use({ timezoneId: FUSEAU });

test('critère 9 : le guide décrit le bouton, la case « Figer le décor », les flocons de décembre et les trophées de Noël', async ({
	page,
}) => {
	const errors = watchErrors(page);
	await ouvrirGuide(page, DATES.ete);
	const texte = (await page.locator('main').first().textContent()) ?? '';

	// Libellés cités : INTENTIONNELS (le parent les cherche tels quels à l'écran).
	expect(texte, 'le guide cite la case « Figer le décor »').toContain('Figer le décor');
	expect(texte, 'le guide cite le bouton « Arrêter le décor »').toContain('Arrêter le décor');
	// Le reste : les mots qui portent le sens, pas une formulation.
	expect(texte, 'le guide mentionne les flocons').toMatch(/flocons?/i);
	expect(texte, 'le guide dit que le décor de saison est celui de décembre').toMatch(/décembre/i);
	expect(texte, 'le guide mentionne les trophées de Noël').toMatch(
		/troph[ée]es?[^.]{0,80}Noël|Noël[^.]{0,80}troph[ée]es?/i,
	);
	expect(errors).toEqual([]);
});

test('le guide ne porte jamais de décor de saison, même en décembre ; son bouton est dans le pied de page', async ({
	page,
}) => {
	const errors = watchErrors(page);
	await ouvrirGuide(page, DATES.noel);
	await expect(page.locator('.decor-saison')).toHaveCount(0);
	await expect(page.locator('.decor-flocon')).toHaveCount(0);
	await expect(page.locator('.v-footer #footerDecor')).toBeVisible();
	expect(errors).toEqual([]);
});

test('la vitrine porte le bouton dans son pied de page', async ({ page }) => {
	const errors = watchErrors(page);
	await ouvrirVitrine(page, DATES.ete);
	await expect(page.locator('.v-footer #footerDecor')).toBeVisible();
	expect(errors).toEqual([]);
});
