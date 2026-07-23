/* ============================================================
   Espace encadrant (#459) — restructuration en 4 onglets : smoke tests e2e.
   Couvre : rendu initial (4 onglets, Suivi actif par défaut), navigation par
   clic entre onglets (contenu qui apparaît/disparaît, classe active),
   et lien direct par sous-route de hash (#encadrant/<onglet>).
   ============================================================ */
import { test, expect } from '@playwright/test';
import { watchErrors, gotoHash } from './helpers';

/* Supprime tout verrou PIN éventuel persisté d'un test précédent (comme
   encadrant.spec.ts) : sans ça, la porte PIN masquerait les onglets. */
const CLEAR_PIN = `localStorage.removeItem('ludaskia_encadrant_lock');`;

/* 1. Ouverture par défaut : 4 onglets, Suivi actif, contenu Suivi visible. */
test('4 onglets présents, Suivi actif par défaut, contenu Suivi visible', async ({ page }) => {
	const errors = watchErrors(page);
	await page.addInitScript(CLEAR_PIN);
	await gotoHash(page, 'encadrant');

	await expect(page.locator('.enc-tab')).toHaveCount(4);

	const actif = page.locator('.enc-tab.active');
	await expect(actif).toHaveCount(1);
	await expect(actif).toHaveAttribute('aria-current', 'page');
	await expect(actif.locator('.enc-tab-lab')).toHaveText('Suivi');

	await expect(page.locator('.enc-stats')).toBeVisible();

	expect(errors).toEqual([]);
});

/* 2. Clic sur Programme : contenu Programme visible, contenu Suivi disparu,
      onglet Programme actif. */
test("clic sur Programme : bascule le contenu et l'onglet actif", async ({ page }) => {
	const errors = watchErrors(page);
	await page.addInitScript(CLEAR_PIN);
	await gotoHash(page, 'encadrant');

	await page.locator('.enc-tab[data-tab="programme"]').click();

	await expect(page.locator('[data-act="seance-add"]')).toBeVisible();
	await expect(page.locator('.enc-stats')).toHaveCount(0);
	await expect(page.locator('.enc-tab[data-tab="programme"]')).toHaveClass(/active/);
	await expect(page.locator('.enc-tab[data-tab="programme"]')).toHaveAttribute(
		'aria-current',
		'page',
	);

	expect(errors).toEqual([]);
});

/* 3. Clic sur Réglages puis Profils : contenu propre à chaque onglet visible. */
test('clic sur Réglages puis Profils : contenu propre à chaque onglet', async ({ page }) => {
	const errors = watchErrors(page);
	await page.addInitScript(CLEAR_PIN);
	await gotoHash(page, 'encadrant');

	await page.locator('.enc-tab[data-tab="reglages"]').click();
	await expect(page.locator('select[data-act="set-niveau-ref"]')).toBeVisible();

	await page.locator('.enc-tab[data-tab="profils"]').click();
	await expect(page.locator('[data-act="enc-export"]')).toBeVisible();

	expect(errors).toEqual([]);
});

/* 4. Lien direct : #encadrant/reglages ouvre l'onglet Réglages sans clic. */
test('lien direct #encadrant/reglages : onglet Réglages actif au chargement', async ({ page }) => {
	const errors = watchErrors(page);
	await page.addInitScript(CLEAR_PIN);
	await gotoHash(page, 'encadrant/reglages');

	const actif = page.locator('.enc-tab.active');
	await expect(actif).toHaveCount(1);
	await expect(actif.locator('.enc-tab-lab')).toHaveText('Réglages');
	await expect(page.locator('select[data-act="set-niveau-ref"]')).toBeVisible();

	expect(errors).toEqual([]);
});
