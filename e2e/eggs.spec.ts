/* ============================================================
   Smoke tests e2e : easter eggs (#331).

   Trois eggs « cœur sûr », ancrés sur l'accueil :
   - A « L'oiseau rieur » : chatouiller la mascotte (3 taps < 1500 ms).
     DÉTERMINISTE → smoke obligatoire de l'issue.
   - B « L'écureuil curieux » : hotspot .egg-foret-spot dans la bande forêt.
     Injecté après le fetch async du SVG → attente du sélecteur.
   - C « La luciole du soir » : apparition AMBIANTE aléatoire → NON testée.

   NE teste PAS la luciole (aléatoire, non déterministe en CI).
   ============================================================ */
import { test, expect } from '@playwright/test';
import { watchErrors, gotoHash } from './helpers';

/* Réinitialise l'album eggs du profil e2e avant chaque test pour que chaque
   test parte d'un état vierge (aucun egg trouvé → #eggAlbumNav est vide). */
async function clearEggState(page: import('@playwright/test').Page): Promise<void> {
	await page.addInitScript(() => {
		// Supprime la clé eggs du profil e2e (préfixe 'e2e/').
		localStorage.removeItem('e2e/ludaskia_eggs');
	});
}

/* ---------- Egg A : chatouiller la mascotte (smoke obligatoire) ---------- */

test("egg A : 3 taps sur la mascotte font apparaître le bouton d'album", async ({ page }) => {
	const errors = watchErrors(page);
	await clearEggState(page);
	await gotoHash(page, 'accueil');

	// La mascotte est dans #progression, injectée par renderProgression().
	const mascotte = page.locator('#progression .mascotte');
	await mascotte.waitFor({ state: 'attached' });

	// Avant toute découverte, #eggAlbumNav est vide (pas de bouton).
	await expect(page.locator('#eggAlbumNav .egg-album-btn')).toHaveCount(0);

	// Taper 3 fois rapidement (intervalles < 1500 ms) sur la mascotte.
	// { force: true } : la mascotte est en animation CSS continue (boucle),
	// ce qui la rend « instable » aux yeux de Playwright ; on force le clic
	// sans attendre la stabilité visuelle (le déclencheur JS écoute l'événement
	// quel que soit l'état de l'animation).
	await mascotte.click({ force: true });
	await mascotte.click({ force: true });
	await mascotte.click({ force: true });

	// Le bouton album doit apparaître dans #eggAlbumNav.
	await expect(page.locator('#eggAlbumNav .egg-album-btn')).toBeVisible();
	expect(errors).toEqual([]);
});

test("egg A : ouvrir l'album affiche la carte « L'oiseau rieur »", async ({ page }) => {
	const errors = watchErrors(page);
	await clearEggState(page);
	await gotoHash(page, 'accueil');

	const mascotte = page.locator('#progression .mascotte');
	await mascotte.waitFor({ state: 'attached' });

	// Déclencher l'egg A (force: true car la mascotte est en animation CSS continue).
	await mascotte.click({ force: true });
	await mascotte.click({ force: true });
	await mascotte.click({ force: true });

	// Ouvrir l'album via le bouton apparu.
	const albumBtn = page.locator('.egg-album-btn[data-act="open-egg-album"]');
	await expect(albumBtn).toBeVisible();
	await albumBtn.click();

	// La modale #eggAlbum doit être visible.
	const album = page.locator('#eggAlbum');
	await expect(album).toBeVisible();

	// La carte de l'egg A est présente avec le bon data-egg et le bon titre.
	const card = album.locator('.egg-card[data-egg="mascotte-rieuse"]');
	await expect(card).toBeVisible();
	await expect(card.locator('.egg-card-title')).toHaveText("L'oiseau rieur");

	// Fermer via le bouton principal.
	await page.locator('#eggAlbumOk').click();
	await expect(album).toBeHidden();

	expect(errors).toEqual([]);
});

