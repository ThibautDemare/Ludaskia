/* ============================================================
   Smoke e2e — Grammaire : les phrases — ponctuation & types (#204).
   Deux leçons QCM dans la rubrique « Les phrases » :
   - F1 « Quel point à la fin ? » : variante boutons-symboles (. ? !)
     avec trou pointillé (#lqcmTrou) dans la phrase.
   - F2 « Quel type de phrase ? » : QCM texte à 3 options.
   ============================================================ */
import { test, expect } from '@playwright/test';
import { watchErrors, gotoHash } from './helpers';

test('la catégorie Grammaire propose les deux leçons « Les phrases »', async ({ page }) => {
	const errors = watchErrors(page);
	await gotoHash(page, 'categorie-fr-grammaire');
	await expect(page.locator('[data-id="fr-gram-ponctuation"]')).toBeVisible();
	await expect(page.locator('[data-id="fr-gram-type-phrase"]')).toBeVisible();
	expect(errors).toEqual([]);
});

test('F1 ponctuation : boutons-symboles (3 glyphes) + trou pointillé', async ({ page }) => {
	const errors = watchErrors(page);
	// Mono-mode QCM → lancement direct du runner (pas d'écran de choix de mode).
	await gotoHash(page, 'lecon-fr-gram-ponctuation');
	// La variante 'ponctuation' rend les choix dans .lqcm-choices-sym.
	const choicesContainer = page.locator('.lqcm-choices-sym');
	await choicesContainer.waitFor();
	// 3 glyphes (. ? !) affichés dans .lqcm-sym-glyph.
	const glyphes = choicesContainer.locator('.lqcm-sym-glyph');
	expect(await glyphes.count()).toBe(3);
	// Le trou final (cadre pointillé) est présent et vide au départ.
	const trou = page.locator('#lqcmTrou');
	await expect(trou).toBeAttached();
	expect(await trou.textContent()).toBe('');
	expect(errors).toEqual([]);
});

test('F1 ponctuation : cliquer un choix remplit le trou et affiche le feedback', async ({
	page,
}) => {
	const errors = watchErrors(page);
	await gotoHash(page, 'lecon-fr-gram-ponctuation');
	const choicesContainer = page.locator('.lqcm-choices-sym');
	await choicesContainer.waitFor();
	// Clic sur le 1er bouton (peut être juste ou faux — smoke uniquement).
	await page.locator('.sprint-choice').first().click();
	// Le feedback doit apparaître (id lqcmFeedback, hidden → visible).
	await expect(page.locator('#lqcmFeedback')).toBeVisible();
	// Le trou doit être rempli (classe 'rempli' + textContent non vide).
	const trou = page.locator('#lqcmTrou');
	await expect(trou).toHaveClass(/rempli/);
	expect(await trou.textContent()).not.toBe('');
	// Le bouton « Continuer » / « Voir mon résultat » doit apparaître.
	await expect(page.locator('#lqcmActions button')).toBeVisible();
	expect(errors).toEqual([]);
});

test('F2 type de phrase : 3 options texte + feedback après clic', async ({ page }) => {
	const errors = watchErrors(page);
	// Mono-mode QCM → lancement direct du runner.
	await gotoHash(page, 'lecon-fr-gram-type-phrase');
	const choices = page.locator('.sprint-choice');
	await choices.first().waitFor();
	// Exactement 3 options (les 3 types officiels CE2).
	expect(await choices.count()).toBe(3);
	// Vérification des 3 libellés enfant (ordre aléatoire → on trie).
	const labels = (await choices.allTextContents()).map((s) => s.trim()).sort();
	expect(labels).toEqual(['Donner un ordre', 'Poser une question', 'Raconter ou dire']);
	// Consigne d'action visible (#265) : « Que fait cette phrase ? » (et plus « le type »).
	await expect(page.locator('.lqcm-consigne')).toContainText('Que fait cette phrase');
	// Clic sur le 1er choix → feedback immédiat.
	await choices.first().click();
	await expect(page.locator('#lqcmFeedback')).toBeVisible();
	await expect(page.locator('#lqcmActions button')).toBeVisible();
	expect(errors).toEqual([]);
});

test('F2 type de phrase : on déroule la leçon jusqu’au bout, « Voir mon résultat ▶ » puis l’écran de résultat', async ({
	page,
}) => {
	const errors = watchErrors(page);
	await gotoHash(page, 'lecon-fr-gram-type-phrase');
	// NB_QUESTIONS (lecon-qcm.ts) vise 8 questions, sans doublon (dédup possible) : on
	// pilote la boucle sur le libellé du bouton « suivant », pas sur un compte figé.
	// Borne de sécurité anti-boucle-infinie.
	const MAX_ITER = 12;
	let sawResultLabel = false;
	for (let i = 0; i < MAX_ITER; i++) {
		await page.locator('.sprint-choice').first().waitFor();
		await page.locator('.sprint-choice').first().click();
		// Bouton « suivant » ciblé par son conteneur (#lqcmActions garde son id ; le
		// bouton lui-même n'a plus d'id propre depuis #371).
		const next = page.locator('#lqcmActions button');
		await expect(next).toBeVisible();
		const label = (await next.textContent())?.trim() ?? '';
		if (label.includes('résultat')) {
			sawResultLabel = true;
			await next.click();
			break;
		}
		expect(label).toContain('Continuer');
		await next.click();
	}
	expect(sawResultLabel).toBe(true); // la boucle a bien atteint la dernière question
	await expect(page.locator('.sprint-done')).toBeVisible();
	await expect(page.locator('.sprint-done-big')).toHaveText(/\d+ \/ \d+/);
	expect(errors).toEqual([]);
});
