/* ============================================================
   Smoke e2e — paliers « questions par leçon » du bilan (#180).
   Les 4 paliers ont migré des emojis (🐢/🚶/🏃/🎯) vers des icônes
   Phosphor de quantité (barres signal + pile). On vérifie : nouveaux
   libellés, icônes SVG (plus d'emoji), sélecteurs de valeur inchangés.
   ============================================================ */
import { test, expect } from '@playwright/test';
import { watchErrors, gotoHash } from './helpers';

test('les 4 paliers du bilan : nouveaux libellés + icônes SVG, valeurs inchangées', async ({
	page,
}) => {
	const errors = watchErrors(page);
	await gotoHash(page, 'bilan-custom');
	const nbq = page.locator('.bc-nbq');
	await expect(nbq).toBeVisible();

	// Les sélecteurs de valeur (load-bearing) ne changent pas.
	for (const value of ['3', '5', '10', 'all']) {
		await expect(page.locator(`.bc-nbq-radio[value="${value}"]`)).toHaveCount(1);
	}

	// Nouveaux libellés explicites de quantité croissante.
	for (const label of ['Un peu', 'Moyen', 'Beaucoup', 'Tout']) {
		await expect(nbq).toContainText(label);
	}
	// Anciens libellés d'axe « vitesse » retirés.
	await expect(nbq).not.toContainText('Rapide');
	await expect(nbq).not.toContainText('Costaud');

	// Chaque palier porte une icône Phosphor SVG (plus d'emoji).
	await expect(nbq.locator('.bc-nbq-item svg.ph-icon')).toHaveCount(4);

	expect(errors).toEqual([]);
});
