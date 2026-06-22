/* ============================================================
   Smoke e2e — titres sémantiques et lien de branding (#277, #278).

   #277 : chaque écran porte son propre <h1> ; le branding
          « Ludaskia » est un lien <a class="toolbar-brand">
          pointant vers #accueil.
   #278 : la config du sprint affiche « Sur quoi veux-tu
          t'entraîner ? » et « Ce que tu connais déjà » quand
          le sélecteur de périmètre est actif (mélange vu / pas-vu).
   ============================================================ */
import { test, expect } from '@playwright/test';
import { watchErrors, gotoHash } from './helpers';

/* Seede 2 leçons de maths comme rencontrées (même seed que
   sprint-perimetre.spec.ts) — rend le sélecteur de périmètre visible. */
const SEED_SEEN = `localStorage.setItem('e2e/ludaskia_lessonFirstSeen', JSON.stringify({
  'math-tables-addition@ce2': 1700000000000,
  'math-doubles@ce2': 1700000000000
}));`;

/* ----------------------------------------------------------------
   A. Présence du <h1> sur l'accueil et la config sprint
   ---------------------------------------------------------------- */

test("l'accueil a un <h1> avec le texte « Accueil »", async ({ page }) => {
	const errors = watchErrors(page);
	await gotoHash(page, 'accueil');

	// #277 : <h1 class="sr-only">Accueil</h1> identifie la page pour les AT.
	await expect(page.locator('#home h1')).toHaveText('Accueil');
	expect(errors).toEqual([]);
});

test('la config sprint a un <h1> avec le texte « Sprint 5 min »', async ({ page }) => {
	const errors = watchErrors(page);
	await gotoHash(page, 'sprint-config');

	// #277 : <h1 class="big">Sprint 5 min</h1> promu depuis .big ordinaire.
	await expect(page.locator('#sprint-config h1')).toHaveText('Sprint 5 min');
	expect(errors).toEqual([]);
});

/* ----------------------------------------------------------------
   B. Lien de branding — retour à l'accueil (#277)
   ---------------------------------------------------------------- */

test('cliquer .toolbar-brand depuis la config sprint affiche #home', async ({ page }) => {
	const errors = watchErrors(page);
	await gotoHash(page, 'sprint-config');

	// Précondition : on est bien sur l'écran de config sprint.
	await expect(page.locator('#sprint-config')).toBeVisible();

	// Le lien de branding est présent et cliquable.
	const brand = page.locator('.toolbar-brand');
	await expect(brand).toBeVisible();
	await brand.click();

	// Après le clic le hash doit pointer sur accueil et l'écran #home doit s'afficher.
	await expect(page.locator('#home')).toBeVisible();
	// L'écran sprint-config doit être masqué.
	await expect(page.locator('#sprint-config')).toBeHidden();
	expect(errors).toEqual([]);
});

/* ----------------------------------------------------------------
   C. Libellés de la config sprint quand le périmètre est affiché (#278)
   Conditionnel : le sélecteur n'apparaît que si perimetreChoisissable.
   On amorce des leçons vues (comme sprint-perimetre.spec.ts) pour
   garantir l'affichage.
   ---------------------------------------------------------------- */

test("config sprint : le titre de périmètre « Sur quoi veux-tu t'entraîner ? » est visible quand le choix est proposé", async ({
	page,
}) => {
	const errors = watchErrors(page);
	await page.addInitScript(SEED_SEEN);
	await gotoHash(page, 'sprint-config');

	// Le sélecteur doit être visible grâce au seed (mélange vu / pas-vu).
	await expect(page.locator('.sc-perimetre')).toBeVisible();

	// #278 : titre du groupe reformulé en voix « tu ».
	await expect(page.locator('#scScopeTitle')).toContainText("Sur quoi veux-tu t'entraîner");

	// L'option par défaut est « Ce que tu connais déjà » (#278 : « tu » au lieu de « je »).
	await expect(page.locator('.sc-scope[value="seen"]')).toBeChecked();
	await expect(
		page.locator('label', { has: page.locator('.sc-scope[value="seen"]') }),
	).toContainText('Ce que tu connais déjà');

	expect(errors).toEqual([]);
});
