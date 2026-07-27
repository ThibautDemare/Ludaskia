/* ============================================================
   Smoke e2e — « Leçons déjà vues en classe » (#478).
   Onglet Réglages de l'espace encadrant (#encadrant/reglages) : bloc #encVuBloc
   qui laisse l'adulte déclarer ce que l'enfant a travaillé HORS de l'application.
   Couvre : rendu du bloc, déclaration groupée par catégorie (mise à jour EN PLACE
   des cases/compteurs, sans perdre un dépliage ouvert), bascule du dépliage,
   répercussion sur le périmètre « ce que tu connais déjà » de #sprint-config, et
   persistance après rechargement.

   Catégorie utilisée dans tous les tests : math-calcul-mental (CE2, 17 leçons de
   calcul mental — aucune posée/tuiles/tri/problème donc toutes éligibles au
   sprint), reprise du même style d'ancrage que sprint-perimetre.spec.ts.
   ============================================================ */
import { test, expect } from '@playwright/test';
import { watchErrors, gotoHash } from './helpers';

const CLEAR_PIN = `localStorage.removeItem('ludaskia_encadrant_lock');`;
const CAT = 'math-calcul-mental';

/* Extrait le premier nombre d'un texte (« 3 sur 17 », « 12 leçons »…). */
function firstNumber(text: string): number {
	const m = text.match(/\d+/);
	return m ? Number(m[0]) : NaN;
}

test('bloc « vu en classe » : rendu sans erreur, catégories présentes', async ({ page }) => {
	const errors = watchErrors(page);
	await page.addInitScript(CLEAR_PIN);
	await gotoHash(page, 'encadrant/reglages');

	await expect(page.locator('#encVuBloc')).toBeVisible();
	await expect(page.locator('.enc-vu-cat')).not.toHaveCount(0);
	await expect(page.locator(`.enc-vu-cat[data-cat="${CAT}"]`)).toBeVisible();
	await expect(page.locator('#encVuTotal')).toContainText('sur');

	expect(errors).toEqual([]);
});

test('cocher une catégorie : les leçons suivent, compteurs à jour, dépliage ouvert préservé', async ({
	page,
}) => {
	const errors = watchErrors(page);
	await page.addInitScript(CLEAR_PIN);
	await gotoHash(page, 'encadrant/reglages');

	const cat = page.locator(`.enc-vu-cat[data-cat="${CAT}"]`);
	const liste = cat.locator('.enc-vu-list');
	const expandBtn = cat.locator('.enc-vu-expand');

	// Déplie la catégorie AVANT la déclaration groupée.
	await expandBtn.click();
	await expect(expandBtn).toHaveAttribute('aria-expanded', 'true');
	await expect(liste).toBeVisible();

	const lecons = cat.locator('.enc-vu-lecon');
	const total = await lecons.count();
	const totalAvant = await page.locator('#encVuTotal').textContent();

	// Déclare toute la catégorie (fraîchement chargée : aucune leçon déjà jouée ni
	// désactivée, donc les `total` cases suivent la case catégorie).
	await cat.locator('.enc-vu-cat-check').check();

	for (let i = 0; i < total; i++) {
		await expect(lecons.nth(i)).toBeChecked();
	}
	await expect(cat.locator('.enc-vu-count')).toHaveText(`${total} sur ${total}`);
	const totalApres = await page.locator('#encVuTotal').textContent();
	expect(firstNumber(totalApres ?? '')).toBeGreaterThan(firstNumber(totalAvant ?? ''));

	// Pas de re-rendu de zéro : le dépliage ouvert avant la déclaration l'est resté.
	await expect(expandBtn).toHaveAttribute('aria-expanded', 'true');
	await expect(liste).toBeVisible();

	expect(errors).toEqual([]);
});

test('dépliage : le bouton bascule aria-expanded et hidden de la liste', async ({ page }) => {
	const errors = watchErrors(page);
	await page.addInitScript(CLEAR_PIN);
	await gotoHash(page, 'encadrant/reglages');

	const cat = page.locator(`.enc-vu-cat[data-cat="${CAT}"]`);
	const liste = cat.locator('.enc-vu-list');
	const expandBtn = cat.locator('.enc-vu-expand');

	await expect(expandBtn).toHaveAttribute('aria-expanded', 'false');
	await expect(liste).toBeHidden();

	await expandBtn.click();
	await expect(expandBtn).toHaveAttribute('aria-expanded', 'true');
	await expect(liste).toBeVisible();

	await expandBtn.click();
	await expect(expandBtn).toHaveAttribute('aria-expanded', 'false');
	await expect(liste).toBeHidden();

	expect(errors).toEqual([]);
});

/* Amorce UNE leçon de la catégorie comme déjà jouée dans l'appli (comme
   sprint-perimetre.spec.ts) : le mélange vu/pas-vu rend le périmètre du sprint
   « choisissable » et son défaut adaptatif tombe sur « déjà vues ». Ainsi le
   compte de la catégorie sous ce périmètre part de 1 (seule cette leçon) et doit
   grimper après la déclaration du reste de la catégorie. */
const SEED_SEEN = `localStorage.setItem('e2e/ludaskia_lessonFirstSeen', JSON.stringify({
  'math-tables-addition@ce2': 1700000000000
}));`;

test("le compte « ce que tu connais déjà » de l'écran de config du sprint augmente après la déclaration", async ({
	page,
}) => {
	const errors = watchErrors(page);
	await page.addInitScript(CLEAR_PIN);
	await page.addInitScript(SEED_SEEN);

	await gotoHash(page, 'sprint-config');
	await expect(page.locator('.sc-scope[value="seen"]')).toBeChecked();
	const compteCat = page.locator(`.sc-option:has(.sc-radio[value="category:${CAT}"]) .sc-count`);
	const avant = firstNumber((await compteCat.textContent()) ?? '');
	expect(avant).toBe(1); // seule math-tables-addition, déjà jouée, est comptée

	// Déclare le reste de la catégorie depuis l'espace encadrant.
	await gotoHash(page, 'encadrant/reglages');
	await page.locator(`.enc-vu-cat[data-cat="${CAT}"] .enc-vu-cat-check`).check();

	// Retour à l'écran de config du sprint : le compte doit refléter la déclaration.
	await gotoHash(page, 'sprint-config');
	await expect(page.locator('.sc-scope[value="seen"]')).toBeChecked();
	const compteCatApres = page.locator(
		`.sc-option:has(.sc-radio[value="category:${CAT}"]) .sc-count`,
	);
	const apres = firstNumber((await compteCatApres.textContent()) ?? '');
	expect(apres).toBeGreaterThan(avant);

	expect(errors).toEqual([]);
});

test('persistance : les cases déclarées restent cochées après un rechargement', async ({
	page,
}) => {
	const errors = watchErrors(page);
	await page.addInitScript(CLEAR_PIN);
	await gotoHash(page, 'encadrant/reglages');

	const cat = page.locator(`.enc-vu-cat[data-cat="${CAT}"]`);
	await cat.locator('.enc-vu-expand').click();
	const cible = cat.locator('.enc-vu-lecon[data-lesson="math-doubles"]');
	await cible.check();
	await expect(cible).toBeChecked();

	await page.reload({ waitUntil: 'networkidle' });

	const catAprès = page.locator(`.enc-vu-cat[data-cat="${CAT}"]`);
	await catAprès.locator('.enc-vu-expand').click();
	await expect(catAprès.locator('.enc-vu-lecon[data-lesson="math-doubles"]')).toBeChecked();

	expect(errors).toEqual([]);
});
