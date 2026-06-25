/* ============================================================
   Smoke e2e — Grammaire CM1 : formes de phrase (#245).
   La rubrique « Les phrases » s'ouvre au CM1 avec, en plus du « type » :
   - fr-gram-forme            : Affirmative ou négative ? (QCM 2 options)
   - fr-gram-transfo-negative : Mets à la forme négative (QCM 3 options)

   ⚠ Leçons taguées CM1 : on amorce un profil CM1 et on navigue DIRECTEMENT
   (pas gotoHash, qui force CE2 via ENSURE_NIVEAU), comme conjugaison-cm1.spec.ts.
   ============================================================ */
import { test, expect, type Page } from '@playwright/test';
import { watchErrors } from './helpers';

/* Profil en CM1 (sans popup d'onboarding : niveauReference déjà fixé). */
const SEED_CM1 = `localStorage.setItem('ludaskia_profiles', JSON.stringify({ list: [{ uuid: 'e2e', name: 'E2E', emoji: '🦊', updatedAt: 1, niveauReference: 'cm1' }], active: 'e2e' }));`;

async function gotoCM1(page: Page, hash: string): Promise<void> {
	await page.addInitScript(SEED_CM1);
	await page.goto(`app.html#${hash}`, { waitUntil: 'networkidle' });
}

/* Lance une leçon QCM mono-mode : attend le premier choix, clique et vérifie le feedback. */
async function clicQcm(page: Page, nbChoix: number): Promise<void> {
	const choices = page.locator('.sprint-choice');
	await choices.first().waitFor();
	expect(await choices.count()).toBe(nbChoix);
	await choices.first().click();
	await expect(page.locator('#lqcmFeedback')).toBeVisible();
}

test('en CM1, la Grammaire « Les phrases » propose type + forme + transformation', async ({
	page,
}) => {
	const errors = watchErrors(page);
	await gotoCM1(page, 'categorie-fr-grammaire');
	for (const id of ['fr-gram-type-phrase', 'fr-gram-forme', 'fr-gram-transfo-negative']) {
		await expect(page.locator(`.lesson-item[data-id="${id}"]`)).toBeVisible();
	}
	expect(errors).toEqual([]);
});

test('Affirmative ou négative ? : QCM à 2 choix, un clic donne un retour', async ({ page }) => {
	const errors = watchErrors(page);
	await gotoCM1(page, 'lecon-fr-gram-forme');
	await clicQcm(page, 2); // affirmative / négative
	expect(errors).toEqual([]);
});

test('Mets à la forme négative : QCM à 3 choix, un clic donne un retour', async ({ page }) => {
	const errors = watchErrors(page);
	await gotoCM1(page, 'lecon-fr-gram-transfo-negative');
	await clicQcm(page, 3); // la négative correcte + 2 distracteurs
	expect(errors).toEqual([]);
});
