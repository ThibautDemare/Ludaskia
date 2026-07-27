/* ============================================================
   Étape « À revoir » (#464) — smoke tests e2e.
   ------------------------------------------------------------
   Une étape « à revoir » d'un programme du jour est CONDITIONNELLE : elle ne
   s'applique que si l'encadrant a épinglé au moins une leçon/dictée (file
   `ludaskia_revoir`, cf. carte #aRevoir). Deux surfaces couvertes, dans
   l'esprit de programme-du-jour.spec.ts (mêmes helpers, même pattern
   watchErrors) :
   - le COMPOSITEUR encadrant (encadrant-seance.ts) : l'activité est
     proposable dans « + Ajouter une activité… » et son repère texte suit
     l'état de la file épinglée (rien -> « n'apparaîtra pas » ; 1 -> « ce sera
     celle-ci ») ;
   - l'ÉCRAN ENFANT #seance (ui/seance.ts) : une leçon épinglée fait
     apparaître la tuile « À revoir » et son lancement mène bien à la leçon ;
     une entrée épinglée de nature DICTÉE (id de file préfixé `ortho:`, cœur du
     mélange leçons/dictées de #464) mène, elle, à l'atelier d'orthographe ; à
     l'inverse, un programme dont la SEULE étape est « à revoir » et rien
     d'épinglé ne produit aucun programme du jour (ni carte d'accueil, ni
     écran #seance — la navigation redirige vers l'accueil).
   ============================================================ */
import { test, expect, type Page } from '@playwright/test';
import { watchErrors, gotoHash, seedAideVue } from './helpers';

/* Supprime tout verrou PIN éventuel persisté d'un test précédent. */
const CLEAR_PIN = `localStorage.removeItem('ludaskia_encadrant_lock');`;

/* Épingle UNE leçon réelle du catalogue CE2 pour le profil e2e (clé préfixée par
   le profil actif du helper, 'e2e/'), sans passer par la stat de faiblesse : une
   leçon jamais travaillée est déjà « à revoir » (revoirActives, pct == null). */
const SEED_REVOIR = `localStorage.setItem('e2e/ludaskia_revoir', JSON.stringify(['math-complements']));`;

/* Épingle UNE dictée prédéfinie (id de file préfixé `ortho:`, cf. `orthoRevoirId`) :
   `fr-ortho-invariables-1` existe sans seeding (liste PRÉDÉFINIE du catalogue
   d'orthographe, cf. ORTHO_PREDEF) et n'est jamais « acquise » sur un profil neuf
   (aucun mot encore travaillé) : elle reste active dans revoirActives. */
const SEED_REVOIR_DICTEE = `localStorage.setItem('e2e/ludaskia_revoir', JSON.stringify(['ortho:fr-ortho-invariables-1']));`;

/* Crée, via l'UI réelle du compositeur, UN programme avec une étape « À revoir »
   et une récurrence hebdomadaire sur les 7 jours (id de définition déterministe :
   'd1', 1er programme d'un profil neuf). Laisse la page sur #encadrant/programme. */
async function creerProgrammeARevoirTousLesJours(page: Page): Promise<void> {
	await page.addInitScript(CLEAR_PIN);
	await gotoHash(page, 'encadrant/programme');
	await page.locator('[data-act="seance-add"]').click();
	await page.locator('select[data-act="seance-etape-add"][data-def="d1"]').selectOption('aRevoir');
	for (let jour = 1; jour <= 7; jour++) {
		await page
			.locator(`input[data-act="seance-rec-jour"][data-def="d1"][data-jour="${jour}"]`)
			.check();
	}
}

/* 1. Compositeur encadrant : l'activité est proposable, avec un repère qui suit
      l'état de la file épinglée (rien épinglé, puis 1 leçon épinglée). */
test('compositeur encadrant : étape « À revoir » — repère selon la file épinglée', async ({
	page,
}) => {
	const errors = watchErrors(page);
	await page.addInitScript(CLEAR_PIN);
	await gotoHash(page, 'encadrant/programme');

	await page.locator('[data-act="seance-add"]').click();
	const selectEtape = page.locator('select[data-act="seance-etape-add"][data-def="d1"]');
	await expect(selectEtape.locator('option[value="aRevoir"]')).toHaveText('À revoir');
	await selectEtape.selectOption('aRevoir');

	await expect(
		page.locator('.enc-seance-etape-mode').filter({ hasText: 'À revoir' }),
	).toBeVisible();

	// Rien épinglé : le repère prévient que l'activité n'apparaîtra pas.
	await expect(page.locator('.enc-seance-arevoir')).toHaveText(
		"Rien n'est épinglé pour l'instant : cette activité n'apparaîtra pas dans le programme.",
	);

	// On épingle une leçon (évaluation directe, pas addInitScript : ne doit PAS
	// effacer le programme qu'on vient de composer) puis on recharge la vue.
	// `page.reload` (PAS `page.goto` vers la même URL, qui ne rechargerait qu'un
	// fragment côté Chromium et ne re-rendrait jamais la vue).
	await page.evaluate(SEED_REVOIR);
	await page.reload({ waitUntil: 'networkidle' });

	await expect(page.locator('.enc-seance-arevoir')).toHaveText(
		"Une seule leçon ou dictée épinglée : ce sera celle-ci. Une épinglée redevenue solide n'est plus proposée.",
	);

	expect(errors).toEqual([]);
});

