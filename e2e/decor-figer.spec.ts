/* ============================================================
   #785 — « Arrêter le décor » : bouton du pied de page (appli, vitrine, guide), case
   « Figer le décor » des préférences, renvoi dans l'espace encadrants.
   Écrit AVANT l'implémentation, à partir des critères de l'issue et du contrat DOM : ces
   tests décrivent ce qui doit être vrai, pas ce que le code fait. Le titre de chaque test
   nomme le critère qu'il tient.

   Contrat DOM : bouton `#footerDecor` (libellé visible ET nom accessible « Arrêter le
   décor » / « Relancer le décor ») ; décor figé = classe `decor-fige` sur <html> ; case
   `#prefDecor` (« Figer le décor ») sous `#prefAnim` ; vitrine/guide : réglage partagé dans
   `localStorage['ludaskia_decorFigeSite']`. Horloge : voir `decor-aide.ts`.
   ============================================================ */
import { test, expect } from '@playwright/test';
import type { Page } from '@playwright/test';
import { watchErrors, gotoHash } from './helpers';
import { FLOCONS } from '../src/core/decor-saison';
import {
	DATES,
	FUSEAU,
	attendreEtat,
	basculerDecor,
	fixerDate,
	ouvrirAccueil,
	ouvrirGuide,
	ouvrirVitrine,
} from './decor-aide';

test.use({ timezoneId: FUSEAU });

const CLE_SITE = 'ludaskia_decorFigeSite';
const CLEAR_PIN = `localStorage.removeItem('ludaskia_encadrant_lock');`;

/* États d'animation de la forêt : un par arbre. */
async function etatsForet(page: Page): Promise<string[]> {
	return page.evaluate(() =>
		[...document.querySelectorAll('#homeForet .sway')].map(
			(el) => getComputedStyle(el).animationPlayState,
		),
	);
}

async function attendreForet(page: Page, etat: 'running' | 'paused'): Promise<void> {
	await expect
		.poll(async () => {
			const etats = await etatsForet(page);
			return etats.length > 5 && etats.every((e) => e === etat);
		}, `tous les arbres de la forêt devraient être « ${etat} »`)
		.toBe(true);
}

/* ---------- Appli : le bouton ---------- */

test('critères 1, 2, 18 : en décembre la forêt bouge ; le bouton la fige, un nouvel appui la relance, et le libellé suit', async ({
	page,
}) => {
	const errors = watchErrors(page);
	await ouvrirAccueil(page, DATES.noel);

	// Critère 18 : sans réglage, même en décembre, la forêt bouge.
	await attendreEtat(page, 'bouge');
	await attendreForet(page, 'running');
	await expect(page.locator('html')).not.toHaveClass(/decor-fige/);

	await basculerDecor(page);
	await attendreEtat(page, 'fige'); // critère 2 : le libellé change, aucun doublon d'état
	await expect(page.locator('html')).toHaveClass(/decor-fige/);
	await attendreForet(page, 'paused'); // critère 1 : la forêt ne bouge plus

	await basculerDecor(page);
	await attendreEtat(page, 'bouge');
	await expect(page.locator('html')).not.toHaveClass(/decor-fige/);
	await attendreForet(page, 'running');

	expect(errors).toEqual([]);
});

/* Le bouton doit se laisser actionner sans souris et sans viser trop fin : sur les trois pages. */
const PAGES = [
	{ nom: 'appli', ouvrir: (p: Page) => ouvrirAccueil(p, DATES.noel) },
	{ nom: 'vitrine', ouvrir: (p: Page) => ouvrirVitrine(p, DATES.noel) },
	{ nom: 'guide', ouvrir: (p: Page) => ouvrirGuide(p, DATES.noel) },
] as const;

