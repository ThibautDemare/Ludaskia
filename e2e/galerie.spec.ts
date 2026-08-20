/* ============================================================
   Snapshots visuels de la galerie du catalogue (#412, #419, #458).

   La route DEV `#galerie` (ui/galerie.ts) rend en une page la fiche de chaque
   leçon, groupée par catégorie, PUIS un exemplaire de chaque écran de runner
   interactif (#419 : tuiles, ordre, tri, appariement, problème, tableau).

   DEUX tests : (1) « se rend sans erreur » — tourne partout, valide le rendu de
   toutes les fiches + runners sans erreur JS ; (2) « rendu par leçon conforme aux
   baselines » — comparaison pixel, une capture PAR LEÇON (article `.gal-lesson`)
   plus une par runner.

   POURQUOI LE VIEWPORT EST AGRANDI AVANT LES CAPTURES (#458) — c'est la seule
   raison d'être du bloc de dimensionnement, et elle est mesurée : 185 des 189
   captures (179 des 183 fiches, et les 6 écrans de runner) sont PLUS HAUTES que
   le viewport nominal du profil mobile (393×727). Playwright ne sait
   capturer un élément plus grand que le viewport qu'en DÉFILANT et en ASSEMBLANT
   plusieurs prises, et cet assemblage n'est pas déterministe : deux captures
   consécutives de la même fiche, sans aucune animation et à hauteur parfaitement
   stable, diffèrent déjà. Mesure : 178 fiches instables sur 183 au viewport
   nominal, 0 sur 183 dès que le viewport dépasse la plus grande fiche. C'est ce
   qui a de-gaté ce test pendant des mois, PAS un arrondi sous-pixel des figures
   SVG (leur hauteur est stable au centième sur douze prises), ni un écart entre
   le rendu local et celui de la CI (l'échec se reproduit dans un seul run, sur
   une seule machine, en local comme sur le runner).

   CE QUE CE RÉGIME NE VOIT PAS, en échange : tout ce qui ne s'exprime qu'à
   viewport court — règles en `vh`, `position: sticky`, media queries de hauteur
   (`@media (orientation: landscape) and (max-height: 540px)` sur `.figure-svg`).
   Aucune ne s'applique aujourd'hui à la galerie (barre d'outils et pied de page y
   sont masqués, cf. galerie.scss), mais une régression de ce genre passerait ici
   inaperçue : elle relève des specs de leçon, pas de la galerie.

   Les baselines sont régénérées via le workflow CI `update-snapshots.yml` —
   jamais en local (le rendu du texte diffère de Linux, cf. e2e/README.md).
   ============================================================ */
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

	test('rendu par leçon conforme aux baselines', async ({ page }) => {
		test.setTimeout(600_000);
		const shot = { animations: 'disabled' as const, timeout: 30_000 };
		const largeur = page.viewportSize()?.width ?? 393;
		await gotoHash(page, 'galerie');
		await page.locator('.galerie').waitFor({ state: 'visible' });
		// Polices chargées avant toute capture (le rendu du texte en dépend).
		await page.evaluate(() => document.fonts.ready);

		// Capture PAR LEÇON (article `.gal-lesson`), pas par catégorie : une section
		// catégorie empile toutes ses fiches (des dizaines de milliers de px pour la
		// numération), impossible à stabiliser au screenshot. Un article de leçon est petit
		// et le diff est localisé à la leçon fautive.
		const lessons = page.locator('[data-gallery-lesson]');
		const captures = page.locator('[data-gallery-lesson], [data-gallery^="runner-"]');

		// ─── Viewport assez haut pour la PLUS GRANDE capture (#458) ───
		// Tant qu'un élément dépasse le viewport, Playwright le capture en défilant et en
		// assemblant plusieurs prises, et le résultat n'est pas reproductible (cf.
		// l'en-tête). On mesure donc les hauteurs réelles, puis on agrandit UNE FOIS — la
		// largeur, elle, ne change pas, donc la mise en page des fiches non plus.
		const hauteurs = await captures.evaluateAll((els) =>
			els.map((el) => el.getBoundingClientRect().height),
		);
		// Garde-fou anti-vide : un sélecteur cassé ne doit pas faire passer ce bloc sur
		// rien du tout, ni retomber sur `Math.max()` = -Infinity. Le catalogue dépasse
		// largement la centaine de leçons.
		expect(hauteurs.length).toBeGreaterThan(80);
		// Marge de 8 px : les hauteurs sont fractionnaires (`height:auto` des SVG), et un
		// simple `ceil` laisserait la plus grande fiche affleurer le bord du viewport.
		await page.setViewportSize({ width: largeur, height: Math.ceil(Math.max(...hauteurs)) + 8 });
		await page.evaluate(() => document.fonts.ready);

		// L'INVARIANT dont dépend tout le déterminisme : après l'agrandissement, plus
		// AUCUNE capture ne dépasse le viewport. Vérifié, pas supposé — si une fiche
		// grandissait au redimensionnement (règle en `vh`, media query de hauteur), on
		// retomberait silencieusement dans le défilement-assemblage et le test
		// redeviendrait le loto qu'il était.
		const viewport = page.viewportSize()?.height ?? 0;
		const debordent = await captures.evaluateAll(
			(els, h) =>
				els
					.filter((el) => el.getBoundingClientRect().height > h)
					.map(
						(el) =>
							el.getAttribute('data-gallery-lesson') ?? el.getAttribute('data-gallery') ?? '?',
					),
			viewport,
		);
		expect(
			debordent,
			`Ces captures dépassent encore le viewport de ${viewport} px : Playwright les ` +
				`assemblerait par défilement et les baselines redeviendraient instables (#458).`,
		).toEqual([]);
		// Limite de texture du compositeur : au-delà de 16384 px physiques, Chromium ne
		// rastérise plus la surface d'un coup. Le DPR fractionnaire du profil mobile (2,75)
		// rapproche ce plafond de trois fois — on préfère un échec qui l'explique à une
		// capture tronquée qu'on croirait conforme.
		const dpr = await page.evaluate(() => window.devicePixelRatio);
		expect(
			viewport * dpr,
			`Viewport nécessaire ${viewport} px × DPR ${dpr} : au-delà de la limite de texture ` +
				`de Chromium. Il faut alors découper la plus grande fiche, pas agrandir davantage.`,
		).toBeLessThan(16384);

		const nLessons = await lessons.count();
		for (let i = 0; i < nLessons; i++) {
			const art = lessons.nth(i);
			const id = await art.getAttribute('data-gallery-lesson');
			await expect(art).toHaveScreenshot(`galerie-lesson-${id}.png`, shot);
		}

		// Écrans de RUNNER : une section par runner. Eux aussi dépassent le viewport
		// nominal (mesuré : les 6), donc ils entrent dans le périmètre agrandi ci-dessus.
		const runners = page.locator('[data-gallery^="runner-"]');
		const nRunners = await runners.count();
		for (let i = 0; i < nRunners; i++) {
			const sec = runners.nth(i);
			const id = await sec.getAttribute('data-gallery');
			await expect(sec).toHaveScreenshot(`galerie-${id}.png`, shot);
		}
	});
});
