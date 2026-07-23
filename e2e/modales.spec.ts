/* ============================================================
   Modales custom accessibles (#230) — smoke tests : ouverture,
   validation, erreur inline, ESC, restauration du focus,
   confirm destructif et focus-trap.
   Les modales remplacent window.prompt/confirm/alert ; on les
   déclenche depuis l'ESPACE ENCADRANTS (#234), où vivent désormais
   la création de profil (« Nouveau profil ») et les actions
   destructives (réinitialiser / supprimer) — dans l'onglet Profils
   depuis la restructuration en onglets (#459).

   Note sélecteurs : les overlays statiques de gamification
   (celebrate, levelup, recompenses, trophees) et d'onboarding
   ont tous un `id`. L'overlay créé dynamiquement par ui-modal.ts
   n'en a pas. On le cible donc par `.modal-overlay:not([id])`.
   ============================================================ */
import { test, expect } from '@playwright/test';
import { watchErrors, gotoHash } from './helpers';

/* Alias : l'overlay ui-modal est le seul sans id dans le DOM. */
const uiModalOverlay = '.modal-overlay:not([id])';

/* ---------- 1. Ouverture sans erreur JS ---------- */
test('ouverture du prompt « Nouveau profil » : overlay visible, sans erreur', async ({ page }) => {
	const errors = watchErrors(page);
	await gotoHash(page, 'encadrant/profils');

	await page.locator('[data-act="enc-add"]').click();

	// L'overlay ui-modal est présent et visible.
	await expect(page.locator(uiModalOverlay)).toBeVisible();
	// La boîte est bien un dialog (pas alertdialog pour un prompt).
	await expect(page.locator(`${uiModalOverlay} .modal[role="dialog"]`)).toBeVisible();
	// Le titre et le champ de saisie sont visibles.
	await expect(page.locator(`${uiModalOverlay} .modal-title`)).toBeVisible();
	await expect(page.locator('#uimodal-input')).toBeVisible();

	// Annuler proprement.
	await page.keyboard.press('Escape');
	await expect(page.locator(uiModalOverlay)).toHaveCount(0);

	expect(errors).toEqual([]);
});

/* ---------- 2. Enter soumet le prompt et crée le profil ---------- */
test('Enter soumet le prompt et crée le profil', async ({ page }) => {
	const errors = watchErrors(page);
	await gotoHash(page, 'encadrant/profils');

	const before = await page.locator('.enc-prof-card').count();

	await page.locator('[data-act="enc-add"]').click();
	await expect(page.locator('#uimodal-input')).toBeVisible();

	await page.locator('#uimodal-input').fill('TestE2E');
	await page.keyboard.press('Enter');

	// La modale se ferme.
	await expect(page.locator(uiModalOverlay)).toHaveCount(0);

	// Une carte profil de plus est apparue.
	const after = await page.locator('.enc-prof-card').count();
	expect(after).toBe(before + 1);

	expect(errors).toEqual([]);
});

/* ---------- 3. Validation d'un champ vide : erreur inline, modale reste ouverte ---------- */
test('prompt vide : erreur inline visible, la modale reste ouverte', async ({ page }) => {
	const errors = watchErrors(page);
	await gotoHash(page, 'encadrant/profils');

	await page.locator('[data-act="enc-add"]').click();
	await expect(page.locator('#uimodal-input')).toBeVisible();

	// Vider le champ et cliquer le bouton de validation dans la modale ui-modal.
	await page.locator('#uimodal-input').fill('');
	await page.locator(`${uiModalOverlay} .modal-ok`).click();

	// L'erreur inline devient visible (l'attribut hidden doit être absent).
	const errEl = page.locator('#uimodal-error');
	await expect(errEl).toBeVisible();

	// La modale est TOUJOURS présente.
	await expect(page.locator(uiModalOverlay)).toBeVisible();

	// Nettoyer.
	await page.keyboard.press('Escape');
	expect(errors).toEqual([]);
});