for (const { nom, ouvrir } of PAGES) {
	test(`critère 3 (${nom}) : atteignable à Tab, activable à Entrée et Espace, zone tactile d'au moins 44 × 44 px`, async ({
		page,
	}) => {
		const errors = watchErrors(page);
		await ouvrir(page);
		const bouton = page.locator('#footerDecor');
		await expect(bouton).toBeVisible();

		// Zone tactile.
		const boite = await bouton.boundingBox();
		expect(boite, 'le bouton a une boîte').not.toBeNull();
		expect(boite!.width, 'largeur ≥ 44 px').toBeGreaterThanOrEqual(44);
		expect(boite!.height, 'hauteur ≥ 44 px').toBeGreaterThanOrEqual(44);

		// Atteint AU CLAVIER : on part du bouton cookie voisin et on tabule (puis on
		// remonte), sans jamais focaliser le bouton directement.
		const atteint = async (touche: 'Tab' | 'Shift+Tab'): Promise<boolean> => {
			await page.locator('#footerCookie').focus();
			for (let i = 0; i < 4; i++) {
				await page.keyboard.press(touche);
				if (await bouton.evaluate((el) => el === document.activeElement)) return true;
			}
			return false;
		};
		const atteignable = (await atteint('Tab')) || (await atteint('Shift+Tab'));
		expect(atteignable, 'Tab doit amener le focus sur #footerDecor depuis le pied de page').toBe(
			true,
		);

		// Entrée puis Espace : deux bascules, et le focus RESTE sur le bouton (sans quoi le
		// lecteur d'écran n'annonce pas le nouveau libellé : critère 2, « annoncé »).
		await page.keyboard.press('Enter');
		await attendreEtat(page, 'fige');
		await expect(bouton).toBeFocused();
		await page.keyboard.press('Space');
		await attendreEtat(page, 'bouge');
		await expect(bouton).toBeFocused();

		expect(errors).toEqual([]);
	});
}

/* ---------- Appli : mémorisation par profil ---------- */

test('critère 4 : le réglage est mémorisé PAR PROFIL (rechargement, puis autre profil)', async ({
	page,
}) => {
	const errors = watchErrors(page);
	await ouvrirAccueil(page, DATES.noel);
	await basculerDecor(page);
	await attendreEtat(page, 'fige');

	// Rechargement : toujours figé (la forêt ne rebouge pas).
	await page.reload({ waitUntil: 'networkidle' });
	await expect(page.locator('#homeForet .sway').first()).toBeAttached();
	await attendreEtat(page, 'fige');
	await expect(page.locator('html')).toHaveClass(/decor-fige/);
	await attendreForet(page, 'paused');

	// Un AUTRE profil n'est pas figé…
	await page.evaluate(() => {
		const m = JSON.parse(localStorage.getItem('ludaskia_profiles') ?? 'null');
		m.list.push({
			uuid: 'e2e-bis',
			name: 'Bis',
			emoji: '🐻',
			updatedAt: 1,
			niveauReference: 'ce2',
		});
		m.active = 'e2e-bis';
		localStorage.setItem('ludaskia_profiles', JSON.stringify(m));
		localStorage.setItem('e2e-bis/ludaskia_tour_seen', 'true');
		localStorage.setItem('e2e-bis/ludaskia_parents_seen', 'true');
	});
	await page.reload({ waitUntil: 'networkidle' });
	await expect(page.locator('#homeForet .sway').first()).toBeAttached();
	await attendreEtat(page, 'bouge');
	await expect(page.locator('html')).not.toHaveClass(/decor-fige/);
	await attendreForet(page, 'running');

	// … et le premier l'est resté.
	await page.evaluate(() => {
		const m = JSON.parse(localStorage.getItem('ludaskia_profiles') ?? 'null');
		m.active = 'e2e';
		localStorage.setItem('ludaskia_profiles', JSON.stringify(m));
	});
	await page.reload({ waitUntil: 'networkidle' });
	await expect(page.locator('#homeForet .sway').first()).toBeAttached();
	await attendreEtat(page, 'fige');

	expect(errors).toEqual([]);
});

/* ---------- Vitrine et guide : mémorisé sur l'appareil, partagé ---------- */

test("critères 1, 5 : figé sur la vitrine, le décor l'est aussi sur le guide (et inversement)", async ({
	page,
}) => {
	const errors = watchErrors(page);
	await ouvrirVitrine(page, DATES.noel);
	await attendreEtat(page, 'bouge');
	await basculerDecor(page);
	await attendreEtat(page, 'fige');
	// Critère 1 sur la vitrine : les flocons de décembre ne bougent plus.
	await expect
		.poll(() =>
			page.evaluate(() =>
				[...document.querySelectorAll('.decor-flocon')].map(
					(el) => getComputedStyle(el).animationPlayState,
				),
			),
		)
		.toEqual(Array(FLOCONS.length).fill('paused'));
	expect(await page.evaluate((k) => localStorage.getItem(k), CLE_SITE)).toBe('true');

	// Le guide, chargé ensuite, est figé : le réglage vaut pour les deux pages.
	await ouvrirGuide(page, DATES.noel);
	await attendreEtat(page, 'fige');
	await basculerDecor(page);
	await attendreEtat(page, 'bouge');
	expect(await page.evaluate((k) => localStorage.getItem(k), CLE_SITE)).not.toBe('true');

	// Relancé sur le guide, relancé sur la vitrine.
	await ouvrirVitrine(page, DATES.noel);
	await attendreEtat(page, 'bouge');

	expect(errors).toEqual([]);
});

