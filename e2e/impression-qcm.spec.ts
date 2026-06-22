/* ============================================================
   Smoke e2e — impression des QCM en cases à cocher (#289).
   On vérifie que le chemin B (printScope → beforeprint →
   buildPrintableDOM) injecte bien les cases à cocher (.qcm-print-box,
   .qcm-print-choices) et la consigne « Coche la bonne réponse. »
   dans #sheets, sans ouvrir de vraie boîte de dialogue d'impression.
   ============================================================ */
import { test, expect } from '@playwright/test';
import { watchErrors, gotoHash } from './helpers';

test('impression QCM : cases à cocher et consigne injectées dans #sheets', async ({ page }) => {
	const errors = watchErrors(page);

	// Stub window.print : déclenche beforeprint (→ buildPrintableDOM) sans ouvrir
	// la boîte de dialogue du navigateur, inaccessible en Playwright.
	await page.addInitScript(() => {
		window.print = () => window.dispatchEvent(new Event('beforeprint'));
	});

	// Configurateur scopé à la catégorie Géométrie : les leçons sont visibles à
	// plat (pas d'accordéon à déplier), ce qui simplifie la sélection.
	await gotoHash(page, 'bilan-cat-math-geometrie');

	// Décocher toutes les leçons, puis ne cocher que « Les angles » (QCM pur).
	await page.locator('#bcSelectNone').click();
	const geoAnglesCheck = page.locator('.bc-lesson-check[value="geo-angles"]');
	await expect(geoAnglesCheck).toBeVisible();
	await geoAnglesCheck.click();

	// S'assurer qu'on est bien en mode « bilan » (défaut) — pas sprint.
	await expect(page.locator('.bc-mode-radio[value="bilan"]')).toBeChecked();

	// Cliquer « Imprimer » → printScope → window.print stubé → beforeprint →
	// buildPrintableDOM(scope) injecté dans #sheets.
	await page.locator('#bcPrint').click();

	// Les cases à cocher QCM doivent être présentes dans #sheets.
	const sheets = page.locator('#sheets');
	await expect(sheets.locator('.qcm-print-choices').first()).toBeVisible();
	await expect(sheets.locator('.qcm-print-box').first()).toBeVisible();

	// La consigne d'action propre aux blocs QCM doit apparaître.
	await expect(
		sheets.locator('.bloc-consigne', { hasText: 'Coche la bonne réponse.' }).first(),
	).toBeVisible();

	expect(errors).toEqual([]);
});
