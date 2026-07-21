/* ============================================================
   Smoke e2e — Organisation et gestion de données CM1 « Lire un graphique / un
   tableau » (#257). Deux leçons de LECTURE de données en SAISIE chiffrée, sans
   runner ni exerciseKind dédiés : de simples exercices `text` portant une
   `figure` (diagramme SVG / tableau HTML), qui routent vers le chemin de
   saisie générique du catalogue (mono-mode, comme num-valeur-position) :
   - `donnees-barres-lire` : lire la hauteur d'une barre sur un axe gradué
     (figure `.figure-graphique-barres`, un `<svg>`) ;
   - `donnees-tableau-lire` : lire une cellule d'un tableau à double entrée
     (figure `.figure-tableau-donnees`, un vrai `<table>` HTML sémantique).
   La catégorie `math-donnees` est CM1-only (#92 : catégorie vide → « Bientôt
   disponible » sous un profil CE2, testé aussi ici en invariant).
   ============================================================ */
import { test, expect, type Page } from '@playwright/test';
import { watchErrors, gotoHash } from './helpers';

/* Profil en CM1 (leçons `levels: ['cm1']`, invisibles sous le niveau CE2 par défaut) —
   même pattern que droite-graduee.spec.ts. */
const SEED_CM1 = `localStorage.setItem('ludaskia_profiles', JSON.stringify({ list: [{ uuid: 'e2e', name: 'E2E', emoji: '🦊', updatedAt: 1, niveauReference: 'cm1' }], active: 'e2e' }));`;

async function gotoCM1(page: Page, hash: string): Promise<void> {
	await page.addInitScript(SEED_CM1);
	await page.goto(`app.html#${hash}`, { waitUntil: 'networkidle' });
}

test('CM1 : la catégorie « Organisation et gestion de données » liste ses deux leçons', async ({
	page,
}) => {
	const errors = watchErrors(page);
	await gotoCM1(page, 'categorie-math-donnees');
	await expect(page.locator('.lesson-item[data-id="donnees-barres-lire"]')).toBeVisible();
	await expect(page.locator('.lesson-item[data-id="donnees-tableau-lire"]')).toBeVisible();
	expect(errors).toEqual([]);
});

test('diagramme en barres : la figure SVG se rend, la bonne valeur est validée', async ({
	page,
}) => {
	const errors = watchErrors(page);
	await gotoCM1(page, 'lecon-donnees-barres-lire'); // mono-mode → fiche directe (plusieurs questions)
	await expect(page.locator('.figure-graphique-barres').first()).toBeVisible();

	const field = page.locator('.ans').first();
	await field.waitFor();
	const good = await field.getAttribute('data-answer');
	await field.fill(good ?? '');
	await page.locator('#btnVerify').click();

	await expect(page.locator('.mark.correct').first()).toBeVisible();
	expect(errors).toEqual([]);
});

test('tableau à double entrée : la figure <table> sémantique se rend, la bonne valeur est validée', async ({
	page,
}) => {
	const errors = watchErrors(page);
	await gotoCM1(page, 'lecon-donnees-tableau-lire'); // mono-mode → fiche directe (plusieurs questions)

	const table = page.locator('table.figure-tableau-donnees').first();
	await expect(table).toBeVisible();
	await expect(table.locator('caption')).toHaveCount(1);
	expect(await table.locator('th[scope="col"]').count()).toBeGreaterThanOrEqual(3); // 3-4 colonnes
	await expect(table.locator('th[scope="row"]').first()).toBeVisible();

	const field = page.locator('.ans').first();
	await field.waitFor();
	const good = await field.getAttribute('data-answer');
	await field.fill(good ?? '');
	await page.locator('#btnVerify').click();

	await expect(page.locator('.mark.correct').first()).toBeVisible();
	expect(errors).toEqual([]);
});

test('CE2 : la catégorie « Organisation et gestion de données » est encore vide (Bientôt disponible)', async ({
	page,
}) => {
	// math-donnees n'a que des leçons CM1 (#92) : sous le niveau CE2 par défaut de
	// `gotoHash`, le catalogue de la catégorie est vide → écran de repli.
	const errors = watchErrors(page);
	await gotoHash(page, 'categorie-math-donnees');
	await expect(page.locator('.cat-empty')).toBeVisible();
	await expect(page.locator('.cat-empty-title')).toContainText('Bientôt disponible');
	expect(errors).toEqual([]);
});