test('egg A : fermeture de la modale album par la croix', async ({ page }) => {
	const errors = watchErrors(page);
	await clearEggState(page);
	await gotoHash(page, 'accueil');

	const mascotte = page.locator('#progression .mascotte');
	await mascotte.waitFor({ state: 'attached' });

	// Déclencher l'egg A puis ouvrir l'album (force: true pour l'animation CSS).
	await mascotte.click({ force: true });
	await mascotte.click({ force: true });
	await mascotte.click({ force: true });
	await page.locator('.egg-album-btn[data-act="open-egg-album"]').click();

	const album = page.locator('#eggAlbum');
	await expect(album).toBeVisible();

	// Fermer via la croix.
	await page.locator('#eggAlbumClose').click();
	await expect(album).toBeHidden();

	expect(errors).toEqual([]);
});

test('egg A : fermeture de la modale album par Échap (focus-trap)', async ({ page }) => {
	const errors = watchErrors(page);
	await clearEggState(page);
	await gotoHash(page, 'accueil');

	const mascotte = page.locator('#progression .mascotte');
	await mascotte.waitFor({ state: 'attached' });

	// Déclencher l'egg A puis ouvrir l'album (force: true pour l'animation CSS).
	await mascotte.click({ force: true });
	await mascotte.click({ force: true });
	await mascotte.click({ force: true });
	await page.locator('.egg-album-btn[data-act="open-egg-album"]').click();

	const album = page.locator('#eggAlbum');
	await expect(album).toBeVisible();

	// Échap doit fermer via le focus-trap (activateModal / onEscape).
	await page.keyboard.press('Escape');
	await expect(album).toBeHidden();

	expect(errors).toEqual([]);
});

/* ---------- Egg B : l'animal de la forêt (bonus) ----------
   Le hotspot .egg-foret-spot est injecté APRÈS le fetch async du SVG.
   On attend son apparition avant de cliquer. */

test("egg B : cliquer le hotspot forêt affiche l'animal et range la carte album", async ({
	page,
}) => {
	const errors = watchErrors(page);
	await clearEggState(page);
	await gotoHash(page, 'accueil');

	// Attendre que le hotspot soit injecté (après fetch async du SVG).
	const spot = page.locator('.egg-foret-spot');
	await spot.waitFor({ state: 'attached', timeout: 10_000 });

	// Avant le clic, l'album egg B n'est pas encore trouvé.
	// (Si egg A n'a pas été déclenché, le bouton album n'existe pas encore.)
	await spot.click();

	// Le bouton album doit apparaître (première découverte egg B).
	await expect(page.locator('#eggAlbumNav .egg-album-btn')).toBeVisible();

	// Ouvrir l'album et vérifier la carte egg B.
	await page.locator('.egg-album-btn[data-act="open-egg-album"]').click();
	const album = page.locator('#eggAlbum');
	await expect(album).toBeVisible();

	const cardB = album.locator('.egg-card[data-egg="ecureuil-foret"]');
	await expect(cardB).toBeVisible();
	await expect(cardB.locator('.egg-card-title')).toHaveText("L'écureuil curieux");

	await page.locator('#eggAlbumOk').click();
	await expect(album).toBeHidden();

	expect(errors).toEqual([]);
});

test('egg B + A : deux eggs trouvés, album contient deux cartes', async ({ page }) => {
	const errors = watchErrors(page);
	await clearEggState(page);
	await gotoHash(page, 'accueil');

	// Egg B d'abord (forêt).
	const spot = page.locator('.egg-foret-spot');
	await spot.waitFor({ state: 'attached', timeout: 10_000 });
	await spot.click();

	// Egg A ensuite (mascotte — force: true car animation CSS continue).
	const mascotte = page.locator('#progression .mascotte');
	await mascotte.waitFor({ state: 'attached' });
	await mascotte.click({ force: true });
	await mascotte.click({ force: true });
	await mascotte.click({ force: true });

	// Ouvrir l'album.
	await page.locator('.egg-album-btn[data-act="open-egg-album"]').click();
	const album = page.locator('#eggAlbum');
	await expect(album).toBeVisible();

	// Les deux cartes sont présentes.
	await expect(album.locator('.egg-card')).toHaveCount(2);
	await expect(album.locator('.egg-card[data-egg="ecureuil-foret"]')).toBeVisible();
	await expect(album.locator('.egg-card[data-egg="mascotte-rieuse"]')).toBeVisible();

	await page.locator('#eggAlbumOk').click();
	expect(errors).toEqual([]);
});
