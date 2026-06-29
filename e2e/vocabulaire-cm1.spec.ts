/* ============================================================
   Smoke e2e — Vocabulaire CM1 (#244).
   En profil CM1, la catégorie Vocabulaire propose les 4 leçons CM1 et chacune se
   rend en QCM 3 options : « préfixes et suffixes » (reconnaissance, feedback
   explication) et « les contraires » (mot-cible en gras + picto ↔, feedback).

   ⚠ Ces leçons sont taguées CM1 : on amorce un profil CM1 et on navigue
   DIRECTEMENT (pas gotoHash, qui force CE2 via ENSURE_NIVEAU), comme
   geometrie-cm1.spec.ts / calcul-mental-cm1.spec.ts.
   ============================================================ */
import { test, expect, type Page } from '@playwright/test';
import { watchErrors } from './helpers';

/* Profil en CM1 (sans popup d'onboarding : niveauReference déjà fixé). */
const SEED_CM1 = `localStorage.setItem('ludaskia_profiles', JSON.stringify({ list: [{ uuid: 'e2e', name: 'E2E', emoji: '🦊', updatedAt: 1, niveauReference: 'cm1' }], active: 'e2e' }));`;

async function gotoCM1(page: Page, hash: string): Promise<void> {
	await page.addInitScript(SEED_CM1);
	await page.goto(`app.html#${hash}`, { waitUntil: 'networkidle' });
}

test('en CM1, la catégorie Vocabulaire liste les 4 leçons CM1', async ({ page }) => {
	const errors = watchErrors(page);
	await gotoCM1(page, 'categorie-fr-vocabulaire');
	for (const id of [
		'fr-vocab-contraires-cm1',
		'fr-vocab-sens-proche-cm1',
		'fr-vocab-familles-cm1',
		'fr-vocab-affixes-cm1',
	]) {
		await expect(page.locator(`.lesson-item[data-id="${id}"]`)).toBeVisible();
	}
	expect(errors).toEqual([]);
});

test('Préfixes et suffixes (CM1) : QCM 3 options + feedback', async ({ page }) => {
	const errors = watchErrors(page);
	await gotoCM1(page, 'lecon-fr-vocab-affixes-cm1'); // mono-mode QCM → lancement direct
	const choices = page.locator('.sprint-choice');
	await choices.first().waitFor();
	expect(await choices.count()).toBe(3);
	await expect(page.locator('.lqcm-consigne')).toBeVisible();
	await choices.first().click();
	await expect(page.locator('.lqcm-expl')).toBeVisible();
	expect(errors).toEqual([]);
});

test('Les contraires (CM1) : consigne ↔, mot-cible en gras, QCM 3 options + feedback', async ({
	page,
}) => {
	const errors = watchErrors(page);
	await gotoCM1(page, 'lecon-fr-vocab-contraires-cm1'); // mono-mode QCM → lancement direct
	const choices = page.locator('.sprint-choice');
	await choices.first().waitFor();
	expect(await choices.count()).toBe(3);
	await expect(page.locator('.lqcm-picto')).toHaveText('↔');
	await expect(page.locator('.sprint-q-qcm strong')).toBeVisible();
	await choices.first().click();
	await expect(page.locator('.lqcm-expl')).toBeVisible();
	expect(errors).toEqual([]);
});
