/* ============================================================
   Snapshots visuels de la galerie du catalogue (#412).

   La route DEV `#galerie` (ui/galerie.ts) rend en une page la fiche de chaque
   leçon, groupée par catégorie. On compare le rendu COURANT à des baselines
   commitées, une capture par catégorie (`data-gallery`) : diff localisé, PNG de
   taille raisonnable. Une seule route/spec couvre tout le catalogue visuel.

   ANCRAGE SUR LA CI (#412) : les baselines sont ancrées sur le rendu du runner
   CI (ubuntu + Chromium mobile Pixel 5). Le rendu du texte dépend des polices de
   l'OS → hors Linux (dev Windows/macOS) la comparaison échouerait toujours. Le
   test de comparaison est donc IGNORÉ hors Linux (visible « skipped », pas
   « failed »). Les baselines se (re)génèrent via le workflow CI dédié
   `update-snapshots.yml` (cf. e2e/README.md) — jamais en local.

   Le 1er test (rendu sans erreur + présence des sections) tourne, LUI, sur
   toutes les plateformes : il valide la galerie en local sans dépendre des
   baselines. ============================================================ */
import { test, expect } from '@playwright/test';
import { gotoHash, watchErrors } from './helpers';

test.describe('Galerie visuelle (#412)', () => {
	test('la galerie se rend sans erreur et expose ses sections', async ({ page }) => {
		const errors = watchErrors(page);
		await gotoHash(page, 'galerie');
		await page.locator('.galerie').waitFor({ state: 'visible' });
		// Plusieurs sections (une par catégorie non vide) et une fiche par leçon : le
		// catalogue en compte plus de 100, borne basse prudente. Ce contrôle tourne sur
		// TOUTES les plateformes (pas seulement via les captures Linux).
		expect(await page.locator('[data-gallery]').count()).toBeGreaterThan(5);
		expect(await page.locator('.gal-lesson').count()).toBeGreaterThan(80);
		// Garde-fou de rendu (indépendant des baselines) : les affordances de réponse
		// existent bien. Les QCM en cases à cocher (rendu papier) doivent apparaître —
		// à 0 on aurait des fiches QCM muettes (bug d'un contexte sans printMode) ; les
		// champs/cases de saisie (`.ans`, cloze, posé) couvrent les fiches en saisie.
		expect(await page.locator('.qcm-print-choices').count()).toBeGreaterThan(0);
		expect(
			await page
				.locator('.gal-lesson .ans, .gal-lesson .cloze-box, .gal-lesson .posee-cell')
				.count(),
		).toBeGreaterThan(0);
		// Le rendu de fiches ne doit lever aucune erreur JS (crash de générateur, etc.).
		expect(errors).toEqual([]);
	});

	test('rendu par catégorie conforme aux baselines', async ({ page }) => {
		test.skip(
			process.platform !== 'linux',
			'Baselines ancrées sur le rendu Linux de la CI (#412) — comparaison ignorée hors Linux.',
		);
		await gotoHash(page, 'galerie');
		await page.locator('.galerie').waitFor({ state: 'visible' });
		// Polices chargées avant toute capture (le rendu du texte en dépend).
		await page.evaluate(() => document.fonts.ready);

		const sections = page.locator('[data-gallery]');
		const count = await sections.count();
		for (let i = 0; i < count; i++) {
			const sec = sections.nth(i);
			const id = await sec.getAttribute('data-gallery');
			// Capture par CATÉGORIE (élément), pas la page entière : diff localisé.
			// `animations: 'disabled'` fige toute animation/transition CSS résiduelle.
			await expect(sec).toHaveScreenshot(`galerie-${id}.png`, { animations: 'disabled' });
		}
	});
});