test("critère 28 : le réglage de la vitrine ne touche pas celui des profils de l'appli, et inversement", async ({
	page,
}) => {
	const errors = watchErrors(page);

	// Vitrine figée → l'appli (profil e2e) bouge toujours.
	await ouvrirVitrine(page, DATES.noel);
	await basculerDecor(page);
	await attendreEtat(page, 'fige');
	await ouvrirAccueil(page, DATES.noel);
	await attendreEtat(page, 'bouge');
	await expect(page.locator('html')).not.toHaveClass(/decor-fige/);
	await attendreForet(page, 'running');

	// Appli figée → la vitrine, relancée d'abord, reste vivante.
	await ouvrirVitrine(page, DATES.noel);
	await basculerDecor(page); // relance la vitrine
	await attendreEtat(page, 'bouge');
	await ouvrirAccueil(page, DATES.noel);
	await basculerDecor(page);
	await attendreEtat(page, 'fige');
	await ouvrirVitrine(page, DATES.noel);
	await attendreEtat(page, 'bouge');
	expect(await page.evaluate((k) => localStorage.getItem(k), CLE_SITE)).not.toBe('true');

	expect(errors).toEqual([]);
});

/* ---------- Appli : la case des préférences ---------- */

test('critère 6 : « Figer le décor » juste sous « Réduire les animations », avec son aide ; la case et le bouton sont un seul réglage', async ({
	page,
}) => {
	const errors = watchErrors(page);
	await ouvrirAccueil(page, DATES.noel);
	await gotoHash(page, 'profils');

	const caseDecor = page.locator('#prefDecor');
	await expect(caseDecor).toBeVisible();
	await expect(caseDecor).not.toBeChecked();
	await expect(caseDecor).toBeEnabled();
	// Libellé INTENTIONNEL (c'est lui que l'enfant lit et que le guide cite).
	await expect(page.locator('label:has(#prefDecor)')).toContainText('Figer le décor');

	// « Juste après » : parmi les cases du bloc, #prefDecor suit immédiatement #prefAnim.
	const ids = await page.evaluate(() =>
		[...document.querySelectorAll('#preferences input[type="checkbox"]')].map((c) => c.id),
	);
	expect(ids.indexOf('prefDecor'), `ordre des cases : ${ids.join(', ')}`).toBe(
		ids.indexOf('prefAnim') + 1,
	);
	expect(ids.indexOf('prefAnim')).toBeGreaterThanOrEqual(0);

	// Une phrase d'aide mentionne la forêt ET le décor de saison.
	await expect(
		page
			.locator('#preferences')
			.getByText(/forêt/i)
			.filter({ hasText: /saison/i })
			.first(),
	).toBeVisible();

	// La case fige : le bouton de l'accueil le dit.
	await caseDecor.check();
	await expect(page.locator('html')).toHaveClass(/decor-fige/);
	await gotoHash(page, 'accueil');
	await attendreEtat(page, 'fige');

	// Le bouton relance : la case se décoche.
	await basculerDecor(page);
	await attendreEtat(page, 'bouge');
	await gotoHash(page, 'profils');
	await expect(page.locator('#prefDecor')).not.toBeChecked();

	// Et dans l'autre sens : le bouton fige, la case se coche.
	await gotoHash(page, 'accueil');
	await basculerDecor(page);
	await attendreEtat(page, 'fige');
	await gotoHash(page, 'profils');
	await expect(page.locator('#prefDecor')).toBeChecked();

	expect(errors).toEqual([]);
});

test('critère 7 (appli) : « Réduire les animations » fige le décor, case verrouillée « déjà inclus », bouton masqué', async ({
	page,
}) => {
	const errors = watchErrors(page);
	await ouvrirAccueil(page, DATES.noel);
	await attendreEtat(page, 'bouge'); // témoin : sans réduction, le bouton est là
	await gotoHash(page, 'profils');

	// Témoin négatif : tant que rien n'est réduit, la mention n'est pas là.
	await expect(page.locator('#preferences')).not.toContainText(/déjà inclus/i);

	await page.locator('#prefAnim').check();
	const caseDecor = page.locator('#prefDecor');
	await expect(caseDecor).toBeChecked();
	await expect(caseDecor).toBeDisabled();
	await expect(page.locator('#preferences')).toContainText(/déjà inclus/i);

	await gotoHash(page, 'accueil');
	await expect(page.locator('#home')).toBeVisible();
	await expect(page.locator('#footerDecor')).toBeHidden();

	expect(errors).toEqual([]);
});

