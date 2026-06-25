/* ============================================================
   Grands nombres CM1 « millions » (#240 / #327) — smoke e2e.
   En profil CM1 : les leçons de numération affichent de grands nombres
   GROUPÉS (classe .bignum, espace fine insécable) sans erreur ; la
   comparaison se joue et se valide ; la nouvelle leçon de décomposition
   MULTIPLICATIVE se rend et valide une bonne réponse.
   #327 : les champs .ans-grand reformatent leur contenu EN TEMPS RÉEL à la
   frappe (écho groupé par U+202F), et la correction reste valide malgré les
   séparateurs.
   Pattern maison : gotoHash, watchErrors + expect(errors).toEqual([]),
   sélecteurs stables (#btnVerify, .ans[data-answer], .mark.correct, .bignum).
   ============================================================ */
import { test, expect } from '@playwright/test';
import { watchErrors, seedAideVue } from './helpers';

/* Profil en CM1 (catalogue filtré sur le niveau CM1, génération « grands nombres »). */
const SEED_CM1 = `localStorage.setItem('ludaskia_profiles', JSON.stringify({ list: [{ uuid: 'e2e', name: 'E2E', emoji: '\\uD83E\\uDD8A', updatedAt: 1, niveauReference: 'cm1' }], active: 'e2e' }));`;

test.beforeEach(async ({ page }) => {
	await seedAideVue(page); // le mode tuiles de numération déclenche l'aide au 1er lancement
	await page.addInitScript(SEED_CM1);
});

test('CM1 : la Numération liste les leçons « grands nombres », dont la décompo multiplicative', async ({
	page,
}) => {
	const errors = watchErrors(page);
	await page.goto('app.html#categorie-math-numeration', { waitUntil: 'networkidle' });
	await expect(page.locator('.lesson-item[data-id="num-comparer"]')).toBeVisible();
	await expect(page.locator('.lesson-item[data-id="num-decompose-multiplicative"]')).toBeVisible();
	expect(errors).toEqual([]);
});

test('CM1 comparer : grands nombres groupés (.bignum), on tape le signe, validé', async ({
	page,
}) => {
	const errors = watchErrors(page);
	await page.goto('app.html#lecon-num-comparer', { waitUntil: 'networkidle' }); // mode saisie par défaut
	const field = page.locator('.ans').first();
	await field.waitFor();
	// Au moins un grand nombre groupé est rendu dans l'énoncé (classe .bignum).
	await expect(page.locator('.bignum').first()).toBeVisible();
	const expected = await field.getAttribute('data-answer'); // le signe attendu
	expect(['<', '=', '>']).toContain(expected);
	await field.fill(expected ?? '');
	await page.locator('#btnVerify').click();
	await expect(page.locator('.mark.correct').first()).toBeVisible();
	expect(errors).toEqual([]);
});

test('CM1 encadrer/intercaler : un grand nombre groupé est affiché, la réponse exacte est validée', async ({
	page,
}) => {
	const errors = watchErrors(page);
	await page.goto('app.html#lecon-num-encadrer-intercaler', { waitUntil: 'networkidle' });
	const field = page.locator('.ans').first();
	await field.waitFor();
	await expect(page.locator('.bignum').first()).toBeVisible(); // grand nombre groupé
	const good = await field.getAttribute('data-answer');
	await field.fill(good ?? '');
	await page.locator('#btnVerify').click();
	await expect(page.locator('.mark.correct').first()).toBeVisible();
	expect(errors).toEqual([]);
});

test('CM1 décomposition multiplicative : la leçon se rend et valide une bonne réponse', async ({
	page,
}) => {
	const errors = watchErrors(page);
	await page.goto('app.html#lecon-num-decompose-multiplicative', { waitUntil: 'networkidle' }); // mono-mode → fiche directe
	const field = page.locator('.ans').first();
	await field.waitFor();
	// L'énoncé contient le signe « × » (décomposition multiplicative) et un grand nombre.
	await expect(page.locator('.fiche')).toContainText('×');
	await expect(page.locator('.bignum').first()).toBeVisible();
	const good = await field.getAttribute('data-answer');
	await field.fill(good ?? '');
	await page.locator('#btnVerify').click();
	await expect(page.locator('.mark.correct').first()).toBeVisible();
	expect(errors).toEqual([]);
});

/* ---- #327 : écho groupé des grands nombres à la frappe (.ans-grand) ---- */

test('CM1 encadrer : saisie dans .ans-grand reformatée en temps réel (U+202F), correction accepte', async ({
	page,
}) => {
	// U+202F = espace fine insécable, séparateur de classes des grands nombres groupés.
	const U202F = String.fromCharCode(0x202f);
	const errors = watchErrors(page);
	await page.goto('app.html#lecon-num-encadrer-intercaler', { waitUntil: 'networkidle' });

	// La fiche CM1 génère 8 items ; la plupart sont des encadrements avec réponse ≥ 10 000
	// → champ .ans-grand. On attend le premier champ de ce type (garanti par le calibrage CM1).
	const grand = page.locator('.ans-grand').first();
	await grand.waitFor({ state: 'attached', timeout: 10_000 });

	// Réponse attendue lue depuis l'attribut (exercice aléatoire, jamais recalculée ici).
	const rawAnswer = await grand.getAttribute('data-answer');
	expect(rawAnswer).not.toBeNull();

	// Chiffres bruts : on retire tout séparateur éventuel déjà présent dans data-answer
	// (formatNombre peut y insérer U+202F selon le contexte).
	const digits = (rawAnswer ?? '').replace(/\D/g, '');
	// .ans-grand n'apparaît que si la réponse est ≥ 10 000 → au moins 5 chiffres.
	expect(digits.length).toBeGreaterThanOrEqual(5);

	// Frappe réelle via pressSequentially : déclenche l'évènement `input`, ce que fill()
	// ne fait pas (Playwright envoie des InputEvent synthétiques). L'écho groupé (#327)
	// écoute `input` délégué sur document → reformate .ans-grand après chaque chiffre.
	await grand.focus();
	await grand.pressSequentially(digits);

	// Après la frappe, la valeur affichée doit contenir au moins un U+202F (regroupement).
	const displayed = await grand.inputValue();
	expect(displayed).toContain(U202F);

	// Validation : nettoyerSaisieNombre neutralise les U+202F avant comparaison → correct.
	await page.locator('#btnVerify').click();
	await expect(grand.locator('xpath=following-sibling::span[contains(@class,"mark")]')).toHaveClass(
		/correct/,
	);

	expect(errors).toEqual([]);
});