/* 2. Écran enfant : une leçon épinglée fait apparaître une tuile « À revoir », et
      la lancer mène bien à l'exercice de cette leçon (rendu + correction).
      NOTE UX (une seule cible épinglée) : la tuile NOMME directement la leçon
      visée (avis pédagogue : l'enfant voit ce qu'il va faire), le mot « À revoir »
      étant lui-même affiché en repère sous le titre (`.programme-tuile-hint`) —
      seul un pool de 2+ épinglées retomberait sur un titre générique « À revoir ». */
test('écran #seance : tuile « À revoir » depuis une leçon épinglée, le clic lance la leçon', async ({
	page,
}) => {
	const errors = watchErrors(page);
	await page.addInitScript(SEED_REVOIR);
	await creerProgrammeARevoirTousLesJours(page);

	await page.locator('.enc-back[data-act="retour"]').click();
	await expect(page.locator('#home')).toBeVisible();

	const carte = page.locator('#cardProgramme');
	await expect(carte).toBeVisible();
	await carte.click();
	await expect(page).toHaveURL(/#seance$/);

	const tuile = page.locator('.programme-tuile[data-act="lancer"]').first();
	await expect(tuile).toBeVisible();
	await expect(tuile.locator('.programme-tuile-titre')).toHaveText('Complément à 10/100/1000');
	await expect(tuile.locator('.programme-tuile-hint')).toHaveText('À revoir');
	await tuile.click();

	// La leçon épinglée (math-complements, mono-mode) se lance et se rend.
	await expect(page).toHaveURL(/#(mode|lecon)-math-complements$/);
	const field = page.locator('.ans').first();
	await field.waitFor();
	const expected = await field.getAttribute('data-answer');
	await field.fill(expected ?? '');
	await page.locator('#btnVerify').click();
	await expect(page.locator('.mark.correct').first()).toBeVisible();

	expect(errors).toEqual([]);
});

/* 3. Écran enfant : une entrée épinglée de nature DICTÉE (`ortho:` préfixé) mène
      bien à l'atelier d'orthographe (pas à une leçon) — la branche qui distingue
      #464 d'un simple pool de leçons. Pool à UNE seule entrée : déterministe. */
test('écran #seance : tuile « À revoir » depuis une dictée épinglée mène à l’orthographe', async ({
	page,
}) => {
	const errors = watchErrors(page);
	await seedAideVue(page); // neutralise la bulle d'aide 1er lancement de l'atelier
	await page.addInitScript(SEED_REVOIR_DICTEE);
	await creerProgrammeARevoirTousLesJours(page);

	await page.locator('.enc-back[data-act="retour"]').click();
	await expect(page.locator('#home')).toBeVisible();

	await page.locator('#cardProgramme').click();
	await expect(page).toHaveURL(/#seance$/);

	const tuile = page.locator('.programme-tuile[data-act="lancer"]').first();
	await expect(tuile).toBeVisible();
	await tuile.click();

	// Liste jamais découverte -> atelier de découverte (pas de choix de mode).
	await expect(page).toHaveURL(/#ortho-fr-ortho-invariables-1$/);
	await expect(page.locator('#atelierMot')).toBeVisible();

	expect(errors).toEqual([]);
});

/* 4. Rien d'épinglé, programme réduit à la seule étape « à revoir » : elle est
      escamotée -> pas de programme du jour du tout (ni carte, ni écran #seance,
      qui redirige vers l'accueil). */
test('écran #seance : rien épinglé + seule étape « à revoir » -> pas de programme du jour', async ({
	page,
}) => {
	const errors = watchErrors(page);
	await creerProgrammeARevoirTousLesJours(page); // aucun SEED_REVOIR

	await page.locator('.enc-back[data-act="retour"]').click();
	await expect(page.locator('#home')).toBeVisible();
	await expect(page.locator('#cardProgramme')).toBeHidden();

	await page.goto('app.html#seance', { waitUntil: 'networkidle' });
	await expect(page).toHaveURL(/#accueil$/);
	await expect(page.locator('#home')).toBeVisible();

	expect(errors).toEqual([]);
});
