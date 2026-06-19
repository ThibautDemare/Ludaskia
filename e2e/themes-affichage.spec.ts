/* ============================================================
   Smoke test e2e : thèmes d'affichage Nuit et Clair-obscur (issue #224).
   - Deux thèmes de confort (niveau 1, jamais verrouillés) s'ajoutent à
     Forêt : « Nuit » (sombre fixe) et « Clair-obscur » (suit le système).
   - Le mode sombre est piloté par CSS pur (@media prefers-color-scheme:dark
     sur :root[data-theme='auto']) : emulateMedia suffit, pas de listener JS.
   En mode dev (Playwright utilise `npm run dev`), tous les thèmes sont
   débloqués → les 3 confort sont des boutons sélectionnables. Les thèmes
   de couleur (ciel, automne, lagon, fruit-rouge) sont aussi des boutons en
   dev ; en prod ils seraient verrouillés. On ne teste pas le gating ici.
   ============================================================ */
import { test, expect } from '@playwright/test';
import { watchErrors, gotoHash } from './helpers';

/* Utilitaire : lit la valeur de la custom property --paper sur :root, normalisée
   en minuscules. getComputedStyle renvoie la valeur DÉCLARÉE d'une custom property
   (le littéral `#ffffff`), pas une forme rgb() résolue — on compare donc en hex. */
async function getPaper(page: import('@playwright/test').Page): Promise<string> {
	return page.evaluate(() =>
		getComputedStyle(document.documentElement).getPropertyValue('--paper').trim().toLowerCase(),
	);
}

const PAPER_CLAIR = '#ffffff'; // base.scss --paper défaut
const PAPER_SOMBRE = '#222a36'; // themes.scss --paper nuit

test('Rendu sans erreur : deux sections, hint, et boutons nuit/auto présents', async ({ page }) => {
	const errors = watchErrors(page);
	await gotoHash(page, 'profils');

	// Deux sections de thèmes
	await expect(page.locator('.theme-section')).toHaveCount(2);

	// La ligne d'aide Clair-obscur
	await expect(page.locator('.theme-hint')).toBeVisible();

	// Les boutons nuit et auto sont présents et NON verrouillés (confort, niv 1)
	const btnNuit = page.locator('button[data-act="set-theme"][data-theme="nuit"]');
	const btnAuto = page.locator('button[data-act="set-theme"][data-theme="auto"]');
	await expect(btnNuit).toBeVisible();
	await expect(btnAuto).toBeVisible();
	// Aucun de ces boutons ne doit porter la classe « locked »
	await expect(btnNuit).not.toHaveClass(/locked/);
	await expect(btnAuto).not.toHaveClass(/locked/);

	expect(errors).toEqual([]);
});

test('Sélection du thème Nuit : data-theme, palette sombre, et persistance', async ({ page }) => {
	const errors = watchErrors(page);
	await gotoHash(page, 'profils');

	// Partir d'un état neutre : s'assurer qu'on n'est pas déjà sur Nuit
	// (si un test précédent a persisté Nuit, le clic ne changerait rien — on
	// clique d'abord Forêt, puis Nuit)
	const btnDefaut = page.locator('button[data-act="set-theme"][data-theme="defaut"]');
	await btnDefaut.click();
	await expect(page.locator('html')).toHaveAttribute('data-theme', 'defaut');

	// --- Sélectionner Nuit ---
	const btnNuit = page.locator('button[data-act="set-theme"][data-theme="nuit"]');
	await btnNuit.click();

	// L'attribut data-theme doit changer immédiatement
	await expect(page.locator('html')).toHaveAttribute('data-theme', 'nuit');

	// La palette sombre s'applique : --paper doit valoir la couleur sombre
	const paper = await getPaper(page);
	expect(paper).toBe(PAPER_SOMBRE);

	// --- Persistance après rechargement de la vue ---
	await gotoHash(page, 'profils');
	await expect(page.locator('html')).toHaveAttribute('data-theme', 'nuit');
	// Le bouton Nuit porte la classe « current »
	await expect(page.locator('button[data-act="set-theme"][data-theme="nuit"]')).toHaveClass(
		/current/,
	);

	expect(errors).toEqual([]);
});

test('Clair-obscur réagit au système en direct (emulateMedia, sans rechargement)', async ({
	page,
}) => {
	const errors = watchErrors(page);
	await gotoHash(page, 'profils');

	// Sélectionner le thème Clair-obscur
	const btnAuto = page.locator('button[data-act="set-theme"][data-theme="auto"]');
	await btnAuto.click();
	await expect(page.locator('html')).toHaveAttribute('data-theme', 'auto');

	// --- Système en mode CLAIR → rendu clair ---
	await page.emulateMedia({ colorScheme: 'light' });
	const paperLight = await getPaper(page);
	expect(paperLight).toBe(PAPER_CLAIR);

	// --- Basculer en mode SOMBRE sans recharger → rendu sombre immédiat ---
	await page.emulateMedia({ colorScheme: 'dark' });
	const paperDark = await getPaper(page);
	expect(paperDark).toBe(PAPER_SOMBRE);

	expect(errors).toEqual([]);
});
