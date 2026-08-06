/* ============================================================
   Smoke e2e — refus d'une saisie non numérique là où un nombre est
   attendu (fix/saisie-non-numerique-refusee).

   Une réponse illisible comme un nombre (« 3- », un caractère parasite
   atteignable sur le pavé numérique d'Android) n'est plus comptée fausse :
   elle est REFUSÉE (rien de compté, rien de journalisé), avec un message,
   et la saisie reste en place pour que l'enfant corrige.

   Couvre :
   1. Sprint — saisie non numérique refusée (pas de correction ouverte).
   2. Sprint — le message se lève à la retouche, une saisie numérique valide
      repart normalement dans le circuit de correction.
   3. Sprint — valider un champ vide affiche aussi un message.
   4. Fiche (plusieurs champs) — une saisie non numérique dans UN champ
      bloque TOUTE la vérification, jusqu'à la retouche ; un champ vide ne
      bloque pas.
   5. Écho de frappe du champ du sprint (classe `frappe`).
   ============================================================ */
import { test, expect } from '@playwright/test';
import { watchErrors, gotoHash } from './helpers';

/* Filtre le sprint sur « Calcul mental » (100 % saisie, pas de QCM) via l'écran
   de config — même pattern que smoke.spec.ts (« Sprint : la touche Entrée
   enchaîne après la correction ») : chaque question a un champ #sprintInput. */
async function lancerSprintCalculMental(page: import('@playwright/test').Page) {
	await gotoHash(page, 'sprint-config');
	await page.locator('.sc-option', { hasText: 'Calcul mental' }).click();
	await page.locator('#scLaunch').click();
	await expect(page.locator('#sprintInput')).toBeVisible();
}

test('Sprint : une saisie non numérique est refusée, sans ouvrir la correction', async ({
	page,
}) => {
	const errors = watchErrors(page);
	await lancerSprintCalculMental(page);

	const scoreAvant = await page.locator('#sprintScore').textContent();

	await page.locator('#sprintInput').fill('3-');
	await page.locator('#sprintInput').press('Enter');

	// Pas d'écran de correction ouvert : ni bouton « Continuer », ni rappel de la
	// réponse envoyée.
	await expect(page.locator('#sprintContinue')).toBeHidden();
	await expect(page.locator('.sprint-donnee')).toHaveCount(0);

	// Message de refus affiché, question inchangée, saisie CONSERVÉE telle quelle.
	await expect(page.locator('#sprintHint')).toBeVisible();
	await expect(page.locator('#sprintHint')).toHaveText(
		"Ce n'est pas un nombre. Corrige ta réponse, puis valide.",
	);
	await expect(page.locator('#sprintInput')).toHaveValue('3-');

	// Rien n'a été compté.
	await expect(page.locator('#sprintScore')).toHaveText(scoreAvant ?? '');

	expect(errors).toEqual([]);
});

test('Sprint : le message se lève à la retouche, une saisie numérique repart en correction', async ({
	page,
}) => {
	const errors = watchErrors(page);
	await lancerSprintCalculMental(page);

	await page.locator('#sprintInput').fill('3-');
	await page.locator('#sprintInput').press('Enter');
	await expect(page.locator('#sprintHint')).toBeVisible();

	// Retouche : le message disparaît (sans re-valider).
	await page.locator('#sprintInput').fill('999999'); // réponse volontairement fausse mais NUMÉRIQUE
	await expect(page.locator('#sprintHint')).toBeHidden();

	// Une saisie numérique repart normalement dans le circuit de correction
	// (chrono en pause, écran de correction avec « Continuer »).
	await page.locator('#sprintInput').press('Enter');
	await expect(page.locator('#sprintContinue')).toBeVisible();

	expect(errors).toEqual([]);
});

test('Sprint : valider un champ vide affiche aussi un message', async ({ page }) => {
	const errors = watchErrors(page);
	await lancerSprintCalculMental(page);

	await page.locator('#sprintInput').press('Enter'); // rien saisi

	await expect(page.locator('#sprintContinue')).toBeHidden();
	await expect(page.locator('#sprintHint')).toBeVisible();
	await expect(page.locator('#sprintHint')).toHaveText('Écris ta réponse avant de valider.');

	expect(errors).toEqual([]);
});

test('Sprint : le champ de saisie accuse réception de la frappe (classe frappe)', async ({
	page,
}) => {
	const errors = watchErrors(page);
	await lancerSprintCalculMental(page);

	await page.locator('#sprintInput').pressSequentially('3');
	await expect(page.locator('#sprintInput')).toHaveClass(/\bfrappe\b/);

	expect(errors).toEqual([]);
});

test('Fiche : une saisie non numérique dans un champ bloque toute la vérification', async ({
	page,
}) => {
	const errors = watchErrors(page);
	await gotoHash(page, 'lecon-math-tables-addition');

	const fields = page.locator('.ans');
	await fields.first().waitFor();
	const bonneReponse0 = await fields.first().getAttribute('data-answer');
	const bonneReponse1 = await fields.nth(1).getAttribute('data-answer');

	await fields.first().fill(bonneReponse0 ?? '');
	await fields.nth(1).fill('3-'); // saisie non numérique dans le 2ᵉ champ
	await page.locator('#btnVerify').click();

	// Vérification entière bloquée : AUCUNE marque, ni ✓ ni ✗.
	await expect(page.locator('.mark.correct')).toHaveCount(0);
	await expect(page.locator('.mark.wrong')).toHaveCount(0);

	// Message affiché (singulier : un seul champ fautif), champ fautif signalé.
	await expect(page.locator('.verify-hint')).toBeVisible();
	await expect(page.locator('.verify-hint')).toHaveText(
		"Il y a une réponse qui n'est pas un nombre. Corrige-la, puis vérifie.",
	);
	await expect(fields.nth(1)).toHaveClass(/\ba-corriger\b/);
	await expect(fields.first()).not.toHaveClass(/\ba-corriger\b/);

	// Retouche du champ fautif : le signalement et le message disparaissent.
	await fields.nth(1).fill(bonneReponse1 ?? '');
	await expect(fields.nth(1)).not.toHaveClass(/\ba-corriger\b/);
	await expect(page.locator('.verify-hint')).toHaveCount(0);

	// La vérification fonctionne à nouveau normalement.
	await page.locator('#btnVerify').click();
	await expect(page.locator('.mark.correct').first()).toBeVisible();
	expect(await page.locator('.mark.correct').count()).toBeGreaterThanOrEqual(2);

	expect(errors).toEqual([]);
});

test('Fiche : un champ laissé vide ne bloque pas la vérification', async ({ page }) => {
	const errors = watchErrors(page);
	await gotoHash(page, 'lecon-math-tables-addition');

	const fields = page.locator('.ans');
	await fields.first().waitFor();
	const bonneReponse0 = await fields.first().getAttribute('data-answer');

	await fields.first().fill(bonneReponse0 ?? '');
	// Le 2ᵉ champ reste vide : ne pas répondre reste permis, aucun blocage attendu.
	await page.locator('#btnVerify').click();

	await expect(page.locator('.verify-hint')).toHaveCount(0);
	await expect(page.locator('.mark.correct').first()).toBeVisible();

	expect(errors).toEqual([]);
});
