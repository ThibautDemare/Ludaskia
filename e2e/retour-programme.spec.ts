/* ============================================================
   Smoke e2e — retour au programme en fin d'activité (#461).
   Une leçon lancée DEPUIS le programme du jour (écran #seance) doit, à sa fin,
   proposer un retour vers #seance (« Retour au programme ») plutôt que vers la
   catégorie de la leçon. Couvre les deux familles d'écran de fin :
   - fiche/saisie (bandeau de session.ts, bouton #btnBackCategorie) ;
   - runner « une question à la fois » (QCM/tuiles/…, lecon-runner-shared.ts,
     bouton #leconBack).
   La non-régression « hors programme → retour catégorie inchangé » est déjà
   couverte par retours-navigation.spec.ts (test « fin de leçon (saisie) »).

   Mise en place du programme : on pilote la vraie UI encadrant (comme
   programme-du-jour.spec.ts), avec une étape « Une leçon précise » ciblant une
   leçon connue plutôt qu'un sprint. Étape à ×2 (au lieu de ×1) : sinon
   `resoudrePending` (appelé au retour vers #seance) créditerait la seule étape
   du programme et #seance basculerait en écran « programme fini » (célébration),
   masquant les tuiles — on veut rester dans le cas nominal, #seance visible
   avec l'étape encore lançable.
   ============================================================ */
import { test, expect, type Page } from '@playwright/test';
import { watchErrors, gotoHash } from './helpers';

const CLEAR_PIN = `localStorage.removeItem('ludaskia_encadrant_lock');`;

/* Crée, via l'UI réelle du compositeur, un programme (d1) avec UNE étape
   « Une leçon précise » (e1) ciblant `lessonId`, comptée `count` fois, et une
   récurrence hebdomadaire sur les 7 jours (s'applique quel que soit le jour
   d'exécution du test). Laisse la page sur #encadrant/programme. */
async function creerProgrammeLeconTousLesJours(
	page: Page,
	lessonId: string,
	count: number,
): Promise<void> {
	await page.addInitScript(CLEAR_PIN);
	await gotoHash(page, 'encadrant/programme');
	await page.locator('[data-act="seance-add"]').click();
	await page.locator('select[data-act="seance-etape-add"][data-def="d1"]').selectOption('lecon');
	await page
		.locator('select[data-act="seance-ref"][data-def="d1"][data-etape="e1"]')
		.selectOption(lessonId);
	if (count !== 1) {
		await page
			.locator('select[data-act="seance-count"][data-def="d1"][data-etape="e1"]')
			.selectOption(String(count));
	}
	for (let jour = 1; jour <= 7; jour++) {
		await page
			.locator(`input[data-act="seance-rec-jour"][data-def="d1"][data-jour="${jour}"]`)
			.check();
	}
}

/* Depuis l'espace encadrant (programme composé), retourne à l'accueil enfant
   puis lance la 1re (seule) tuile du programme. */
async function retourEtLancerTuile(page: Page): Promise<void> {
	await page.locator('.enc-back[data-act="retour"]').click();
	await expect(page.locator('#home')).toBeVisible();
	await page.locator('#cardProgramme').click();
	await expect(page).toHaveURL(/#seance$/);
	await page.locator('.programme-tuile[data-act="lancer"]').first().click();
}

test('leçon (saisie) lancée depuis le programme : « Retour au programme » ramène à #seance', async ({
	page,
}) => {
	const errors = watchErrors(page);
	await creerProgrammeLeconTousLesJours(page, 'math-tables-addition', 2);
	await retourEtLancerTuile(page);
	await expect(page).toHaveURL(/#lecon-math-tables-addition$/);

	// Remplit toutes les réponses correctement pour terminer la leçon.
	const fields = page.locator('.ans');
	await fields.first().waitFor();
	const count = await fields.count();
	for (let i = 0; i < count; i++) {
		const ans = (await fields.nth(i).getAttribute('data-answer')) ?? '';
		await fields.nth(i).fill(ans);
	}
	await page.locator('#btnVerify').click();
	// Un sans-faute peut déclencher la modale de niveau (puis célébration) : la
	// fermer avant d'atteindre le bandeau, sinon elle intercepte les clics.
	for (const ok of ['#levelupOk', '#celebrateOk']) {
		const btn = page.locator(ok);
		if (await btn.isVisible().catch(() => false)) await btn.click();
	}

	const back = page.locator('#btnBackCategorie');
	await expect(back).toBeVisible();
	await expect(back).toHaveText(/Retour au programme/);
	await back.click();

	await expect(page).toHaveURL(/#seance$/);
	await expect(page.locator('.programme-tuile').first()).toBeVisible();
	expect(errors).toEqual([]);
});

test('leçon (runner QCM) lancée depuis le programme : « Retour au programme » ramène à #seance', async ({
	page,
}) => {
	const errors = watchErrors(page);
	await creerProgrammeLeconTousLesJours(page, 'geo-angles', 2);
	await retourEtLancerTuile(page);
	await expect(page).toHaveURL(/#lecon-geo-angles$/);

	// Enchaîne les 8 questions du runner QCM jusqu'à l'écran de résultat (le
	// nombre de choix varie selon la question tirée, ≥ 2 — on ne dépend que du
	// 1er choix, quelle que soit la famille aléatoire).
	const choices = page.locator('.sprint-choice');
	for (let i = 0; i < 8; i++) {
		await expect(choices.first()).toBeVisible();
		await choices.first().click();
		await page.locator('#lqcmActions button').click();
	}
	for (const ok of ['#levelupOk', '#celebrateOk']) {
		const btn = page.locator(ok);
		if (await btn.isVisible().catch(() => false)) await btn.click();
	}

	const back = page.locator('#leconBack');
	await expect(back).toBeVisible();
	await expect(back).toHaveText(/Retour au programme/);
	await back.click();

	await expect(page).toHaveURL(/#seance$/);
	await expect(page.locator('.programme-tuile').first()).toBeVisible();
	expect(errors).toEqual([]);
});
