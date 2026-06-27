/* ============================================================
   Smoke e2e — Accords CM1 (#243).
   Deux leçons d'orthographe « Les accords » ouvertes au CM1 :
   - fr-accords-cm1            : Pluriel et féminin — au CM1 (saisie/QCM)
   - fr-accords-groupe-nominal : Accorder tout le groupe (QCM 3 options, mono-mode)

   ⚠ Leçons taguées CM1 : on amorce un profil CM1 et on navigue DIRECTEMENT
   (pas gotoHash, qui force CE2 via ENSURE_NIVEAU), comme grammaire-cm1.spec.ts.
   Dans la catégorie Orthographe, les cartes-leçon « moteur » portent `data-lecon`
   (rendu catalog-nav.ts), pas `.lesson-item[data-id]`.
   ============================================================ */
import { test, expect, type Page } from '@playwright/test';
import { watchErrors } from './helpers';

/* Profil en CM1 (sans popup d'onboarding : niveauReference déjà fixé). */
const SEED_CM1 = `localStorage.setItem('ludaskia_profiles', JSON.stringify({ list: [{ uuid: 'e2e', name: 'E2E', emoji: '🦊', updatedAt: 1, niveauReference: 'cm1' }], active: 'e2e' }));`;

async function gotoCM1(page: Page, hash: string): Promise<void> {
	await page.addInitScript(SEED_CM1);
	await page.goto(`app.html#${hash}`, { waitUntil: 'networkidle' });
}

test('en CM1, Orthographe « Les accords » propose les deux leçons CM1', async ({ page }) => {
	const errors = watchErrors(page);
	await gotoCM1(page, 'categorie-fr-orthographe');
	await expect(page.locator('[data-lecon="fr-accords-cm1"]')).toBeVisible();
	await expect(page.locator('[data-lecon="fr-accords-groupe-nominal"]')).toBeVisible();
	expect(errors).toEqual([]);
});

test('Accorder tout le groupe : QCM à 3 choix empilés avec surlignage, retour au clic', async ({
	page,
}) => {
	const errors = watchErrors(page);
	// Leçon mono-mode (QCM) → s'ouvre directement, sans écran de choix de mode.
	await gotoCM1(page, 'lecon-fr-accords-groupe-nominal');
	const choices = page.locator('.sprint-choice');
	await choices.first().waitFor();
	expect(await choices.count()).toBe(3); // le bon groupe + 2 distracteurs
	// Le surlignage de la marque d'accord (.term) est présent dans les choix.
	await expect(choices.first().locator('.term').first()).toBeVisible();
	await choices.first().click();
	await expect(page.locator('#lqcmFeedback')).toBeVisible();
	expect(errors).toEqual([]);
});

test('Pluriel et féminin — au CM1 : choix de mode puis saisie corrigée', async ({ page }) => {
	const errors = watchErrors(page);
	await gotoCM1(page, 'categorie-fr-orthographe');
	await page.locator('[data-lecon="fr-accords-cm1"]').click();
	// Écran de choix de mode (#69) : saisie (conseillé) + QCM.
	await expect(page.locator('.mode-btn[data-mode="saisie"]')).toBeVisible();
	await expect(page.locator('.mode-btn[data-mode="qcm"]')).toBeVisible();
	await page.locator('.mode-btn[data-mode="saisie"]').click();
	// Fiche de saisie : on remplit chaque champ avec sa bonne réponse.
	const fields = page.locator('.ans');
	await fields.first().waitFor();
	const n = await fields.count();
	for (let i = 0; i < n; i++) {
		const f = fields.nth(i);
		await f.fill((await f.getAttribute('data-answer')) ?? '');
	}
	await page.locator('#btnVerify').click();
	await expect(page.locator('.mark.correct').first()).toBeVisible();
	await expect(page.locator('.mark.wrong')).toHaveCount(0);
	expect(errors).toEqual([]);
});
