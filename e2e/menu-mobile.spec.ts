/* ============================================================
   Tiroir latéral mobile de la barre d'outils.
   Sur mobile (le projet Playwright pilote un Pixel 5, < 600px), les
   contrôles secondaires (niveau/XP, profil, Accueil, Imprimer) sont
   repliés dans un tiroir ouvert par le hamburger ; logo + chrono +
   Vérifier restent dans la barre.
   ============================================================ */
import { test, expect } from '@playwright/test';
import { watchErrors, gotoHash } from './helpers';

test('le tiroir s’ouvre, expose les contrôles et se referme au tap sur le voile', async ({
	page,
}) => {
	const errors = watchErrors(page);
	await gotoHash(page, 'categorie-math-calcul-mental');

	const burger = page.locator('#toolbarBurger');
	const drawer = page.locator('#toolbarDrawer');
	const scrim = page.locator('#toolbarScrim');

	// État fermé par défaut
	await expect(burger).toBeVisible();
	await expect(scrim).toBeHidden();
	await expect(burger).toHaveAttribute('aria-expanded', 'false');

	// Ouverture
	await burger.click();
	await expect(drawer).toHaveClass(/open/);
	await expect(scrim).toBeVisible();
	await expect(burger).toHaveAttribute('aria-expanded', 'true');
	// Les contrôles secondaires deviennent accessibles dans le tiroir
	await expect(page.locator('#btnHome')).toBeVisible();

	// Fermeture au tap sur le voile (à gauche, hors de l'emprise du tiroir qui
	// occupe la droite de l'écran).
	await scrim.click({ position: { x: 16, y: 200 } });
	await expect(drawer).not.toHaveClass(/open/);
	await expect(scrim).toBeHidden();
	await expect(burger).toHaveAttribute('aria-expanded', 'false');

	expect(errors).toEqual([]);
});

test('un contrôle du tiroir agit puis le referme (Accueil)', async ({ page }) => {
	const errors = watchErrors(page);
	await gotoHash(page, 'categorie-math-calcul-mental');

	await page.locator('#toolbarBurger').click();
	await expect(page.locator('#toolbarDrawer')).toHaveClass(/open/);

	// Le bouton Accueil (dans le tiroir) ramène à l'accueil et referme le tiroir
	await page.locator('#btnHome').click();
	await expect(page.locator('#home')).toBeVisible();
	await expect(page.locator('#toolbarDrawer')).not.toHaveClass(/open/);

	expect(errors).toEqual([]);
});
