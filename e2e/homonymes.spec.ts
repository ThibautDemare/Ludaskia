/* ============================================================
   Smoke e2e — Vocabulaire CM1 : les homonymes (homographes) (#254).
   QCM mono-mode (jumeau de sens-figure.spec.ts) : une phrase + « Ici, « mot »
   veut dire : » → l'enfant choisit le bon sens parmi les 2 ou 3 sens RÉELS du
   mot. Leçon CM1-only, exclue du sprint (`excludeFromSprint: true`) → on la
   joue en mode leçon (navigation directe), jamais via le sprint chronométré.

   ⚠ Comme vocabulaire-cm1.spec.ts : on amorce un profil CM1 et on navigue
   DIRECTEMENT (pas gotoHash, qui force CE2 via ENSURE_NIVEAU).
   ============================================================ */
import { test, expect, type Page } from '@playwright/test';
import { watchErrors } from './helpers';

/* Profil en CM1 (sans popup d'onboarding : niveauReference déjà fixé). */
const SEED_CM1 = `localStorage.setItem('ludaskia_profiles', JSON.stringify({ list: [{ uuid: 'e2e', name: 'E2E', emoji: '🦊', updatedAt: 1, niveauReference: 'cm1' }], active: 'e2e' }));`;

async function gotoCM1(page: Page, hash: string): Promise<void> {
	await page.addInitScript(SEED_CM1);
	await page.goto(`app.html#${hash}`, { waitUntil: 'networkidle' });
}

test('en CM1, la catégorie Vocabulaire propose la leçon des homonymes', async ({ page }) => {
	const errors = watchErrors(page);
	await gotoCM1(page, 'categorie-fr-vocabulaire');
	await expect(page.locator('.lesson-item[data-id="fr-vocab-homonymes-cm1"]')).toBeVisible();
	expect(errors).toEqual([]);
});

test('Les homonymes (CM1) : QCM 2-3 options (les sens réels du mot) + feedback', async ({
	page,
}) => {
	const errors = watchErrors(page);
	await gotoCM1(page, 'lecon-fr-vocab-homonymes-cm1'); // mono-mode QCM → lancement direct

	const choices = page.locator('.sprint-choice');
	await choices.first().waitFor();
	const count = await choices.count();
	expect(count).toBeGreaterThanOrEqual(2);
	expect(count).toBeLessThanOrEqual(3);

	// Consigne d'action visible (#265), fixe pour cette leçon.
	await expect(page.locator('.lqcm-consigne')).toHaveText(
		'Quel est le sens du mot dans cette phrase ?',
	);

	// `.sprint-choice` ne porte pas de `data-answer` (seulement `data-i`, l'index) : la
	// bonne réponse n'est marquée (`.correct`) qu'APRÈS le clic, côté correction. On
	// suit donc le pattern des jumeaux (sens-figure.spec.ts, vocabulaire-cm1.spec.ts) :
	// cliquer une option et vérifier que le feedback se rend (pas la couleur précise).
	await choices.first().click();
	await expect(page.locator('.lqcm-expl')).toBeVisible();
	await expect(page.locator('.lqcm-expl')).toContainText('sens');
	// La bonne réponse est marquée en vert quel que soit le choix cliqué.
	await expect(page.locator('.sprint-choice.correct')).toBeVisible();

	expect(errors).toEqual([]);
});
