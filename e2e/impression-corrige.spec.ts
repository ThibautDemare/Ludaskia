/* ============================================================
   Smoke e2e — corrigé imprimable (#41).
   On vérifie que cocher #bcCorrige ajoute bien, après les pages vierges,
   une page de garde corrigé (.cover-corrige) et des cases cochées
   (.qcm-print-box--checked) + choix en gras (.qcm-print-choice--correct)
   dans #sheets.
   On vérifie aussi que, sans la case cochée, aucune de ces marques corrigé
   n'apparaît dans le DOM imprimé.
   ============================================================ */
import { test, expect } from '@playwright/test';
import { watchErrors, gotoHash } from './helpers';

/* Stub commun : window.print → beforeprint (→ buildPrintableDOM) sans ouvrir
   la boîte de dialogue du navigateur, inaccessible en Playwright. */
const STUB_PRINT = () => {
	window.print = () => window.dispatchEvent(new Event('beforeprint'));
};

/* Sélectionne la leçon geo-angles (QCM pur) dans le configurateur de bilan
   scopé à la catégorie Géométrie : les leçons y sont plates (pas d'accordéon),
   ce qui rend la sélection fiable. */
async function configurerGeoAngles(page: import('@playwright/test').Page) {
	await gotoHash(page, 'bilan-cat-math-geometrie');
	await page.locator('#bcSelectNone').click();
	const check = page.locator('.bc-lesson-check[value="geo-angles"]');
	await expect(check).toBeVisible();
	await check.click();
}

/* ------------------------------------------------------------------ */
/* Test 1 : avec corrigé coché                                         */
/* ------------------------------------------------------------------ */

test('corrigé coché : .cover-corrige, .qcm-print-box--checked et .qcm-print-choice--correct présents dans #sheets', async ({
	page,
}) => {
	const errors = watchErrors(page);

	await page.addInitScript(STUB_PRINT);
	await configurerGeoAngles(page);

	// Cocher la case « Imprimer aussi le corrigé ».
	const bcCorrige = page.locator('#bcCorrige');
	await expect(bcCorrige).toBeVisible();
	await bcCorrige.check();
	await expect(bcCorrige).toBeChecked();

	// Cliquer « Imprimer » → printScope → window.print stubé → beforeprint →
	// buildPrintableDOM(scope, corrige: true) injecté dans #sheets.
	await page.locator('#bcPrint').click();

	const sheets = page.locator('#sheets');

	// Page de garde du corrigé : classe print-only → hidden à l'écran mais présente
	// dans le DOM. On vérifie la présence (toBeAttached) et le texte via textContent.
	const coverCorrige = sheets.locator('.cover-corrige');
	await expect(coverCorrige).toBeAttached();
	const bigText = await coverCorrige.locator('.big').textContent();
	expect(bigText).toContain('Corrigé');

	// Les pages de contenu corrigé (.page) ne sont pas print-only → les items sont
	// visibles à l'écran. On vérifie au moins une case cochée et un choix correct.
	await expect(sheets.locator('.qcm-print-box--checked').first()).toBeVisible();

	// Au moins un choix correct affiché en gras.
	await expect(sheets.locator('.qcm-print-choice--correct').first()).toBeVisible();

	expect(errors).toEqual([]);
});

/* ------------------------------------------------------------------ */
/* Test 2 : sans corrigé (par défaut)                                  */
/* ------------------------------------------------------------------ */

test('corrigé non coché : .cover-corrige et .qcm-print-box--checked absents de #sheets', async ({
	page,
}) => {
	const errors = watchErrors(page);

	await page.addInitScript(STUB_PRINT);
	await configurerGeoAngles(page);

	// S'assurer que la case corrigé est bien décochée (état par défaut).
	const bcCorrige = page.locator('#bcCorrige');
	await expect(bcCorrige).toBeVisible();
	await expect(bcCorrige).not.toBeChecked();

	// Cliquer « Imprimer » sans cocher le corrigé.
	await page.locator('#bcPrint').click();

	const sheets = page.locator('#sheets');

	// Vérifier que les pages QCM vierges sont bien là (smoke de base).
	await expect(sheets.locator('.qcm-print-choices').first()).toBeVisible();

	// Aucune page de garde corrigé ne doit apparaître.
	await expect(sheets.locator('.cover-corrige')).toHaveCount(0);

	// Aucune case cochée ni choix correct en gras.
	await expect(sheets.locator('.qcm-print-box--checked')).toHaveCount(0);

	expect(errors).toEqual([]);
});
