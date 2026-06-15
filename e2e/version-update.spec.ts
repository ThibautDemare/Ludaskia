/* ============================================================
   Smoke test e2e de l'auto-actualisation (ui/version-check.ts).
   On simule un déploiement plus récent (version.json distant ≠ version
   embarquée) et on vérifie qu'à un moment sûr (accueil = écran calme) le
   voile de mise à jour + le message de la mascotte apparaissent, sans
   erreur de rendu. Le rechargement réel (location.reload) n'est pas
   asserté : on valide l'apparition du voile, déclenchée juste avant.
   ============================================================ */
import { test, expect } from '@playwright/test';
import { watchErrors } from './helpers';

test('voile de mise à jour : apparaît quand une nouvelle version est en ligne', async ({
	page,
}) => {
	// version.json distant volontairement différent de la version du build dev.
	await page.route('**/version.json*', (route) =>
		route.fulfill({
			status: 200,
			contentType: 'application/json',
			body: JSON.stringify({ version: 'e2e-nouvelle-version' }),
		}),
	);
	const errors = watchErrors(page);
	await page.goto('#accueil', { waitUntil: 'networkidle' });

	// La détection est différée (1re vérif ~1,5 s) et le reload n'a lieu qu'après
	// un court délai d'inactivité (écran calme) : on laisse le temps au voile.
	const overlay = page.locator('#updateOverlay');
	await expect(overlay).toBeVisible({ timeout: 12_000 });
	await expect(overlay.locator('.mascotte-bulle')).toContainText('à jour');
	expect(errors).toEqual([]);
});
