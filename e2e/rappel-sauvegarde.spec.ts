/* ============================================================
   Encart « Pour les parents » (#306 §7) : installer l'app, sauvegarder la
   progression. Trois verrous CUMULÉS commandent son apparition (cf.
   `core/rappel-sauvegarde.ts`) : de l'engagement réel (au moins 3 activités
   depuis le dernier export), le délai des 48 h depuis le premier lancement
   écoulé, et pas d'export trop récent. On amorce ces trois signaux dans le
   `localStorage` AVANT chargement (`seedRappelSauvegardeScript`, helpers.ts —
   réutilisé aussi par `a11y-axe.spec.ts`), puis `gotoHash` comme d'habitude —
   les clés `tour_seen`/`parents_seen` évitent que l'onboarding ne masque
   l'accueil.
   ============================================================ */
import { test, expect } from '@playwright/test';
import { watchErrors, gotoHash, seedRappelSauvegardeScript } from './helpers';

test('les trois verrous réunis affichent l’encart, en tête d’accueil', async ({ page }) => {
	const errors = watchErrors(page);
	await page.addInitScript(seedRappelSauvegardeScript());
	await gotoHash(page, 'accueil');

	const rappel = page.locator('#rappelSauvegarde');
	await expect(rappel).toBeVisible();
	await expect(page.locator('#home > :first-child')).toHaveId('rappelSauvegarde');
	await expect(rappel.locator('.rappel-etiquette')).toContainText('Pour les parents');
	await expect(rappel.locator('.rappel-cta', { hasText: "Installer l'application" })).toBeVisible();
	await expect(
		rappel.locator('.rappel-cta', { hasText: 'Sauvegarder (tous les profils)' }),
	).toBeVisible();
	await expect(rappel.locator('.rappel-fermer')).toBeVisible();

	expect(errors).toEqual([]);
});

test('« Fermer » retire l’encart, qui ne revient pas dans la session (accueil → leçon → accueil)', async ({
	page,
}) => {
	const errors = watchErrors(page);
	await page.addInitScript(seedRappelSauvegardeScript());
	await gotoHash(page, 'accueil');
	await expect(page.locator('#rappelSauvegarde')).toBeVisible();

	await page.locator('.rappel-fermer').click();
	await expect(page.locator('#rappelSauvegarde')).toHaveCount(0);

	// On quitte l'accueil puis on y revient, dans la même session (le voile de
	// fermeture vit en `sessionStorage`, jamais reposé par une simple navigation).
	await gotoHash(page, 'lecon-num-comparer');
	await page.locator('#toolbarBurger').click();
	await page.locator('#btnHome').click();
	await expect(page.locator('#home')).toBeVisible();
	await expect(page.locator('#rappelSauvegarde')).toHaveCount(0);

	expect(errors).toEqual([]);
});

test("n'apparaît pas sans assez de signal d'activité (moins de 3 activités)", async ({ page }) => {
	const errors = watchErrors(page);
	await page.addInitScript(seedRappelSauvegardeScript({ activites: 2 })); // sous le seuil de 3
	await gotoHash(page, 'accueil');

	await expect(page.locator('#rappelSauvegarde')).toHaveCount(0);

	expect(errors).toEqual([]);
});