/* Vitrine et guide : le réglage du SYSTÈME (prefers-reduced-motion) fige déjà tout. Chaque test
   porte son TÉMOIN : sans réduction de mouvement le bouton est bien là (sinon « invisible »
   serait vrai par absence pure du bouton, et le test ne garderait rien). */
for (const { nom, ouvrir } of PAGES.filter((p) => p.nom !== 'appli')) {
	test(`critère 7 (${nom}) : mouvement réduit par le système, le bouton est invisible`, async ({
		browser,
		baseURL,
		page,
	}) => {
		const errors = watchErrors(page);
		const temoin = await browser.newContext({
			timezoneId: FUSEAU,
			reducedMotion: 'no-preference',
			baseURL,
		});
		const pageTemoin = await temoin.newPage();
		await ouvrir(pageTemoin);
		await expect(
			pageTemoin.locator('#footerDecor'),
			'témoin : visible sans réduction',
		).toBeVisible();
		await temoin.close();

		await page.emulateMedia({ reducedMotion: 'reduce' });
		await ouvrir(page);
		await expect(page.locator('#footerDecor')).toBeHidden();
		expect(errors).toEqual([]);
	});
}

/* ---------- Espace encadrants ---------- */

test("critère 8 : l'espace encadrants renvoie vers « Figer le décor », juste après « apparitions surprises »", async ({
	page,
}) => {
	const errors = watchErrors(page);
	await page.addInitScript(CLEAR_PIN);
	await gotoHash(page, 'encadrant/reglages');

	const ligne = page.locator('label:has([data-pref="sansApparitionsSurprises"])');
	await expect(ligne).toBeVisible();
	await expect(ligne).toContainText('Désactiver les apparitions surprises');

	// Le texte suivant (frère immédiat) est un renvoi, pas une autre case à cocher.
	const suivant = ligne.locator('xpath=following-sibling::*[1]');
	// Libellé cité INTENTIONNEL : c'est le nom exact que l'adulte cherchera côté enfant.
	await expect(suivant).toContainText('Figer le décor');
	await expect(suivant.locator('[data-pref]')).toHaveCount(0);

	expect(errors).toEqual([]);
});

/* ---------- Le bouton n'existe que sur l'accueil ---------- */

test("critère 27 : le bouton n'apparaît sur aucun autre écran de l'appli (profils, matières, leçon)", async ({
	page,
}) => {
	const errors = watchErrors(page);
	await ouvrirAccueil(page, DATES.noel);
	await expect(page.locator('#footerDecor')).toBeVisible(); // témoin : il est bien sur l'accueil

	await gotoHash(page, 'profils');
	await expect(page.locator('#profils')).toBeVisible();
	await expect(page.locator('#footerDecor')).toBeHidden();

	await gotoHash(page, 'matieres');
	await expect(page.locator('#matieres')).toBeVisible();
	await expect(page.locator('#footerDecor')).toBeHidden();

	await gotoHash(page, 'lecon-geo-angles');
	await expect(page.locator('body')).toHaveClass(/session-active/);
	await expect(page.locator('#footerDecor')).toBeHidden();

	// Retour à l'accueil : il revient (le masquage n'est pas définitif).
	await gotoHash(page, 'accueil');
	await expect(page.locator('#home')).toBeVisible();
	await expect(page.locator('#footerDecor')).toBeVisible();

	expect(errors).toEqual([]);
});

/* ---------- « Figer le décor » ne coupe QUE le décor ---------- */

test('critère 25 : décor figé, la pluie de cookies reste animée', async ({ page }) => {
	const errors = watchErrors(page);
	await ouvrirAccueil(page, DATES.noel);
	await basculerDecor(page);
	await attendreEtat(page, 'fige');
	await expect(page.locator('html')).toHaveClass(/decor-fige/);

	await page.locator('#footerCookie').click();
	await expect.poll(() => page.locator('.cookie-rain-item').count()).toBeGreaterThan(1);

	// Chaque cookie porte une animation, et elle tourne.
	const etats = await page.evaluate(() =>
		[...document.querySelectorAll('.cookie-rain-item')].map((el) => {
			const s = getComputedStyle(el);
			return { nom: s.animationName, etat: s.animationPlayState };
		}),
	);
	for (const e of etats) {
		expect(e.nom, 'le cookie garde son animation de chute').not.toBe('none');
		expect(e.etat, 'figer le décor ne doit pas suspendre la pluie de cookies').toBe('running');
	}

	expect(errors).toEqual([]);
});

