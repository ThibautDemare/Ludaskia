/* ============================================================
   Snapshots visuels de la galerie du catalogue (#412, #419).

   La route DEV `#galerie` (ui/galerie.ts) rend en une page la fiche de chaque
   leçon, groupée par catégorie, PUIS un exemplaire de chaque écran de runner
   interactif (#419 : tuiles, ordre, tri, appariement, problème, tableau). On
   compare le rendu COURANT à des baselines commitées, une capture PAR LEÇON
   (article `.gal-lesson`) plus une par écran de runner : diff localisé et PNG de
   taille raisonnable. Capturer une CATÉGORIE entière (ses fiches empilées, des
   dizaines de milliers de px) ne se stabilisait pas au screenshot (#412) ; la
   capture par leçon est petite, stable, et localise le diff. Une nouvelle leçon est
   donc capturée AUTOMATIQUEMENT. Une seule route/spec couvre tout le catalogue.

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

	// Leçons dont la HAUTEUR rendue est INSTABLE au screenshot (arrondi sous-pixel : scaling
	// SVG `width:100%/height:auto` pour les figures, reflow de texte pour les fiches sans
	// figure) → Playwright n'y obtient jamais deux captures consécutives stables. On les
	// EXCLUT de la comparaison pixel (elles restent couvertes par les tests de logique).
	// Contournement TRACÉ dans #458 : le test échoue quand même sur toute NOUVELLE leçon
	// fautive non listée ici (garde-fou anti-régression).
	const INSTABLES_GALERIE = new Set([
		'num-frac-collection',
		'geo-cm1-solides',
		'geo-symetrie-axiale',
		'fr-conj-aimer-futur',
	]);

	test('rendu par leçon conforme aux baselines', async ({ page }, testInfo) => {
		test.skip(
			process.platform !== 'linux',
			'Baselines ancrées sur le rendu Linux de la CI (#412) — comparaison ignorée hors Linux.',
		);
		// Beaucoup de captures (une par leçon) : le timeout par test par défaut ne couvre
		// pas la SOMME → on l'élargit largement.
		test.setTimeout(600_000);
		// Timeout PAR capture élargi (défaut 5 s) : la galerie rend TOUTES les fiches, donc
		// la page reste très haute ; prendre deux screenshots consécutifs stables d'un
		// élément y prend plusieurs secondes (scroll + layout de la page entière).
		const shot = { animations: 'disabled' as const, timeout: 30_000 };
		await gotoHash(page, 'galerie');
		await page.locator('.galerie').waitFor({ state: 'visible' });
		// Polices chargées avant toute capture (le rendu du texte en dépend).
		await page.evaluate(() => document.fonts.ready);

		// Capture PAR LEÇON (article `.gal-lesson`), pas par catégorie : une section
		// catégorie empile toutes ses fiches (des dizaines de milliers de px pour la
		// numération), impossible à stabiliser au screenshot (#412). Un article de leçon
		// est petit et le diff est localisé à la leçon fautive.
		const enMiseAJour = testInfo.config.updateSnapshots !== 'none';
		const inattendus: string[] = [];
		const capturer = async (loc: import('@playwright/test').Locator, nom: string, cle: string) => {
			try {
				await expect(loc).toHaveScreenshot(nom, shot);
			} catch {
				// Écart pixel OU instabilité non déclarée : on continue (on tente TOUTES les
				// leçons en une passe), on tranche à la fin.
				inattendus.push(cle);
			}
		};

		const lessons = page.locator('[data-gallery-lesson]');
		const nLessons = await lessons.count();
		expect(nLessons).toBeGreaterThan(0);
		for (let i = 0; i < nLessons; i++) {
			const art = lessons.nth(i);
			const id = (await art.getAttribute('data-gallery-lesson')) ?? String(i);
			if (INSTABLES_GALERIE.has(id)) continue; // instabilité connue et tracée
			await capturer(art, `galerie-lesson-${id}.png`, id);
		}

		// Écrans de RUNNER : petits, capturés tels quels (une section par runner).
		const runners = page.locator('[data-gallery^="runner-"]');
		const nRunners = await runners.count();
		for (let i = 0; i < nRunners; i++) {
			const sec = runners.nth(i);
			const id = (await sec.getAttribute('data-gallery')) ?? `runner-${i}`;
			await capturer(sec, `galerie-${id}.png`, id);
		}

		// En régénération (`--update-snapshots`) : on écrit ce qu'on peut et on SIGNALE les
		// instables non déclarées (à ajouter à la liste). En comparaison (CI gatante) :
		// toute leçon fautive non listée fait ÉCHOUER le test (garde-fou anti-régression).
		if (enMiseAJour) {
			if (inattendus.length)
				console.log('Galerie — instables non déclarées à tracer :', inattendus.join(', '));
		} else {
			expect(
				inattendus,
				`Galerie — écarts/instabilités inattendus : ${inattendus.join(', ')}`,
			).toEqual([]);
		}
	});
});
