/* ============================================================
   Smoke test e2e : bande décorative « forêt » de pied d'accueil.
   Le SVG est pré-généré (public/foret-pied.svg) puis inséré dans
   le DOM au chargement. On vérifie qu'il s'insère sans erreur et
   qu'il contient bien des arbres (groupes animables .sway).
   ============================================================ */
import { test, expect } from '@playwright/test';
import { watchErrors, gotoHash } from './helpers';

test("la forêt de pied de page s'insère sur l'accueil sans erreur", async ({ page }) => {
	const errors = watchErrors(page);
	await gotoHash(page, 'accueil');
	// Le SVG pré-généré a été récupéré puis injecté dans le conteneur.
	await expect(page.locator('#homeForet .foret-svg')).toBeAttached();
	// Plusieurs arbres présents (groupes porteurs de l'animation « vent »).
	expect(await page.locator('#homeForet .sway').count()).toBeGreaterThan(5);
	expect(errors).toEqual([]);
});
