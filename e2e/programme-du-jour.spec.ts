/* ============================================================
   « Programme du jour » (#440) — smoke tests e2e.
   Deux surfaces : le COMPOSITEUR côté encadrant (encadrant-seance.ts, dans
   l'espace #encadrant) et l'ÉCRAN ENFANT #seance (ui/seance.ts) + sa carte
   d'accueil #cardProgramme. Flux réaliste : on pilote la vraie UI encadrant
   pour créer un programme (une activité « Sprint 5 min », récurrence hebdo
   sur les 7 jours → s'applique forcément aujourd'hui, sans dépendre du jour
   d'exécution du test), puis on vérifie que l'écran enfant le propose et
   qu'on peut lancer l'étape.
   ============================================================ */
import { test, expect, type Page } from '@playwright/test';
import { watchErrors, gotoHash } from './helpers';

/* Supprime tout verrou PIN éventuel persisté d'un test précédent (le verrou est
   OFF par défaut, mais on s'aligne sur le pattern des autres specs encadrant). */
const CLEAR_PIN = `localStorage.removeItem('ludaskia_encadrant_lock');`;

/* Crée, via l'UI réelle du compositeur, UN programme avec une étape « Sprint 5
   min » et une récurrence hebdomadaire sur les 7 jours (id de définition
   déterministe : 'd1', 1er programme d'un profil neuf). Laisse la page sur
   #encadrant, la carte du programme affichée. */
async function creerProgrammeSprintTousLesJours(page: Page): Promise<void> {
	await page.addInitScript(CLEAR_PIN);
	await gotoHash(page, 'encadrant');
	await page.locator('[data-act="seance-add"]').click();
	await page.locator('select[data-act="seance-etape-add"][data-def="d1"]').selectOption('sprint');
	for (let jour = 1; jour <= 7; jour++) {
		await page
			.locator(`input[data-act="seance-rec-jour"][data-def="d1"][data-jour="${jour}"]`)
			.check();
	}
}

/* 1. Compositeur encadrant : rendu sans erreur + création d'un programme
      (activité ajoutée, durée estimée, récurrence complète). */
test('compositeur encadrant : création d’un programme avec une activité et une récurrence hebdo', async ({
	page,
}) => {
	const errors = watchErrors(page);
	await page.addInitScript(CLEAR_PIN);
	await gotoHash(page, 'encadrant');

	const section = page.locator('.enc-seance-section');
	await expect(section).toBeVisible();
	await expect(section.locator('.enc-h2')).toContainText('Programme du jour');

	// Nouveau programme : une carte apparaît, vide au départ.
	await page.locator('[data-act="seance-add"]').click();
	await expect(section.locator('.enc-seance-def')).toHaveCount(1);

	// Ajout d'une activité « Sprint 5 min ».
	const selectEtape = section.locator('select[data-act="seance-etape-add"][data-def="d1"]');
	await selectEtape.selectOption('sprint');
	await expect(
		section.locator('.enc-seance-etape-mode').filter({ hasText: 'Sprint 5 min' }),
	).toBeVisible();
	// La durée estimée (repère encadrant) suit l'ajout.
	await expect(section.locator('.enc-seance-duree').filter({ hasText: '~5 min' })).toBeVisible();

	// Récurrence hebdo : coche les 7 jours, chacun reste coché (pas de conflit).
	for (let jour = 1; jour <= 7; jour++) {
		const case_ = section.locator(
			`input[data-act="seance-rec-jour"][data-def="d1"][data-jour="${jour}"]`,
		);
		await case_.check();
		await expect(case_).toBeChecked();
	}

	expect(errors).toEqual([]);
});

/* 2. Conflit de récurrence : un 2e programme qui revendique un jour déjà pris
      affiche un message, la case n'est pas retenue, sans erreur JS. */
test('compositeur encadrant : conflit de récurrence signalé sans crash', async ({ page }) => {
	const errors = watchErrors(page);
	await creerProgrammeSprintTousLesJours(page); // d1, jours 1..7

	// 2e programme (d2), qui tente le jour 1 (déjà pris par d1).
	await page.locator('[data-act="seance-add"]').click();
	const caseConflit = page.locator(
		'input[data-act="seance-rec-jour"][data-def="d2"][data-jour="1"]',
	);
	// Un simple clic (pas .check()) : l'app décide de NE PAS persister la coche,
	// .check() échouerait à attendre un état coché qui ne vient jamais.
	await caseConflit.click();

	await expect(page.locator('.enc-warn')).toBeVisible();
	await expect(page.locator('.enc-warn')).toContainText('déjà prévu');
	await expect(caseConflit).not.toBeChecked();

	expect(errors).toEqual([]);
});

/* 3. Écran enfant : la carte d'accueil propose le programme du jour, le clic
      mène à #seance avec au moins une tuile et la jauge de progression. */
test('accueil enfant : carte programme visible, mène à l’écran #seance', async ({ page }) => {
	const errors = watchErrors(page);
	await creerProgrammeSprintTousLesJours(page);

	// Retour à l'accueil enfant (bouton de l'espace encadrant).
	await page.locator('.enc-back[data-act="retour"]').click();
	await expect(page.locator('#home')).toBeVisible();

	const carte = page.locator('#cardProgramme');
	await expect(carte).toBeVisible();
	await carte.click();

	await expect(page).toHaveURL(/#seance$/);
	await expect(page.locator('.programme-tuile').first()).toBeVisible();
	await expect(page.locator('.programme-pastilles')).toBeVisible();

	expect(errors).toEqual([]);
});

/* 4. Lancement d'une étape : cliquer la tuile sprint mène à l'écran de config
      du sprint (déclencheur de mode existant, réutilisé par le programme). */
test('écran #seance : lancer la tuile sprint mène à la config du sprint', async ({ page }) => {
	const errors = watchErrors(page);
	await creerProgrammeSprintTousLesJours(page);

	await page.locator('.enc-back[data-act="retour"]').click();
	await page.locator('#cardProgramme').click();
	await expect(page).toHaveURL(/#seance$/);

	const tuile = page.locator('.programme-tuile[data-act="lancer"]').first();
	await expect(tuile).toBeVisible();
	await tuile.click();

	await expect(page).toHaveURL(/#sprint-config$/);
	await expect(page.locator('#sprintConfigContent')).toBeVisible();

	expect(errors).toEqual([]);
});
