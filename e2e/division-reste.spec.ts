/* ============================================================
   Smoke e2e — « Je découvre le reste » (#95).
   Leçon de division euclidienne avec quotient + reste, deux modes :
   - saisie  : runner « problème » (deux champs, feedback par champ)
   - qcm     : runner QCM classique (choix parmi 4 options)
   Non-régression : les leçons « Résolution de problèmes » (mono-mode)
   arrivent directement sur le runner sans passer par l'écran de modes.
   ============================================================ */
import { test, expect } from '@playwright/test';
import { watchErrors, gotoHash } from './helpers';

/* ---------- 1. Mode saisie : rendu sans erreur, deux champs, tout correct ---------- */
test('Je découvre le reste (saisie) : deux champs visibles, bonne réponse validée', async ({
	page,
}) => {
	const errors = watchErrors(page);
	// L'écran de choix de mode s'affiche via le hash mode-<id>.
	await gotoHash(page, 'mode-math-div-reste');
	await expect(page.locator('.mode-btn[data-mode="saisie"]')).toBeVisible();
	await page.locator('.mode-btn[data-mode="saisie"]').click();

	// L'énoncé du problème est bien présent.
	await expect(page.locator('.prob-enonce')).toBeVisible();
	// Lexique propre à la leçon (probLexique) : « Calcul X / Y », pas « Problème ».
	await expect(page.locator('.lqcm-progress-lab')).toContainText('Calcul');

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

/* ---------- 2. Feedback par case : quotient juste, reste faux ---------- */
test('Je découvre le reste (saisie) : feedback indépendant par champ', async ({ page }) => {
	const errors = watchErrors(page);
	await gotoHash(page, 'mode-math-div-reste');
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

/* ---------- 3. Mode QCM : rendu sans erreur, choix cliquable ---------- */
test('Je découvre le reste (QCM) : les choix sont affichés et cliquables', async ({ page }) => {
	const errors = watchErrors(page);
	await gotoHash(page, 'mode-math-div-reste');
	await expect(page.locator('.mode-btn[data-mode="qcm"]')).toBeVisible();
	await page.locator('.mode-btn[data-mode="qcm"]').click();

	// Le runner QCM affiche ses boutons de choix.
	const choices = page.locator('.sprint-choice');
	await choices.first().waitFor();
	// Le générateur QCM produit exactement 4 choix (correct + 3 distracteurs).
	expect(await choices.count()).toBe(4);

	// Cliquer le premier choix ne provoque pas d'erreur JS.
	await choices.first().click();

	expect(errors).toEqual([]);
});

/* ---------- 4. Non-régression : leçon « Résolution de problèmes » mono-mode ---------- */
// Les leçons de la catégorie math-problemes n'ont pas de modes → elles arrivent
// directement sur le runner sans passer par l'écran de choix de mode (.mode-btn absent).
test("Résolution de problèmes (mono-mode) : pas d'écran de modes, runner direct", async ({
	page,
}) => {
	const errors = watchErrors(page);
	// math-prob-composition = leçon mono-mode (ExerciseType sans `modes`).
	await gotoHash(page, 'lecon-math-prob-composition');

	// L'énoncé est directement visible — pas de .mode-btn intermédiaire.
	await expect(page.locator('.prob-enonce')).toBeVisible();
	await expect(page.locator('.mode-btn')).toHaveCount(0);
	// Lexique par défaut #199 conservé (non régressé par l'extension multi-mode).
	await expect(page.locator('.lqcm-progress-lab')).toContainText('Problème');

	expect(errors).toEqual([]);
});
