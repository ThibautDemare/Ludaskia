/* ============================================================
   Smoke e2e — Géométrie CM1 (#242).
   En profil CM1, les leçons de géométrie CM1 se rendent sans erreur (triangles
   particuliers avec marques de côté égal, quadrilatères dont parallélogramme,
   solides dont le prisme, QCM polyèdre/non-polyèdre, comptage de mémoire) et
   l'interaction clé (choix QCM / saisie) fonctionne.

   ⚠ Ces leçons sont taguées CM1 : on amorce un profil CM1 et on navigue
   DIRECTEMENT (pas gotoHash, qui force CE2 via ENSURE_NIVEAU), comme
   calcul-mental-cm1.spec.ts / niveau.spec.ts.
   ============================================================ */
import { test, expect, type Page } from '@playwright/test';
import { watchErrors } from './helpers';

/* Profil en CM1 (sans popup d'onboarding : niveauReference déjà fixé). */
const SEED_CM1 = `localStorage.setItem('ludaskia_profiles', JSON.stringify({ list: [{ uuid: 'e2e', name: 'E2E', emoji: '🦊', updatedAt: 1, niveauReference: 'cm1' }], active: 'e2e' }));`;

async function gotoCM1(page: Page, hash: string): Promise<void> {
	await page.addInitScript(SEED_CM1);
	await page.goto(`app.html#${hash}`, { waitUntil: 'networkidle' });
}

/* Un QCM à figure (runner direct du mode conseillé) : la figure se rend et un clic
   sur une proposition donne un retour. */
async function clicQcm(page: Page): Promise<void> {
	await expect(page.locator('.sprint-choice').first()).toBeVisible();
	await page.locator('.sprint-choice').first().click();
	await expect(page.locator('#lqcmFeedback')).toBeVisible();
}

test('en CM1, la catégorie Géométrie liste les 6 leçons CM1', async ({ page }) => {
	const errors = watchErrors(page);
	await gotoCM1(page, 'categorie-math-geometrie');
	for (const id of [
		'geo-cm1-triangles',
		'geo-cm1-triangles-prop',
		'geo-cm1-quadrilateres',
		'geo-cm1-solides',
		'geo-cm1-polyedre',
		'geo-cm1-solides-comptage',
	]) {
		await expect(page.locator(`.lesson-item[data-id="${id}"]`)).toBeVisible();
	}
	expect(errors).toEqual([]);
});

test('Reconnaître un triangle (QCM) : figure SVG (avec marques) + 4 noms, un clic donne un retour', async ({
	page,
}) => {
	const errors = watchErrors(page);
	await gotoCM1(page, 'lecon-geo-cm1-triangles');
	await expect(page.locator('.figure svg').first()).toBeVisible();
	await expect(page.locator('.sprint-choice')).toHaveCount(4);
	await clicQcm(page);
	expect(errors).toEqual([]);
});

test('Reconnaître un triangle (saisie) : la fiche montre la figure et corrige le nom', async ({
	page,
}) => {
	const errors = watchErrors(page);
	await gotoCM1(page, 'mode-geo-cm1-triangles');
	await page.locator('.mode-btn[data-mode="saisie"]').click();
	await expect(page.locator('.figure svg').first()).toBeVisible();
	const field = page.locator('.ans').first();
	await field.waitFor();
	const good = await field.getAttribute('data-answer');
	await field.fill(good ?? '');
	await page.locator('#btnVerify').click();
	await expect(page.locator('.mark.correct').first()).toBeVisible();
	expect(errors).toEqual([]);
});

test('Reconnaître un quadrilatère (QCM) : parallélogramme jouable, un clic donne un retour', async ({
	page,
}) => {
	const errors = watchErrors(page);
	await gotoCM1(page, 'lecon-geo-cm1-quadrilateres');
	await expect(page.locator('.sprint-choice').first()).toBeVisible();
	await clicQcm(page);
	expect(errors).toEqual([]);
});

test('Reconnaître un solide (QCM) : schéma SVG (dont prisme) + 4 noms, un clic donne un retour', async ({
	page,
}) => {
	const errors = watchErrors(page);
	await gotoCM1(page, 'lecon-geo-cm1-solides');
	await expect(page.locator('.figure svg').first()).toBeVisible();
	await expect(page.locator('.sprint-choice')).toHaveCount(4);
	await clicQcm(page);
	expect(errors).toEqual([]);
});

test('Polyèdre ou non ? : QCM textuel, un clic donne un retour', async ({ page }) => {
	const errors = watchErrors(page);
	await gotoCM1(page, 'lecon-geo-cm1-polyedre');
	await clicQcm(page);
	expect(errors).toEqual([]);
});

test('Compter faces/arêtes/sommets : QCM de mémoire (sans figure), un clic donne un retour', async ({
	page,
}) => {
	const errors = watchErrors(page);
	await gotoCM1(page, 'lecon-geo-cm1-solides-comptage');
	// « De mémoire » : pas de figure SVG dans l'énoncé.
	await expect(page.locator('.figure svg')).toHaveCount(0);
	await clicQcm(page);
	expect(errors).toEqual([]);
});