/* ---------- 4. ESC ferme la modale et n'ajoute pas de profil ---------- */
test('ESC ferme le prompt sans créer de profil', async ({ page }) => {
	const errors = watchErrors(page);
	await gotoHash(page, 'encadrant/profils');

	const before = await page.locator('.enc-prof-card').count();

	await page.locator('[data-act="enc-add"]').click();
	await expect(page.locator(uiModalOverlay)).toBeVisible();

	await page.keyboard.press('Escape');

	// La modale est disparue.
	await expect(page.locator(uiModalOverlay)).toHaveCount(0);

	// Aucune carte profil supplémentaire.
	const after = await page.locator('.enc-prof-card').count();
	expect(after).toBe(before);

	expect(errors).toEqual([]);
});

/* ---------- 5. Restauration du focus après ESC ---------- */
test('ESC sur le prompt restaure le focus sur le bouton déclencheur', async ({ page }) => {
	const errors = watchErrors(page);
	await gotoHash(page, 'encadrant/profils');

	await page.locator('#encAdd').click();
	await expect(page.locator(uiModalOverlay)).toBeVisible();

	await page.keyboard.press('Escape');
	await expect(page.locator(uiModalOverlay)).toHaveCount(0);

	// Le focus doit être revenu sur le bouton « Nouveau profil ».
	const activeId = await page.evaluate(() => document.activeElement?.id);
	expect(activeId).toBe('encAdd');

	expect(errors).toEqual([]);
});

/* ---------- 6. Confirm destructif (reset) : alertdialog, focus sur l'action sûre ---------- */
test('confirm destructif reset : alertdialog + focus sur .modal-ok + ESC annule', async ({
	page,
}) => {
	const errors = watchErrors(page);
	await gotoHash(page, 'encadrant/profils');

	// Déplier « Gérer ce profil » de la première carte, puis « Réinitialiser ».
	await page.locator('.enc-gerer > summary').first().click();
	await page.locator('[data-act="enc-reset"]').first().click();

	// La boîte est bien un alertdialog (action destructive).
	const modal = page.locator(`${uiModalOverlay} .modal[role="alertdialog"]`);
	await expect(modal).toBeVisible();

	// Le bouton danger est présent dans la modale.
	await expect(modal.locator('.modal-danger')).toBeVisible();

	// Le focus initial doit être sur l'action SÛRE (.modal-ok), pas sur .modal-danger.
	const activeClass = await page.evaluate(() => document.activeElement?.className ?? '');
	expect(activeClass).toMatch(/modal-ok/);
	expect(activeClass).not.toMatch(/modal-danger/);

	// ESC annule et ferme la modale sans réinitialiser.
	await page.keyboard.press('Escape');
	await expect(page.locator(uiModalOverlay)).toHaveCount(0);

	expect(errors).toEqual([]);
});

/* ---------- 7. Focus-trap : Tab reste dans .modal ---------- */
test("focus-trap : Tab reste à l'intérieur de la modale", async ({ page }) => {
	const errors = watchErrors(page);
	await gotoHash(page, 'encadrant/profils');

	await page.locator('[data-act="enc-add"]').click();
	await expect(page.locator(uiModalOverlay)).toBeVisible();

	// Appuyer Tab plusieurs fois et vérifier que le focus reste dans .modal.
	for (let i = 0; i < 6; i++) {
		await page.keyboard.press('Tab');
		const insideModal = await page.evaluate(() => {
			// La modale ui-modal est le seul .modal-overlay sans id.
			const overlay = document.querySelector('.modal-overlay:not([id])');
			const modal = overlay?.querySelector('.modal');
			const active = document.activeElement;
			return modal ? modal.contains(active) : false;
		});
		expect(insideModal).toBe(true);
	}

	// Nettoyer.
	await page.keyboard.press('Escape');
	expect(errors).toEqual([]);
});
