/* ============================================================
   Smoke e2e — configurateur de bilan personnalisé (#195).
   On vérifie la nouvelle hiérarchie Matière > Catégorie > Rubrique :
   matières repliables, regroupement des leçons par rubrique, et la
   sélection « tout cocher/décocher » par niveau (case parent à 3 états
   + compteur « x/y »).
   ============================================================ */
import { test, expect } from '@playwright/test';
import { watchErrors, gotoHash } from './helpers';

test('matières repliables + regroupement des leçons par rubrique', async ({ page }) => {
	const errors = watchErrors(page);
	await gotoHash(page, 'bilan-custom');

	const subjects = page.locator('.bc-subject');
	await expect(subjects).toHaveCount(2);

	// Repliées par défaut (on casse la grande liste de 109 leçons)...
	expect(await subjects.first().getAttribute('open')).toBeNull();
	// ...mais l'état reste lisible : chaque matière affiche un compteur « x/y ».
	await expect(subjects.first().locator('> .bc-subject-head .bc-group-count')).toHaveText(
		/^\d+\/\d+$/,
	);

	// On déplie « Français » → ses catégories apparaissent.
	const francais = page.locator('.bc-subject', { hasText: 'Français' });
	await francais.locator('.bc-subject-title').click();
	const conj = francais.locator('.bc-category', { hasText: 'Conjugaison' });
	await expect(conj).toBeVisible();

	// Conjugaison est regroupée par temps (rubriques) — plus « en vrac ».
	await expect(conj.locator('.bc-rubrique-title', { hasText: 'Présent' })).toHaveCount(1);
	expect(await conj.locator('.bc-rubrique').count()).toBeGreaterThan(1);

	expect(errors).toEqual([]);
});

test('cocher/décocher au niveau d’une catégorie (case parent + compteur)', async ({ page }) => {
	const errors = watchErrors(page);
	await gotoHash(page, 'bilan-custom');

	const francais = page.locator('.bc-subject', { hasText: 'Français' });
	await francais.locator('.bc-subject-title').click();
	const conj = francais.locator('.bc-category', { hasText: 'Conjugaison' });

	const lessons = conj.locator('.bc-lesson-check');
	const total = await lessons.count();
	expect(total).toBeGreaterThan(0);

	const catCheck = conj.locator('> .bc-cat-head .bc-group-check');
	const catCount = conj.locator('> .bc-cat-head .bc-group-count');

	// Tout est coché au départ → compteur plein « N/N ».
	await expect(catCount).toHaveText(`${total}/${total}`);

	// On décoche la catégorie : toutes ses leçons se décochent, compteur « 0/N ».
	await catCheck.click();
	await expect(catCount).toHaveText(`0/${total}`);
	expect(await lessons.locator(':checked').count()).toBe(0);

	// On recoche une seule leçon → état partiel (case parent indéterminée + « 1/N »).
	await lessons.first().click();
	await expect(catCount).toHaveText(`1/${total}`);
	expect(await catCheck.evaluate((el: HTMLInputElement) => el.indeterminate)).toBe(true);

	expect(errors).toEqual([]);
});
