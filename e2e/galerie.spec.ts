/* ============================================================
   Snapshots visuels de la galerie du catalogue (#412, #419).

   La route DEV `#galerie` (ui/galerie.ts) rend en une page la fiche de chaque
   leçon, groupée par catégorie, PUIS un exemplaire de chaque écran de runner
   interactif (#419 : tuiles, ordre, tri, appariement, problème, tableau).

   DEUX tests : (1) « se rend sans erreur » — GATANT, tourne partout, valide le
   rendu de toutes les fiches + runners sans erreur JS ; (2) « rendu par leçon
   conforme aux baselines » — comparaison pixel, une capture PAR LEÇON (article
   `.gal-lesson`) plus une par runner, actuellement DE-GATÉE (`test.fixme`, #458).

   POURQUOI DE-GATÉE (#458) : le rendu des articles a une hauteur NON DÉTERMINISTE
   au sous-pixel d'un run CI à l'autre (scaling SVG `width:100%/height:auto` des
   figures ; reflow de texte), donc aucune baseline ne tient de façon fiable et le
   jeu de leçons fautives varie d'un run à l'autre. La comparaison reprendra dans
   #458 une fois le rendu rendu déterministe (les baselines seront reconstruites
   via le workflow CI `update-snapshots.yml` — jamais en local, cf. e2e/README.md).

   Le 1er test tourne sur toutes les plateformes ; il valide la galerie en local
   sans dépendre des baselines. ============================================================ */
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
		// Écrans de runner (#419) : un exemplaire par type, rendu par le MÊME code que le
		// runner live (widgets partagés + boards extraits). On vérifie la présence des
		// boards via des sélecteurs STABLES du vrai rendu (pas de duplication de markup) :
		// si un board manquait (générateur cassé, extraction ratée), la galerie ne
		// détecterait plus la régression du runner correspondant.
		expect(await page.locator('[data-gallery^="runner-"]').count()).toBe(6);
		expect(
			await page.locator('[data-gallery="runner-tuiles"] #ltuiBac .tuile').count(),
		).toBeGreaterThan(0);
		expect(
			await page.locator('[data-gallery="runner-ordre"] .lord-seq .lord-cell').count(),
		).toBeGreaterThan(0);
		expect(await page.locator('[data-gallery="runner-tri"] .ltri-col').count()).toBe(2);
		expect(
			await page.locator('[data-gallery="runner-appariement"] #lappBoard .lapp-mot').count(),
		).toBeGreaterThan(0);
		expect(
			await page.locator('[data-gallery="runner-probleme"] .prob-etape').count(),
		).toBeGreaterThan(0);
		expect(
			await page.locator('[data-gallery="runner-tableau"] #tcTable .tc-cell').count(),
		).toBeGreaterThan(0);
		// Aucun effet de bord parasite : le tableau vit dans la galerie SANS son listener
		// clavier `document` (wireInteraction n'est PAS appelé) → le pavé est bien rendu,
		// mais purement décoratif ici.
		expect(await page.locator('[data-gallery="runner-tableau"] .tc-pave').count()).toBe(1);
		// Le rendu de fiches ET des runners ne doit lever aucune erreur JS (crash de
		// générateur, bind d'un widget, etc.).
		expect(errors).toEqual([]);
	});

	// Comparaison pixel DE-GATÉE (#458). Le rendu des articles de leçon a une hauteur NON
	// DÉTERMINISTE au sous-pixel d'un run CI à l'autre (scaling SVG `width:100%/height:auto`
	// des figures ; reflow de texte des fiches sans figure), sous deux formes : soit la
	// hauteur oscille d'1 px et Playwright n'obtient jamais deux captures stables, soit
	// l'image diffère de la baseline à taille égale. Le jeu de leçons fautives varie même
	// d'un run à l'autre, donc une liste d'exclusion ne converge pas. La comparaison
	// reprendra dans #458 une fois le rendu galerie rendu déterministe (tailles entières /
	// capture à échelle fixe). En attendant, le test « se rend sans erreur » ci-dessus reste
	// GATANT (rendu de toutes les fiches + runners sans erreur JS). Le corps par leçon est
	// conservé pour faciliter la reprise ; il est marqué `fixme` (ignoré, jamais rouge).
	test.fixme('rendu par leçon conforme aux baselines', async ({ page }) => {
		test.setTimeout(600_000);
		const shot = { animations: 'disabled' as const, timeout: 30_000 };
		await gotoHash(page, 'galerie');
		await page.locator('.galerie').waitFor({ state: 'visible' });
		// Polices chargées avant toute capture (le rendu du texte en dépend).
		await page.evaluate(() => document.fonts.ready);

		// Capture PAR LEÇON (article `.gal-lesson`), pas par catégorie : une section
		// catégorie empile toutes ses fiches (des dizaines de milliers de px pour la
		// numération), impossible à stabiliser au screenshot. Un article de leçon est petit
		// et le diff est localisé à la leçon fautive.
		const lessons = page.locator('[data-gallery-lesson]');
		const nLessons = await lessons.count();
		for (let i = 0; i < nLessons; i++) {
			const art = lessons.nth(i);
			const id = await art.getAttribute('data-gallery-lesson');
			await expect(art).toHaveScreenshot(`galerie-lesson-${id}.png`, shot);
		}

		// Écrans de RUNNER : petits, capturés tels quels (une section par runner).
		const runners = page.locator('[data-gallery^="runner-"]');
		const nRunners = await runners.count();
		for (let i = 0; i < nRunners; i++) {
			const sec = runners.nth(i);
			const id = await sec.getAttribute('data-gallery');
			await expect(sec).toHaveScreenshot(`galerie-${id}.png`, shot);
		}
	});
});
