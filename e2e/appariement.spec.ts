/* ============================================================
   Smoke e2e — Vocabulaire « Relier les familles de mots » (#392).
   Nouveau type d'interaction « appariement » (relier des paires par des
   LIGNES de liaison), runner dédié ui/lecon-appariement.ts + widget
   ui/appariement.ts. On vérifie le rendu du plateau (deux colonnes), le tap
   en deux temps (souris/tap ET clavier), la correction différée (marques
   ✓/✗ + solution en cas d'erreur) et l'enchaînement des manches — sans
   erreur de rendu.

   La bonne réponse n'est PAS exposée dans le DOM avant Vérifier (voulu,
   a11y) : impossible de relier « juste » à coup sûr sans la recalculer.
   Les tests relient donc le i-ème mot de gauche au i-ème mot de droite
   (ordre DOM) et vérifient la MÉCANIQUE (liens créés, Vérifier activé,
   marques + solution/feedback affichés, Continuer enchaîne) — pas un
   score parfait.
   ============================================================ */
import { test, expect } from '@playwright/test';
import { watchErrors, gotoHash, seedAideVue } from './helpers';

/* Le runner « appariement » déclenche l'aide contextuelle au 1er lancement. */
test.beforeEach(async ({ page }) => {
	await seedAideVue(page);
});

test('la catégorie Vocabulaire propose la leçon « Relier les familles de mots »', async ({
	page,
}) => {
	const errors = watchErrors(page);
	await gotoHash(page, 'categorie-fr-vocabulaire');
	await expect(page.locator('[data-id="fr-vocab-familles-relier"]')).toBeVisible();
	expect(errors).toEqual([]);
});

test('relier chaque mot au tap : plateau, liens, vérification et manche suivante', async ({
	page,
}) => {
	const errors = watchErrors(page);
	await gotoHash(page, 'lecon-fr-vocab-familles-relier'); // mono-mode → lancement direct
	await page.locator('.lapp-mot').first().waitFor();

	const gauche = page.locator('.lapp-mot[data-side="g"]');
	const droite = page.locator('.lapp-mot[data-side="d"]');
	const nbG = await gauche.count();
	expect(nbG).toBe(4); // NB_PAIRES_APPARIEMENT
	const nbD = await droite.count();
	expect(nbD).toBeGreaterThanOrEqual(nbG); // + jusqu'à 2 décoys (faux-amis)
	expect(nbD).toBeLessThanOrEqual(nbG + 2);

	// Vérifier désactivé tant que tous les mots de gauche ne sont pas reliés.
	await expect(page.locator('#lappVerif')).toBeDisabled();

	// Tap en deux temps : arme le i-ème mot de gauche, puis relie au i-ème mot
	// de droite (ordre DOM — cf. en-tête, pas de garantie de justesse ici).
	for (let i = 0; i < nbG; i++) {
		await gauche.nth(i).click();
		await expect(gauche.nth(i)).toHaveAttribute('aria-pressed', 'true');
		await droite.nth(i).click();
	}
	await expect(page.locator('#lappStatus')).not.toBeEmpty();
	expect(await page.locator('.lapp-link').count()).toBe(nbG);

	await expect(page.locator('#lappVerif')).toBeEnabled();
	await page.locator('#lappVerif').click();

	// Chaque lien est figé et marqué ✓/✗ ; les mots de gauche (tous reliés)
	// portent chacun soit .correct, soit .wrong (jamais neutres).
	expect(await page.locator('.lapp-mark').count()).toBe(nbG);
	expect(
		await page.locator('.lapp-mot[data-side="g"].correct, .lapp-mot[data-side="g"].wrong').count(),
	).toBe(nbG);
	// Feedback : Bravo si tout juste, sinon la solution est révélée en texte.
	await expect(page.locator('.lqcm-ok, .lqcm-ko')).toBeVisible();
	if (await page.locator('.lqcm-ko').isVisible()) {
		await expect(page.locator('.lapp-solution')).toBeVisible();
	}
	// #153 : « Vérifier » s'efface, seul « Continuer ▶ » reste.
	await expect(page.locator('#lappVerif')).toBeHidden();
	await expect(page.locator('#lappActions button')).toBeVisible();

	// Continuer enchaîne sur la manche suivante : le plateau se re-rend.
	await page.locator('#lappActions button').click();
	await expect(page.locator('#lappVerif')).toBeVisible();
	await expect(page.locator('#lappVerif')).toBeDisabled();
	expect(await page.locator('.lapp-mot[data-side="g"]').count()).toBe(4);
	expect(errors).toEqual([]);
});

/* Exigence de l'issue #392 : opérable au clavier de bout en bout, sans souris
   ni doigt. Les mots sont de vrais <button> : Entrée arme/relie nativement. */
test('appariement opérable au clavier : armer puis relier au clavier (#392)', async ({ page }) => {
	const errors = watchErrors(page);
	await gotoHash(page, 'lecon-fr-vocab-familles-relier');
	await page.locator('.lapp-mot').first().waitFor();

	// Focus le 1er mot de gauche, Entrée l'arme (aria-pressed).
	const premierGauche = page.locator('.lapp-mot[data-side="g"]').first();
	await premierGauche.focus();
	await page.keyboard.press('Enter');
	await expect(premierGauche).toHaveAttribute('aria-pressed', 'true');

	// Focus (Tab) le 1er mot de droite, Entrée trace le lien.
	const premierDroite = page.locator('.lapp-mot[data-side="d"]').first();
	await premierDroite.focus();
	await page.keyboard.press('Enter');

	expect(await page.locator('.lapp-link').count()).toBe(1);
	await expect(page.locator('#lappStatus')).not.toBeEmpty();
	expect(errors).toEqual([]);
});
