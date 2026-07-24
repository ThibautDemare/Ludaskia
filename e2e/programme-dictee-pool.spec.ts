/* ============================================================
   Étape « Une dictée » à POOL (#463) — smoke tests e2e.
   ------------------------------------------------------------
   Une étape « Une dictée » d'un programme peut désormais viser PLUSIEURS
   dictées (une liste à cocher remplace l'ancien menu déroulant mono-valeur) :
   1 cochée -> toujours la même ; 2+ -> une au hasard à chaque lancement.
   Deux surfaces couvertes ici, dans l'esprit de programme-du-jour.spec.ts
   (mêmes helpers, même pattern watchErrors) :
   - le COMPOSITEUR encadrant (encadrant-seance.ts) : la liste à cocher
     apparaît au 1er ajout de l'étape (1re dictée pré-cochée), et le repère
     texte change dès qu'une 2e dictée est cochée ;
   - l'ÉCRAN ENFANT #seance (ui/seance.ts) : une étape à pool affiche le
     titre générique « Une dictée » et son lancement mène bien à l'écran
     d'orthographe (aucune dictée prédéfinie n'étant encore découverte sur
     un profil neuf, le tirage mène TOUJOURS à l'atelier de découverte,
     quelle que soit la dictée piochée dans le pool — déterministe).
   ============================================================ */
import { test, expect, type Page, type Locator } from '@playwright/test';
import { watchErrors, gotoHash, seedAideVue } from './helpers';

/* Supprime tout verrou PIN éventuel persisté d'un test précédent. */
const CLEAR_PIN = `localStorage.removeItem('ludaskia_encadrant_lock');`;

/* Coche une 2e dictée du pool (en plus de la 1re, cochée par défaut) : lit les
   `data-ref` un par une (évaluation ponctuelle, PAS un `:not(:checked)` vivant —
   ce sélecteur redevient invalide dès la case cochée, ce qui ferait boucler
   Playwright sur une case différente à chaque nouvelle tentative), puis coche
   une case précise par son `data-ref` stable. */
async function cocherUneDeuxiemeDictee(fieldset: Locator): Promise<void> {
	const cases = fieldset.locator('input[data-act="seance-dictee-toggle"]');
	const refs = await cases.evaluateAll((els) =>
		(els as HTMLInputElement[]).map((el) => ({ ref: el.dataset.ref ?? '', checked: el.checked })),
	);
	const cible = refs.find((r) => !r.checked);
	if (!cible)
		throw new Error('Aucune dictée disponible à cocher en plus de la 1re (pool trop petit).');
	await fieldset.locator(`input[data-act="seance-dictee-toggle"][data-ref="${cible.ref}"]`).check();
}

/* Crée, via l'UI réelle du compositeur, UN programme avec une étape « Une
   dictée » dont le pool contient 2 dictées (la 1re cochée par défaut + une
   2e cochée à la main), et une récurrence hebdomadaire sur les 7 jours (id de
   définition déterministe : 'd1', 1er programme d'un profil neuf ; id d'étape
   déterministe : 'e1', 1re étape ajoutée). Laisse la page sur
   #encadrant/programme. */
async function creerProgrammeDicteePoolTousLesJours(page: Page): Promise<void> {
	await page.addInitScript(CLEAR_PIN);
	await gotoHash(page, 'encadrant/programme');
	await page.locator('[data-act="seance-add"]').click();
	await page.locator('select[data-act="seance-etape-add"][data-def="d1"]').selectOption('dictee');

	const fieldset = page.locator('fieldset.enc-seance-dictees');
	await cocherUneDeuxiemeDictee(fieldset);

	for (let jour = 1; jour <= 7; jour++) {
		await page
			.locator(`input[data-act="seance-rec-jour"][data-def="d1"][data-jour="${jour}"]`)
			.check();
	}
}

/* 1. Compositeur encadrant : ajout d'une étape « Une dictée » -> liste à cocher
      avec une dictée pré-cochée ; cocher une 2e dictée fait basculer le repère
      sur le message « au hasard », sans erreur JS. */
test('compositeur encadrant : étape « Une dictée » — pré-coché puis pool de 2 → repère « au hasard »', async ({
	page,
}) => {
	const errors = watchErrors(page);
	await page.addInitScript(CLEAR_PIN);
	await gotoHash(page, 'encadrant/programme');

	await page.locator('[data-act="seance-add"]').click();
	await page.locator('select[data-act="seance-etape-add"][data-def="d1"]').selectOption('dictee');

	const fieldset = page.locator('fieldset.enc-seance-dictees');
	await expect(fieldset).toBeVisible();

	await expect(fieldset.locator('input[data-act="seance-dictee-toggle"]:checked')).toHaveCount(1);
	await expect(fieldset.locator('label.enc-seance-dictee.on')).toHaveCount(1);
	await expect(fieldset.locator('.enc-seance-dictees-hint')).toHaveText(
		'Une seule dictée : toujours celle-ci.',
	);

	// Coche une 2e dictée (la 1re case encore décochée, par son `data-ref` stable).
	await cocherUneDeuxiemeDictee(fieldset);

	await expect(fieldset.locator('label.enc-seance-dictee.on')).toHaveCount(2);
	await expect(fieldset.locator('.enc-seance-dictees-hint')).toHaveText(
		'2 dictées : une au hasard à chaque lancement.',
	);

	expect(errors).toEqual([]);
});

/* 2. Écran enfant : une étape « Une dictée » à pool de 2 affiche le titre
      générique « Une dictée » et son lancement mène bien à l'écran
      d'orthographe (atelier de découverte, aucune des 2 cibles n'étant encore
      connue du profil), sans erreur JS. */
test('écran #seance : lancer une étape « Une dictée » à pool mène à l’orthographe', async ({
	page,
}) => {
	const errors = watchErrors(page);
	await seedAideVue(page); // neutralise la bulle d'aide 1er lancement de l'atelier
	await creerProgrammeDicteePoolTousLesJours(page);

	await page.locator('.enc-back[data-act="retour"]').click();
	await page.locator('#cardProgramme').click();
	await expect(page).toHaveURL(/#seance$/);

	const tuile = page.locator('.programme-tuile[data-act="lancer"]').first();
	await expect(tuile).toBeVisible();
	await expect(tuile.locator('.programme-tuile-titre')).toHaveText('Une dictée');
	await tuile.click();

	// Pool jamais découvert -> tirage quelconque, TOUJOURS l'atelier de découverte.
	await expect(page).toHaveURL(/#ortho-[^#]+$/);
	await expect(page.locator('#atelierMot')).toBeVisible();

	expect(errors).toEqual([]);
});