/* ---------- Région d'état annoncée au clic (relecture a11y) ---------- */

/* Le changement de libellé d'un bouton qui a déjà le focus n'est pas relu par tous les lecteurs
   d'écran : une région `role="status"` voisine (hors du bouton) porte l'annonce. Les phrases
   « Décor arrêté. » / « Décor relancé. » sont INTENTIONNELLES : c'est leur contenu qu'entend
   l'enfant. L'exigence testée : région présente et VIDE au chargement (une région live créée avec
   son texte n'est pas annoncée), alimentée par le clic seulement, et non fondue dans le bouton. */
for (const { nom, ouvrir } of PAGES) {
	test(`gate (A) (${nom}) : région d'état vide au chargement, « arrêté » puis « relancé » au clic, hors du bouton`, async ({
		page,
	}) => {
		const errors = watchErrors(page);
		await ouvrir(page);
		await attendreEtat(page, 'bouge');

		const region = page.locator('#footerDecor + .footer-decor-etat[role="status"]');
		await expect(region, 'une seule région, juste après le bouton').toHaveCount(1);
		await expect(region, 'vide au chargement').toHaveText('');

		await basculerDecor(page);
		await attendreEtat(page, 'fige');
		await expect(region).toHaveText('Décor arrêté.');
		// La région n'est pas dans le bouton : son nom accessible reste son seul libellé.
		await expect(page.locator('#footerDecor .footer-decor-etat')).toHaveCount(0);
		await expect(page.getByRole('button', { name: 'Relancer le décor', exact: true })).toHaveId(
			'footerDecor',
		);

		await basculerDecor(page);
		await attendreEtat(page, 'bouge');
		await expect(region).toHaveText('Décor relancé.');
		await expect(page.getByRole('button', { name: 'Arrêter le décor', exact: true })).toHaveId(
			'footerDecor',
		);

		expect(errors).toEqual([]);
	});
}

/* ---------- Case verrouillée par l'appareil (prefers-reduced-motion) ---------- */

test("gate (B) : l'appareil demande moins d'animations, la case « Figer le décor » est cochée, verrouillée, et le dit ; le profil prime", async ({
	page,
}) => {
	const errors = watchErrors(page);
	await ouvrirAccueil(page, DATES.noel);
	await gotoHash(page, 'profils');
	const caseDecor = page.locator('#prefDecor');
	const inclus = page.locator('#prefDecorInclus');

	// Témoin, sans émulation : case libre, mention vide (sinon « verrouillée » serait un état fixe).
	await expect(caseDecor).toBeEnabled();
	await expect(caseDecor).not.toBeChecked();
	await expect(inclus).toHaveText('');

	// Basculement à chaud : la page reste ouverte, l'appareil change de préférence.
	await page.emulateMedia({ reducedMotion: 'reduce' });
	await expect(caseDecor).toBeChecked();
	await expect(caseDecor).toBeDisabled();
	await expect(inclus).toContainText('ton appareil');
	await expect(inclus).not.toContainText('Réduire les animations');

	// Le profil l'emporte quand « Réduire les animations » est cochée en plus.
	await page.locator('#prefAnim').check();
	await expect(caseDecor).toBeDisabled();
	await expect(inclus).toContainText('Réduire les animations');
	await expect(inclus).not.toContainText('ton appareil');

	// Profil décoché, appareil toujours réduit : retour à la mention de l'appareil.
	await page.locator('#prefAnim').uncheck();
	await expect(caseDecor).toBeDisabled();
	await expect(inclus).toContainText('ton appareil');

	// L'appareil revient à la normale : la case se libère sans rechargement.
	await page.emulateMedia({ reducedMotion: 'no-preference' });
	await expect(caseDecor).toBeEnabled();
	await expect(caseDecor).not.toBeChecked();
	await expect(inclus).toHaveText('');

	expect(errors).toEqual([]);
});

test('gate (B) : appareil réduit dès le chargement (profil non réduit), la case est cochée et verrouillée', async ({
	page,
}) => {
	const errors = watchErrors(page);
	await page.emulateMedia({ reducedMotion: 'reduce' });
	await fixerDate(page, DATES.noel);
	await gotoHash(page, 'profils');
	await expect(page.locator('#prefAnim')).not.toBeChecked();
	await expect(page.locator('#prefDecor')).toBeChecked();
	await expect(page.locator('#prefDecor')).toBeDisabled();
	await expect(page.locator('#prefDecorInclus')).toContainText('ton appareil');
	expect(errors).toEqual([]);
});
