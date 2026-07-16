/* ============================================================
   Smoke e2e — « Division euclidienne — quotient et reste » (#251).
   Leçon CM1-only (levels: ['cm1']), catégorie math-calcul-mental, sur le MÊME
   runner « problème » à deux champs (quotient + reste) que la sœur CE2
   « Je découvre le reste » (cf. division-reste.spec.ts) — registre
   abstrait-numérique, hors sprint. Deux modes : saisie et qcm.
   Profil CM1 seedé (comme divisibilite-ordre-grandeur.spec.ts) : cette leçon
   est absente du catalogue CE2 par défaut.
   ============================================================ */
import { test, expect } from '@playwright/test';
import { watchErrors } from './helpers';

/* Profil CM1 : le catalogue est filtré sur CM1 → la leçon y apparaît (absente
   en profil CE2 par défaut). */
const SEED_CM1 = `localStorage.setItem('ludaskia_profiles', JSON.stringify({ list: [{ uuid: 'e2e', name: 'E2E', emoji: '\\uD83E\\uDD8A', updatedAt: 1, niveauReference: 'cm1' }], active: 'e2e' }));`;

test.beforeEach(async ({ page }) => {
	await page.addInitScript(SEED_CM1);
});

/* ---------- 1. Visibilité : la leçon apparaît en profil CM1 ---------- */
test('CM1 : « Quotient et reste » est listée dans le Calcul mental #251', async ({ page }) => {
	const errors = watchErrors(page);
	await page.goto('app.html#categorie-math-calcul-mental', { waitUntil: 'networkidle' });
	await expect(page.locator('.lesson-item[data-id="math-division-euclidienne"]')).toBeVisible();
	expect(errors).toEqual([]);
});

/* ---------- 2. Mode saisie : rendu sans erreur, deux champs, tout correct ---------- */
test('Division euclidienne (saisie) : deux champs visibles, bonne réponse validée', async ({
	page,
}) => {
	const errors = watchErrors(page);
	await page.goto('app.html#mode-math-division-euclidienne', { waitUntil: 'networkidle' });
	await expect(page.locator('.mode-btn[data-mode="saisie"]')).toBeVisible();
	await page.locator('.mode-btn[data-mode="saisie"]').click();

	await expect(page.locator('.prob-enonce')).toBeVisible();

	// Exactement deux champs (quotient + reste).
	const inputs = page.locator('.prob-input');
	await inputs.first().waitFor();
	expect(await inputs.count()).toBe(2);

	// Remplir les deux champs avec la bonne réponse (exposée via data-answer).
	const n = await inputs.count();
	for (let i = 0; i < n; i++) {
		const inp = inputs.nth(i);
		const answer = await inp.getAttribute('data-answer');
		await inp.fill(answer!);
	}

	// Valider : les deux marques doivent passer en .correct.
	await page.locator('#probVerif').click();
	expect(await page.locator('.prob-mark.correct').count()).toBe(2);

	expect(errors).toEqual([]);
});

/* ---------- 3. Correction indépendante par champ ---------- */
test('Division euclidienne (saisie) : feedback indépendant par champ', async ({ page }) => {
	const errors = watchErrors(page);
	await page.goto('app.html#mode-math-division-euclidienne', { waitUntil: 'networkidle' });
	await page.locator('.mode-btn[data-mode="saisie"]').click();

	const inputs = page.locator('.prob-input');
	await inputs.first().waitFor();

	// Champ 0 = quotient → bonne réponse.
	const champQuotient = inputs.nth(0);
	const bonneReponseQuotient = await champQuotient.getAttribute('data-answer');
	await champQuotient.fill(bonneReponseQuotient!);

	// Champ 1 = reste → valeur délibérément fausse (bonne réponse + 5, jamais 0 accidentel).
	const champReste = inputs.nth(1);
	const bonneReponseReste = await champReste.getAttribute('data-answer');
	const mauvaise = String(Number(bonneReponseReste) + 5);
	await champReste.fill(mauvaise);

	await page.locator('#probVerif').click();

	// La marque du quotient (data-for="0") est correcte.
	await expect(page.locator('.prob-mark[data-for="0"].correct')).toBeVisible();
	// La marque du reste (data-for="1") est erronée (et NON correcte).
	await expect(page.locator('.prob-mark[data-for="1"].wrong')).toBeVisible();
	await expect(page.locator('.prob-mark[data-for="1"].correct')).toHaveCount(0);

	expect(errors).toEqual([]);
});

/* ---------- 4. Mode QCM : rendu sans erreur, choix cliquable ---------- */
test('Division euclidienne (QCM) : les choix sont affichés et cliquables', async ({ page }) => {
	const errors = watchErrors(page);
	await page.goto('app.html#mode-math-division-euclidienne', { waitUntil: 'networkidle' });
	await expect(page.locator('.mode-btn[data-mode="qcm"]')).toBeVisible();
	await page.locator('.mode-btn[data-mode="qcm"]').click();

	const choices = page.locator('.sprint-choice');
	await choices.first().waitFor();
	// Le générateur QCM produit exactement 4 choix (correct + 3 distracteurs).
	expect(await choices.count()).toBe(4);

	await choices.first().click();

	expect(errors).toEqual([]);
});
