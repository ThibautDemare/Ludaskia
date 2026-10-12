/* ============================================================
   Smoke e2e — Proportionnalité CM1 (#258).
   Leçon A « Est-ce proportionnel ? » (QCM Oui/Non) et leçon B « Problèmes de
   proportionnalité » (runner de problèmes). Critères visés : 8 (journal d'erreurs),
   12 (aucun tableau, ni à lire ni à remplir) et le cloisonnement CM1 seul.
   Les libellés « Est-ce proportionnel ? », « Oui », « Non » et « Problèmes de
   proportionnalité » sont l'objet du test (intitulés actés par l'issue) : chaînes voulues.
   ============================================================ */
import { test, expect } from '@playwright/test';
import { watchErrors, gotoHash } from './helpers';

const PROFIL = (niveau: 'ce2' | 'cm1') =>
	`localStorage.setItem('ludaskia_profiles', JSON.stringify({ list: [{ uuid: 'e2e', name: 'E2E', emoji: '🦊', updatedAt: 1, niveauReference: '${niveau}' }], active: 'e2e' }));`;
const CLEAR_PIN = `localStorage.removeItem('ludaskia_encadrant_lock');`;

const LIBELLE_A = 'Est-ce proportionnel ?';
const LIBELLE_B = 'Problèmes de proportionnalité';

test('CM1 leçon A : QCM Oui/Non, un clic donne un retour de réussite, sans tableau', async ({
	page,
}) => {
	const errors = watchErrors(page);
	await page.addInitScript(PROFIL('cm1'));
	await gotoHash(page, 'lecon-math-prob-proportion-identifier');
	await expect(page.locator('body')).toContainText(LIBELLE_A);
	const choices = page.locator('.sprint-choice');
	await choices.first().waitFor();
	await expect(choices).toHaveCount(2);
	await expect(choices.filter({ hasText: /^\s*Oui\s*$/ })).toHaveCount(1);
	await expect(choices.filter({ hasText: /^\s*Non\s*$/ })).toHaveCount(1);
	await expect(page.locator('table')).toHaveCount(0); // critère 12
	// Comme en divisibilité : après un clic, le retour s'affiche et la bonne réponse est marquée.
	await choices.first().click();
	await expect(page.locator('#lqcmFeedback')).toBeVisible();
	await expect(page.locator('.sprint-choice.correct')).toHaveCount(1);
	expect(errors).toEqual([]);
});

test('CM1 leçon B : un champ par question, bonne réponse validée, sans tableau', async ({
	page,
}) => {
	const errors = watchErrors(page);
	await page.addInitScript(PROFIL('cm1'));
	await gotoHash(page, 'lecon-math-prob-proportion-resoudre');
	await expect(page.locator('.prob-enonce')).toBeVisible();
	const inputs = page.locator('.prob-input');
	await inputs.first().waitFor();
	await expect(inputs).toHaveCount(1); // une question numérique par problème
	await expect(page.locator('table')).toHaveCount(0); // critère 12
	const answer = await inputs.first().getAttribute('data-answer');
	expect(answer).toBeTruthy();
	await inputs.first().fill(answer!);
	await page.locator('#probVerif').click();
	await expect(page.locator('.prob-mark.correct')).toHaveCount(1);
	expect(errors).toEqual([]);
});

test('CM1 leçon B : une mauvaise réponse est journalisée côté encadrant (critère 8)', async ({
	page,
}) => {
	const errors = watchErrors(page);
	await page.addInitScript(PROFIL('cm1'));
	await page.addInitScript(CLEAR_PIN);
	await gotoHash(page, 'lecon-math-prob-proportion-resoudre');
	const input = page.locator('.prob-input').first();
	await input.waitFor();
	const answer = (await input.getAttribute('data-answer'))!;
	const faux = String(Number(answer) + 1); // ≠ data-answer, quel que soit le tirage
	await input.fill(faux);
	await page.locator('#probVerif').click();
	await expect(page.locator('.prob-mark.correct')).toHaveCount(0);
	await expect(page.locator('.prob-mark').first()).toBeVisible();

	await gotoHash(page, 'encadrant');
	const tout = page.locator('.enc-act-mode[data-act="erreurs-periode"][data-periode="tout"]');
	if (await tout.count()) await tout.click();
	const groupe = page.locator('.enc-err-lecon').filter({ hasText: LIBELLE_B });
	await expect(groupe).toHaveCount(1);
	await expect(groupe).toContainText(answer); // la réponse attendue est lisible
	expect(errors).toEqual([]);
});

test('CE2 : aucune des deux leçons dans Résolution de problèmes (CM1 seul)', async ({ page }) => {
	const errors = watchErrors(page);
	await page.addInitScript(PROFIL('ce2'));
	await gotoHash(page, 'categorie-math-problemes');
	// La page est bien rendue (sinon l'absence ne prouverait rien).
	await expect(page.locator('.lesson-item[data-id="math-prob-composition"]')).toBeVisible();
	await expect(page.locator('.lesson-item[data-id="math-prob-proportion-identifier"]')).toHaveCount(
		0,
	);
	await expect(page.locator('.lesson-item[data-id="math-prob-proportion-resoudre"]')).toHaveCount(
		0,
	);
	await expect(page.locator('body')).not.toContainText(LIBELLE_A);
	await expect(page.locator('body')).not.toContainText(LIBELLE_B);
	expect(errors).toEqual([]);
});
