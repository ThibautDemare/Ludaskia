/* ============================================================
   Modales statiques accessibles (#235) — focus-trap, arrière-plan
   inerte, fermeture Échap et restauration du focus sur les modales
   de gamification et la popup de choix de classe.

   Les modales de gamification (#recompenses, #trophees) restent dans
   le DOM et sont masquées par display:none → assertion toBeHidden().
   La popup d'onboarding (#onboardingNiveau) est créée et retirée du
   DOM dynamiquement → assertion toHaveCount(0) à la fermeture.
   ============================================================ */
import { test, expect } from '@playwright/test';
import { watchErrors, gotoHash } from './helpers';

/* Profil neuf SANS niveau de référence → popup de choix de classe au démarrage.
   Copié depuis niveau.spec.ts (même seed). */
const SEED_SANS_NIVEAU = `localStorage.setItem('ludaskia_profiles', JSON.stringify({ list: [{ uuid: 'e2e', name: 'E2E', emoji: '🦊', updatedAt: 1 }], active: 'e2e' }));`;

/* ================================================================
   A. Modale Récompenses (#recompenses)
   Ouverte via [data-act="open-recompenses"] dans #rewardNav.
   ESC-fermable ; reste dans le DOM (display:none).
   ================================================================ */

test('Récompenses — ouverture : overlay visible et arrière-plan inerte', async ({ page }) => {
	const errors = watchErrors(page);
	await gotoHash(page, 'accueil');

	await page.locator('[data-act="open-recompenses"]').click();

	// L'overlay est visible.
	await expect(page.locator('#recompenses')).toBeVisible();
	// La boîte dialog est présente à l'intérieur.
	await expect(page.locator('#recompenses .modal[role="dialog"]')).toBeVisible();
	// L'arrière-plan est rendu inerte pendant que la modale est ouverte.
	await expect(page.locator('.toolbar')).toHaveAttribute('inert', '');

	// Fermer proprement.
	await page.keyboard.press('Escape');
	expect(errors).toEqual([]);
});

test('Récompenses — focus-trap : Tab reste dans #recompenses', async ({ page }) => {
	const errors = watchErrors(page);
	await gotoHash(page, 'accueil');

	await page.locator('[data-act="open-recompenses"]').click();
	await expect(page.locator('#recompenses')).toBeVisible();

	const focusInside = () =>
		page.evaluate(() => {
			const overlay = document.getElementById('recompenses');
			return overlay ? overlay.contains(document.activeElement) : false;
		});

	// Tab vers l'avant : le focus boucle et reste dans la modale.
	for (let i = 0; i < 6; i++) {
		await page.keyboard.press('Tab');
		expect(await focusInside()).toBe(true);
	}
	// Maj+Tab vers l'arrière : même invariant (l'autre branche du trap).
	for (let i = 0; i < 6; i++) {
		await page.keyboard.press('Shift+Tab');
		expect(await focusInside()).toBe(true);
	}

	// Fermer proprement.
	await page.keyboard.press('Escape');
	expect(errors).toEqual([]);
});

test('Récompenses — Échap ferme et restaure le focus', async ({ page }) => {
	const errors = watchErrors(page);
	await gotoHash(page, 'accueil');

	await page.locator('[data-act="open-recompenses"]').click();
	await expect(page.locator('#recompenses')).toBeVisible();

	await page.keyboard.press('Escape');

	// La modale est masquée (display:none) — elle reste dans le DOM.
	await expect(page.locator('#recompenses')).toBeHidden();

	// Le focus revient sur le bouton déclencheur.
	const activeDataAct = await page.evaluate(
		() => (document.activeElement as HTMLElement | null)?.dataset.act ?? '',
	);
	expect(activeDataAct).toBe('open-recompenses');

	// L'arrière-plan n'est plus inerte.
	await expect(page.locator('.toolbar')).not.toHaveAttribute('inert', '');

	expect(errors).toEqual([]);
});

/* ================================================================
   B. Modale Trophées (#trophees) — smoke léger
   Même primitive → inutile de re-tester le trap en détail.
   ================================================================ */

test('Trophées — ouverture, Échap ferme et retire inert', async ({ page }) => {
	const errors = watchErrors(page);
	await gotoHash(page, 'accueil');

	await page.locator('[data-act="open-trophees"]').click();
	await expect(page.locator('#trophees')).toBeVisible();

	await page.keyboard.press('Escape');

	// La modale est masquée — elle reste dans le DOM.
	await expect(page.locator('#trophees')).toBeHidden();

	// L'arrière-plan n'est plus inerte.
	await expect(page.locator('.toolbar')).not.toHaveAttribute('inert', '');

	expect(errors).toEqual([]);
});

/* ================================================================
   C. Popup de choix de classe (#onboardingNiveau) — choix FORCÉ
   Navigation directe (pas gotoHash : il injecte niveauReference=ce2
   et masque la popup). Profil neuf sans niveauReference.
   ================================================================ */

test('Onboarding — Échap ne ferme PAS la popup (choix forcé)', async ({ page }) => {
	const errors = watchErrors(page);
	await page.addInitScript(SEED_SANS_NIVEAU);
	await page.goto('app.html#accueil', { waitUntil: 'networkidle' });

	// La popup est visible au chargement.
	await expect(page.locator('#onboardingNiveau')).toBeVisible();

	// Échap ne doit pas fermer (choix forcé, onEscape omis dans activateModal).
	await page.keyboard.press('Escape');
	await expect(page.locator('#onboardingNiveau')).toBeVisible();

	// Le focus-trap s'applique malgré tout.
	for (let i = 0; i < 4; i++) {
		await page.keyboard.press('Tab');
		const insideModal = await page.evaluate(() => {
			const overlay = document.getElementById('onboardingNiveau');
			const active = document.activeElement;
			return overlay ? overlay.contains(active) : false;
		});
		expect(insideModal).toBe(true);
	}

	expect(errors).toEqual([]);
});

test("Onboarding — clic sur CE2 ferme la popup et libère l'arrière-plan", async ({ page }) => {
	const errors = watchErrors(page);
	await page.addInitScript(SEED_SANS_NIVEAU);
	// Ce test isole l'a11y de la popup de CLASSE : on amorce les drapeaux du guide
	// de 1re visite (#330) pour qu'aucune modale ne s'enchaîne après le choix (sinon
	// le mot aux parents ré-inerte la toolbar). L'enchaînement classe→parents→tour
	// est couvert par tour.spec.ts.
	await page.addInitScript(
		`localStorage.setItem('e2e/ludaskia_tour_seen','true');localStorage.setItem('e2e/ludaskia_parents_seen','true');`,
	);
	await page.goto('app.html#accueil', { waitUntil: 'networkidle' });

	await expect(page.locator('#onboardingNiveau')).toBeVisible();

	// L'arrière-plan est inerte pendant le choix forcé.
	await expect(page.locator('.toolbar')).toHaveAttribute('inert', '');

	await page.locator('#onboardingNiveau [data-niveau="ce2"]').click();

	// L'overlay est retiré du DOM (contrairement aux modales de gamification).
	await expect(page.locator('#onboardingNiveau')).toHaveCount(0);

	// L'arrière-plan n'est plus inerte.
	await expect(page.locator('.toolbar')).not.toHaveAttribute('inert', '');

	expect(errors).toEqual([]);
});
