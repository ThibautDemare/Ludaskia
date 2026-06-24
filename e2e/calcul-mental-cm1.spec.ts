/* ============================================================
   Smoke e2e — Calcul mental CM1 (#241).
   Deux leçons CM1 (fiche en saisie) : « Multiples de 50 » et « Diviser par 10,
   par 100 ». On vérifie qu'en classe CM1 la catégorie « Calcul mental » les
   liste, que chaque fiche se rend sans erreur et qu'une bonne réponse (exposée
   via data-answer, comme tous les champs .ans) est validée.

   ⚠ Ces leçons sont taguées CM1 : on amorce un profil en CM1 et on navigue
   DIRECTEMENT (pas gotoHash, qui force CE2 via ENSURE_NIVEAU), comme niveau.spec.ts.
   ============================================================ */
import { test, expect, type Page } from '@playwright/test';
import { watchErrors } from './helpers';

/* Profil en CM1 (sans popup d'onboarding : niveauReference déjà fixé). */
const SEED_CM1 = `localStorage.setItem('ludaskia_profiles', JSON.stringify({ list: [{ uuid: 'e2e', name: 'E2E', emoji: '🦊', updatedAt: 1, niveauReference: 'cm1' }], active: 'e2e' }));`;

async function gotoCM1(page: Page, hash: string): Promise<void> {
	await page.addInitScript(SEED_CM1);
	await page.goto(`app.html#${hash}`, { waitUntil: 'networkidle' });
}

/* Remplit le premier champ de réponse avec sa bonne valeur et vérifie la marque. */
async function repondPremier(page: Page): Promise<void> {
	const champ = page.locator('.ans').first();
	await champ.waitFor();
	const bonne = await champ.getAttribute('data-answer');
	await champ.fill(bonne ?? '');
	await page.locator('#btnVerify').click();
	await expect(page.locator('.mark.correct').first()).toBeVisible();
}

test('en CM1, la catégorie Calcul mental liste les 2 leçons CM1', async ({ page }) => {
	const errors = watchErrors(page);
	await gotoCM1(page, 'categorie-math-calcul-mental');
	await expect(page.locator('.lesson-item[data-id="math-multiples-50"]')).toBeVisible();
	await expect(page.locator('.lesson-item[data-id="math-diviser-10-100"]')).toBeVisible();
	expect(errors).toEqual([]);
});

test('Multiples de 50 : la fiche se rend et une bonne réponse est validée', async ({ page }) => {
	const errors = watchErrors(page);
	await gotoCM1(page, 'lecon-math-multiples-50');
	await repondPremier(page);
	expect(errors).toEqual([]);
});

test('Diviser par 10, par 100 : la fiche se rend et une bonne réponse est validée', async ({
	page,
}) => {
	const errors = watchErrors(page);
	await gotoCM1(page, 'lecon-math-diviser-10-100');
	// Tous les champs exposent un quotient ENTIER (data-answer sans virgule).
	const champs = page.locator('.ans');
	const n = await champs.count();
	for (let i = 0; i < n; i++) {
		const v = await champs.nth(i).getAttribute('data-answer');
		expect(v ?? '').toMatch(/^\d+$/);
	}
	await repondPremier(page);
	expect(errors).toEqual([]);
});
