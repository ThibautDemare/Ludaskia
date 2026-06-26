/* ============================================================
   Smoke tests e2e : pied de page global + easter egg « pluie de cookies » (#336).

   Couvre les DEUX entrées (le pied de page est global) :
   - Vitrine (index.html, `page.goto('./')`) : pied de page enrichi (copyright +
     année, « sans cookies », code source, bouton cookie) ; clic → pluie ; croquer
     un cookie le fait disparaître. Pas d'album (la vitrine ne charge pas les eggs).
   - App (app.html, `gotoHash`) : pied de page sur l'accueil ; le cookie range la
     carte « La pluie de cookies » dans l'album (#331) ; et le pied de page est
     MASQUÉ pendant une session (body.session-active).

   Sélecteurs stables : #footerCookie, .cookie-rain-layer, .cookie-rain-item,
   #siteFooter, .egg-card[data-egg="pluie-de-cookies"]. Le cookie tombe en
   animation continue → clic en { force: true } (comme la mascotte dans eggs.spec).
   ============================================================ */
import { test, expect } from '@playwright/test';
import { watchErrors, gotoHash, seedAideVue } from './helpers';

/* Réinitialise l'album eggs du profil e2e (préfixe 'e2e/') avant chaque test app. */
async function clearEggState(page: import('@playwright/test').Page): Promise<void> {
	await page.addInitScript(() => localStorage.removeItem('e2e/ludaskia_eggs'));
}

/* Liste d'orthographe fraîche (un mot, atelier non fait) : suffit à entrer dans le
   runner d'ortho (écran d'effort) pour vérifier le masquage du pied de page. */
const ORTHO_SEED = {
	banque: {
		m1: {
			id: 'm1',
			mot: 'chat',
			entourage: [],
			atelierFait: false,
			validation: {},
			revision: { palier: 0, prochaineRevision: null, reussites: 0, dernierTest: null },
			origine: 'liste',
		},
	},
	listes: [{ id: 'l1', label: 'Ma liste', motIds: ['m1'], createdAt: 1, updatedAt: 1 }],
	motIdParForme: { chat: 'm1' },
};

/* ---------- Vitrine (index.html) ---------- */

test('vitrine : pied de page enrichi (copyright + année, sans cookies, code source, cookie)', async ({
	page,
}) => {
	const errors = watchErrors(page);
	await page.goto('./', { waitUntil: 'networkidle' });

	const footer = page.locator('.v-footer');
	await expect(footer).toBeVisible();
	// Copyright avec l'année courante (remplie par fillFooterYear, pas en dur).
	await expect(page.locator('.v-footer-copy')).toContainText(/20\d\d/);
	await expect(footer).toContainText("Ce site n'utilise pas de cookies");
	// Lien « code source » conservé.
	await expect(page.locator('.v-footer .v-gh')).toBeVisible();
	// Bouton cookie présent + nom accessible.
	const cookie = page.locator('#footerCookie');
	await expect(cookie).toBeVisible();
	await expect(cookie).toHaveAttribute('aria-label', /cookies/i);

	expect(errors).toEqual([]);
});

test('vitrine : le cookie déclenche une pluie, et croquer un cookie le fait disparaître', async ({
	page,
}) => {
	const errors = watchErrors(page);
	await page.goto('./', { waitUntil: 'networkidle' });

	// Aucune pluie au départ.
	await expect(page.locator('.cookie-rain-layer')).toHaveCount(0);

	await page.locator('#footerCookie').click();

	// Une averse apparaît (couche + plusieurs cookies).
	await expect(page.locator('.cookie-rain-layer')).toHaveCount(1);
	const items = page.locator('.cookie-rain-layer .cookie-rain-item');
	await expect.poll(async () => items.count()).toBeGreaterThan(1);

	// Croquer un cookie TOMBÉ : il disparaît (le total décroît d'exactement un).
	// On laisse d'abord la chute se terminer (animation FINIE `forwards`, ~3,6 s
	// max, bien avant le retrait auto à 9 s) : le cookie est alors posé en bas,
	// DANS le viewport → clic en { force } (on n'a pas à attraper en plein vol).
	const n = await items.count();
	await page.waitForTimeout(4500);
	await items.first().click({ force: true });
	await expect(items).toHaveCount(n - 1);

	expect(errors).toEqual([]);
});

/* ---------- App (app.html) ---------- */

test('app : pied de page global visible sur l’accueil', async ({ page }) => {
	const errors = watchErrors(page);
	await clearEggState(page);
	await gotoHash(page, 'accueil');

	const footer = page.locator('#siteFooter');
	await expect(footer).toBeVisible();
	await expect(footer).toContainText(/20\d\d/); // année du copyright
	await expect(footer).toContainText("Ce site n'utilise pas de cookies");
	await expect(page.locator('.site-footer-gh')).toBeVisible();
	await expect(page.locator('#footerCookie')).toBeVisible();

	expect(errors).toEqual([]);
});

test('app : le cookie déclenche la pluie et range la carte « La pluie de cookies »', async ({
	page,
}) => {
	const errors = watchErrors(page);
	await clearEggState(page);
	await gotoHash(page, 'accueil');

	// Album vide au départ (aucune surprise trouvée).
	await expect(page.locator('#eggAlbumNav .egg-album-btn')).toHaveCount(0);

	await page.locator('#footerCookie').click();

	// La pluie tombe…
	await expect.poll(async () => page.locator('.cookie-rain-item').count()).toBeGreaterThan(1);
	// … et le souvenir est rangé : le bouton d'album apparaît (couche pluie en
	// pointer-events:none → le bouton reste cliquable).
	const albumBtn = page.locator('.egg-album-btn[data-act="open-egg-album"]');
	await expect(albumBtn).toBeVisible();
	await albumBtn.click();

	const album = page.locator('#eggAlbum');
	await expect(album).toBeVisible();
	const card = album.locator('.egg-card[data-egg="pluie-de-cookies"]');
	await expect(card).toBeVisible();
	await expect(card.locator('.egg-card-title')).toHaveText('La pluie de cookies');

	expect(errors).toEqual([]);
});

test('app : le pied de page (et son cookie) est masqué pendant une session', async ({ page }) => {
	const errors = watchErrors(page);
	await clearEggState(page);
	// Leçon mono-mode QCM → runner direct (session : currentMode = 'lecon').
	await gotoHash(page, 'lecon-geo-angles');

	// body.session-active masque le pied de page en plein effort.
	await expect(page.locator('body')).toHaveClass(/session-active/);
	await expect(page.locator('#siteFooter')).toBeHidden();

	expect(errors).toEqual([]);
});

test('app : le pied de page est aussi masqué pendant une séance d’orthographe', async ({
	page,
}) => {
	const errors = watchErrors(page);
	await clearEggState(page);
	await seedAideVue(page); // l'atelier/tuiles peut auto-afficher l'aide → on la neutralise
	// Le runner d'ortho ne pose PAS currentMode : showOrthoRunView active la classe
	// lui-même (régression couverte ici, distincte du runner QCM ci-dessus).
	await page.addInitScript((seed) => {
		localStorage.setItem('e2e/ludaskia_ortho', JSON.stringify(seed));
	}, ORTHO_SEED);
	await gotoHash(page, 'ortho-l1');

	await expect(page.locator('body')).toHaveClass(/session-active/);
	await expect(page.locator('#siteFooter')).toBeHidden();

	expect(errors).toEqual([]);
});
