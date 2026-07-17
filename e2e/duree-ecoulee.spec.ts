/* ============================================================
   Smoke e2e — « Je calcule une durée » (#252).
   Leçon CM1-only (levels: ['cm1']), catégorie math-grandeurs-mesures, sur le
   MÊME runner « problème » à deux champs (charpente partagée
   `_probleme-deux-sous-questions.ts`, comme la division euclidienne #251),
   hors sprint. Deux modes : saisie et qcm. Nouveau : l'explication de
   stratégie (`.lqcm-expl`) s'affiche après validation.
   Profil CM1 seedé (comme division-euclidienne.spec.ts) : cette leçon est
   absente du catalogue CE2 par défaut.
   ============================================================ */
import { test, expect } from '@playwright/test';
import { watchErrors } from './helpers';

/* Profil CM1 : le catalogue est filtré sur CM1 → la leçon y apparaît (absente
   en profil CE2 par défaut). */
const SEED_CM1 = `localStorage.setItem('ludaskia_profiles', JSON.stringify({ list: [{ uuid: 'e2e', name: 'E2E', emoji: '\\uD83E\\uDD8A', updatedAt: 1, niveauReference: 'cm1' }], active: 'e2e' }));`;

test.beforeEach(async ({ page }) => {
	await page.addInitScript(SEED_CM1);
});

/* ---------- 1. Visibilité : la leçon apparaît en profil CM1 ---------- */
test('CM1 : « Je calcule une durée » est listée dans Grandeurs et mesures #252', async ({
	page,
}) => {
	const errors = watchErrors(page);
	await page.goto('app.html#categorie-math-grandeurs-mesures', { waitUntil: 'networkidle' });
	await expect(page.locator('.lesson-item[data-id="mes-duree-ecoulee"]')).toBeVisible();
	expect(errors).toEqual([]);
});

/* ---------- 2. Mode saisie : rendu sans erreur, deux champs, tout correct + explication ---------- */
test('Durée écoulée (saisie) : deux champs visibles, bonne réponse validée, explication affichée', async ({
	page,
}) => {
	const errors = watchErrors(page);
	await page.goto('app.html#mode-mes-duree-ecoulee', { waitUntil: 'networkidle' });
	await expect(page.locator('.mode-btn[data-mode="saisie"]')).toBeVisible();
	await page.locator('.mode-btn[data-mode="saisie"]').click();

	await expect(page.locator('.prob-enonce')).toBeVisible();

	// Exactement deux champs (heures + minutes).
	const inputs = page.locator('.prob-input');
	await inputs.first().waitFor();
	expect(await inputs.count()).toBe(2);

	// Remplir les deux champs avec la bonne réponse (exposée via data-answer).
	const n = await inputs.count();
	for (let i = 0; i < n; i++) {
		const inp = inputs.nth(i);
		const answer = await inp.getAttribute('data-answer');
		await inp.fill(answer!);
	}

	// Valider : les deux marques doivent passer en .correct.
	await page.locator('#probVerif').click();
	expect(await page.locator('.prob-mark.correct').count()).toBe(2);

	// Nouveau comportement #252 : l'explication de stratégie (le « pont ») s'affiche.
	await expect(page.locator('.lqcm-expl')).toBeVisible();

	expect(errors).toEqual([]);
});

/* ---------- 3. Correction indépendante par champ ---------- */
test('Durée écoulée (saisie) : feedback indépendant par champ', async ({ page }) => {
	const errors = watchErrors(page);
	await page.goto('app.html#mode-mes-duree-ecoulee', { waitUntil: 'networkidle' });
	await page.locator('.mode-btn[data-mode="saisie"]').click();

	const inputs = page.locator('.prob-input');
	await inputs.first().waitFor();

	// Champ 0 = première sous-question → bonne réponse.
	const champ0 = inputs.nth(0);
	const bonneReponse0 = await champ0.getAttribute('data-answer');
	await champ0.fill(bonneReponse0!);

	// Champ 1 = seconde sous-question → valeur délibérément fausse (bonne réponse + 5).
	const champ1 = inputs.nth(1);
	const bonneReponse1 = await champ1.getAttribute('data-answer');
	const mauvaise = String(Number(bonneReponse1) + 5);
	await champ1.fill(mauvaise);

	await page.locator('#probVerif').click();

	// La marque du champ 0 (data-for="0") est correcte.
	await expect(page.locator('.prob-mark[data-for="0"].correct')).toBeVisible();
	// La marque du champ 1 (data-for="1") est erronée (et NON correcte).
	await expect(page.locator('.prob-mark[data-for="1"].wrong')).toBeVisible();
	await expect(page.locator('.prob-mark[data-for="1"].correct')).toHaveCount(0);

	expect(errors).toEqual([]);
});

/* ---------- 4. Mode QCM : rendu sans erreur, 4 choix cliquables ---------- */
test('Durée écoulée (QCM) : les choix sont affichés et cliquables', async ({ page }) => {
	const errors = watchErrors(page);
	await page.goto('app.html#mode-mes-duree-ecoulee', { waitUntil: 'networkidle' });
	await expect(page.locator('.mode-btn[data-mode="qcm"]')).toBeVisible();
	await page.locator('.mode-btn[data-mode="qcm"]').click();

	const choices = page.locator('.sprint-choice');
	await choices.first().waitFor();
	// Le générateur QCM produit exactement 4 choix (correct + 3 distracteurs).
	expect(await choices.count()).toBe(4);

	await choices.first().click();

	expect(errors).toEqual([]);
});
