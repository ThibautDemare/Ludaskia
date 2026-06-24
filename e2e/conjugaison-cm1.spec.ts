/* ============================================================
   Smoke e2e — Conjugaison CM1 (#239).
   Trois QCM « méta » dans la catégorie Conjugaison, taguées CM1 :
   - fr-conj-simple-compose : Temps simple ou composé ?
   - fr-conj-groupe         : 1er, 2e ou 3e groupe ?
   - fr-conj-infinitif      : Quel est l'infinitif ?

   ⚠ Ces leçons sont taguées CM1 : on amorce un profil CM1 et on navigue
   DIRECTEMENT (pas gotoHash, qui force CE2 via ENSURE_NIVEAU), comme
   calcul-mental-cm1.spec.ts et geometrie-cm1.spec.ts.
   ============================================================ */
import { test, expect, type Page } from '@playwright/test';
import { watchErrors } from './helpers';

/* Profil en CM1 (sans popup d'onboarding : niveauReference déjà fixé). */
const SEED_CM1 = `localStorage.setItem('ludaskia_profiles', JSON.stringify({ list: [{ uuid: 'e2e', name: 'E2E', emoji: '🦊', updatedAt: 1, niveauReference: 'cm1' }], active: 'e2e' }));`;

async function gotoCM1(page: Page, hash: string): Promise<void> {
	await page.addInitScript(SEED_CM1);
	await page.goto(`app.html#${hash}`, { waitUntil: 'networkidle' });
}

/* Lance une leçon QCM mono-mode : attend le premier choix, clique dessus et
   vérifie que le feedback de correction s'affiche (bonne ou mauvaise réponse,
   le retour immédiat est la valeur du QCM). */
async function clicQcm(page: Page): Promise<void> {
	const premier = page.locator('.sprint-choice').first();
	await expect(premier).toBeVisible();
	await premier.click();
	await expect(page.locator('#lqcmFeedback')).toBeVisible();
}

/* ------------------------------------------------------------ */

test('en CM1, la catégorie Conjugaison liste les 3 QCM méta', async ({ page }) => {
	const errors = watchErrors(page);
	await gotoCM1(page, 'categorie-fr-conjugaison');
	for (const id of ['fr-conj-simple-compose', 'fr-conj-groupe', 'fr-conj-infinitif']) {
		await expect(page.locator(`.lesson-item[data-id="${id}"]`)).toBeVisible();
	}
	expect(errors).toEqual([]);
});

test('Temps simple ou composé : QCM à 2 choix, un clic donne un retour', async ({ page }) => {
	const errors = watchErrors(page);
	await gotoCM1(page, 'lecon-fr-conj-simple-compose');
	// Toujours exactement 2 options (libellés fixés, ordre stable : composé / simple).
	await expect(page.locator('.sprint-choice')).toHaveCount(2);
	await clicQcm(page);
	expect(errors).toEqual([]);
});

test('1er, 2e ou 3e groupe : QCM à 3 choix (vrais groupes), un clic donne un retour', async ({
	page,
}) => {
	const errors = watchErrors(page);
	await gotoCM1(page, 'lecon-fr-conj-groupe');
	// Les 3 groupes sont toujours présents (tous les choix sont de vraies étiquettes).
	await expect(page.locator('.sprint-choice')).toHaveCount(3);
	await clicQcm(page);
	expect(errors).toEqual([]);
});

test("Quel est l'infinitif : QCM à 4 formes (vrais infinitifs), un clic donne un retour", async ({
	page,
}) => {
	const errors = watchErrors(page);
	await gotoCM1(page, 'lecon-fr-conj-infinitif');
	// Toujours 4 choix : l'infinitif cible + 3 distracteurs (vrais infinitifs du corpus).
	await expect(page.locator('.sprint-choice')).toHaveCount(4);
	await clicQcm(page);
	expect(errors).toEqual([]);
});
