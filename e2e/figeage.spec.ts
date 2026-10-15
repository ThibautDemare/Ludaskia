/* ============================================================
   Figeage post-réponse (#543) : un widget répondu reste VISIBLE mais n'est plus manipulable,
   et ce par les DEUX chemins (« Vérifier » / « Valider », puis « Je ne sais pas, montre-moi »),
   dans chaque runner de la table `figeage-couverture.ts`, en leçon comme en révision.

   Les attendus viennent de l'issue, pas du code :
   - critère 2 : rien du widget n'est atteignable au Tab (ni au Maj+Tab), aucun clic, glisser
     ou flèche ne le modifie, le bouton de validation ne revient ni visible ni actif ;
   - critère 3 : le focus est sur « Continuer ▶ » / « Voir mon résultat ▶ » ;
   - critère 7 (négatif) : ni `inert` ni `aria-hidden` sur le widget ni sur ses régions live ;
   - critère 9 (négatif) : « Écouter » et l'aide du geste restent activés, « Continuer » avance.

   « Atteignable au Tab » se juge par le COMPORTEMENT (élément focalisable, non désactivé,
   `tabindex` ≠ -1, visible), pas par un attribut précis : c'est l'exigence, pas le moyen.
   L'étayage (« Revoir l'explication ») est un complément d'après-verdict, exclu de la zone
   comme le chrome. Le geste Entrée/Espace n'est volontairement pas rejoué : le focus est sur « Continuer »,
   qu'il activerait, et ce n'est pas le widget.
   ============================================================ */
import { test, expect, type Page } from '@playwright/test';
import { watchErrors } from './helpers';
import { COUVERTURE_FIGEAGE, type EntreeFigeage } from './figeage-couverture';

/* Zones selon l'écran. Scène = ce qu'on fige ; le reste est l'après-verdict, le chrome
   (Écouter, aide du geste) et le brouillon du problème, qui doivent rester opérables. */
const ZONES = {
	lecon: {
		scene: '.sprint-stage',
		exclu:
			'.sprint-correction, .sprint-actions, .aide-btn, .consigne-tts, .item-tts, .brouillon, .etayage-btn, .etay-lien',
		continuer: '.sprint-actions button',
		passer: '#leconPasser',
	},
	revision: {
		scene: '#revStage',
		exclu:
			'#revAfter, #revNext, .rev-feedback, .aide-btn, .consigne-tts, .item-tts, .brouillon, .etayage-btn, .etay-lien',
		continuer: '#revNext',
		passer: '#revGiveUp',
	},
} as const;

/* Les épargnes du figeage : ce qui reste opérable (critère 9 de #543). COPIE VOULUE de
   `EPARGNES` (`src/ui/figeage.ts`), pas un import : c'est l'attendu du test. Importée, la
   liste suivrait le code, et un retrait d'épargne passerait inaperçu. */
const EPARGNES = '.aide-btn, .consigne-tts, .item-tts, .etayage-btn, .etay-lien, .brouillon';

/* Même garde tolérante que je-ne-sais-pas.spec.ts : « Je ne sais pas » ouvre d'abord
   l'étayage de la notion quand elle en porte un ; on le referme sans en juger. */
async function fermerEtayageSiOuvert(page: Page): Promise<void> {
	const panneau = page.locator('#etayageOverlay');
	if (await panneau.isVisible().catch(() => false)) {
		await page.locator('#etayageOverlay .aide-close').click();
		await expect(panneau).toHaveCount(0);
	}
}

/* Éléments du widget atteignables au Tab : focalisables (`tabIndex` ≥ 0), non désactivés,
   rendus. Zone = scène moins l'après-verdict, le chrome et le brouillon. */
async function tabbablesDuWidget(page: Page, scene: string, exclu: string): Promise<string[]> {
	return page.evaluate(
		({ scene, exclu }) => {
			const racine = document.querySelector(scene);
			if (!racine) return ['(scène introuvable)'];
			const visible = (el: Element) =>
				el.getClientRects().length > 0 && getComputedStyle(el).visibility !== 'hidden';
			return [...racine.querySelectorAll<HTMLElement>('*')]
				.filter(
					(el) => !el.closest(exclu) && el.tabIndex >= 0 && !el.matches(':disabled') && visible(el),
				)
				.map((el) => `${el.tagName.toLowerCase()}.${el.className || '(sans classe)'}`);
		},
		{ scene, exclu },
	);
}

/* Photographie du widget : la scène privée de ce qui peut légitimement bouger (après-verdict,
   chrome, brouillon, régions live). Deux photos égales = le widget n'a pas été modifié. */
async function photoDuWidget(page: Page, scene: string, exclu: string): Promise<string> {
	return page.evaluate(
		({ scene, exclu }) => {
			const racine = document.querySelector(scene);
			if (!racine) return '(scène introuvable)';
			const copie = racine.cloneNode(true) as HTMLElement;
			// `.tc-jauge` : jauge décorative (`aria-hidden`) du tableau de conversion, dont le
			// curseur change de `left` dès que le tableau défile. Le `scrollIntoView` de
			// `tenterDeManipuler` suffit à la faire bouger, widget figé ou non : ce n'est pas
			// une modification du widget par l'enfant.
			copie.querySelectorAll(`${exclu}, [role="status"], .tc-jauge`).forEach((n) => n.remove());
			return copie.innerHTML;
		},
		{ scene, exclu },
	);
}

/* Marche au clavier depuis « Continuer » : le focus ne doit s'arrêter nulle part dans le
   widget, ni en avant (Tab) ni en arrière (Maj+Tab). Renvoie les arrêts fautifs. */
async function arretsDansLeWidget(page: Page, scene: string, exclu: string): Promise<string[]> {
	const fautifs: string[] = [];
	for (const touche of ['Tab', 'Shift+Tab']) {
		for (let i = 0; i < 25; i++) {
			await page.keyboard.press(touche);
			const dedans = await page.evaluate(
				({ scene, exclu }) => {
					const el = document.activeElement as HTMLElement | null;
					const racine = document.querySelector(scene);
					if (!el || !racine || !racine.contains(el) || el.closest(exclu)) return null;
					// Conteneur défilant que Chromium rend atteignable au Tab de lui-même
					// (`tabIndex` -1, pas un choix du widget) : ce n'est pas un élément à figer.
					if (
						el.tabIndex < 0 &&
						(el.scrollWidth > el.clientWidth || el.scrollHeight > el.clientHeight)
					)
						return null;
					return `${el.tagName.toLowerCase()}.${el.className || '(sans classe)'}`;
				},
				{ scene, exclu },
			);
			if (dedans) fautifs.push(`${touche} #${i + 1} : ${dedans}`);
		}
	}
	return fautifs;
}

/* Tente de manipuler le widget : clics (tap) au centre de ses éléments, un glisser-déposer
   si le widget en a un, puis les flèches. */
async function tenterDeManipuler(page: Page, entree: EntreeFigeage): Promise<void> {
	const { scene, exclu } = ZONES[entree.ecran];
	for (let i = 0; i < 20; i++) {
		const point = await page.evaluate(
			({ scene, exclu, i }) => {
				const racine = document.querySelector(scene);
				if (!racine) return null;
				const candidats = [
					...racine.querySelectorAll<HTMLElement>(
						'button, input, select, textarea, [role], [tabindex], [draggable], [class*="tuile"], [class*="mot"], [class*="cell"], [class*="col"], [class*="hit"], [class*="slot"], [class*="choice"], [class*="fente"]',
					),
				].filter((el) => !el.closest(exclu) && el.getClientRects().length > 0);
				const el = candidats[i];
				if (!el) return null;
				el.scrollIntoView({ block: 'center' });
				const r = el.getBoundingClientRect();
				const x = r.left + r.width / 2;
				const y = r.top + r.height / 2;
				const dessus = document.elementFromPoint(x, y);
				// Ne jamais cliquer « Continuer » ou le chrome par accident : ce n'est pas le widget.
				if (!dessus || dessus.closest(exclu)) return { x: -1, y: -1 };
				return { x, y };
			},
			{ scene, exclu, i },
		);
		if (!point) break;
		if (point.x >= 0) await page.mouse.click(point.x, point.y);
	}
	if (entree.glisser) {
		const source = page.locator(entree.glisser.source).first();
		if (await source.isVisible()) {
			await page
				.dragAndDrop(entree.glisser.source, entree.glisser.cible, { force: true, timeout: 3000 })
				.catch(() => {});
		}
	}
	for (const touche of ['ArrowRight', 'ArrowDown', 'ArrowLeft', 'ArrowUp']) {
		await page.keyboard.press(touche);
	}
}

for (const [runner, entrees] of Object.entries(COUVERTURE_FIGEAGE)) {
	for (const entree of entrees) {
		// Une entrée sans « Je ne sais pas » n'a pas de chemin `passer` : pas de test du tout.
		const chemins = entree.sansRevelation
			? (['verifier'] as const)
			: (['verifier', 'passer'] as const);
		for (const chemin of chemins) {
			test(`${runner} / ${chemin} : ${entree.titre}`, async ({ page }) => {
				const errors = watchErrors(page);
				const zone = ZONES[entree.ecran];
				await entree.amorce?.(page);
				await entree.ouvrir(page);

				if (chemin === 'verifier') {
					await entree.completer(page);
					if (entree.valider) await page.locator(entree.valider).click();
				} else {
					await page.locator(zone.passer).click();
					await fermerEtayageSiOuvert(page);
				}

				const continuer = page.locator(zone.continuer).first();
				await expect(continuer).toBeVisible();

				// Critère 3 : le focus est sur « Continuer ▶ ».
				await expect(continuer, 'critère 3 : le focus est sur « Continuer »').toBeFocused();

				// Critère 2 : rien du widget n'est focalisable.
				expect(
					await tabbablesDuWidget(page, zone.scene, zone.exclu),
					'critère 2 : éléments du widget encore atteignables au Tab',
				).toEqual([]);
				expect(
					await arretsDansLeWidget(page, zone.scene, zone.exclu),
					'critère 2 : arrêts du focus dans le widget au Tab / Maj+Tab',
				).toEqual([]);

				// Critère 7 : le widget et ses régions live restent exposés aux lecteurs d'écran.
				const masques = await page.evaluate(
					({ scene, exclu }) => {
						const racine = document.querySelector(scene);
						const cache = (el: Element) => !!el.closest('[inert], [aria-hidden="true"]');
						const fautifs: string[] = [];
						if (racine && cache(racine)) fautifs.push(`scène ${scene}`);
						racine
							?.querySelectorAll('button, input, select, textarea, [role], [tabindex], [draggable]')
							.forEach((el) => {
								if (!el.closest(exclu) && cache(el))
									fautifs.push(`${el.tagName.toLowerCase()}.${el.className}`);
							});
						document.querySelectorAll('[role="status"]').forEach((el) => {
							if (cache(el)) fautifs.push(`région live #${el.id || el.className}`);
						});
						return fautifs;
					},
					{ scene: zone.scene, exclu: zone.exclu },
				);
				expect(masques, 'critère 7 : widget ou région live masqué (inert / aria-hidden)').toEqual(
					[],
				);

				// Critère 2 (suite) : aucun clic, glisser ni flèche ne modifie le widget, et le
				// bouton de validation ne revient ni visible ni actif.
				const avant = await photoDuWidget(page, zone.scene, zone.exclu);
				await tenterDeManipuler(page, entree);
				const apres = await photoDuWidget(page, zone.scene, zone.exclu);
				expect(apres, 'critère 2 : le widget a été modifié après figeage').toBe(avant);
				if (entree.valider) {
					const reveille = await page.evaluate((sel) => {
						const b = document.querySelector<HTMLButtonElement>(sel);
						return !!b && b.getClientRects().length > 0 && !b.disabled;
					}, entree.valider);
					expect(reveille, 'critère 2 : le bouton de validation est redevenu actif').toBe(false);
				}

				// Critère 9 : « Écouter » et l'aide du geste restent activés.
				const chromeDesactive = await page.evaluate(
					({ scene }) =>
						[
							...(document
								.querySelector(scene)
								?.querySelectorAll<HTMLButtonElement>('.aide-btn, .consigne-tts, .item-tts') ?? []),
						]
							.filter((b) => b.disabled)
							.map((b) => b.className),
					{ scene: zone.scene },
				);
				expect(chromeDesactive, 'critère 9 : boutons Écouter / aide désactivés').toEqual([]);

				// Critère 9 (pointeur) : ce que le figeage épargne reste CLIQUABLE AU DOIGT. Le DOM
				// seul ne le dit pas : `.etay-lien` restait non cliquable parce que les feuilles
				// `.lecon-fige` / `.rev-stage--fige` ne lui rendaient pas le pointeur. On juge donc
				// le `pointer-events` CALCULÉ de chaque épargne présente et de ses descendants.
				// (Liste = `EPARGNES` de `src/ui/figeage.ts` ; les `.etay-lien` n'apparaissent que
				// quand la leçon a un étayage ET que la réponse est ratée ou révélée.)
				const bloques = await page.evaluate((epargnes) => {
					const fautifs: string[] = [];
					for (const racine of document.querySelectorAll(epargnes)) {
						for (const el of [racine, ...racine.querySelectorAll('*')]) {
							if (getComputedStyle(el).pointerEvents === 'none')
								fautifs.push(
									`${el.tagName.toLowerCase()} (dans ${racine.tagName.toLowerCase()}.${racine.getAttribute('class')})`,
								);
						}
					}
					return fautifs;
				}, EPARGNES);
				expect(
					bloques,
					'critère 9 : une épargne du figeage a `pointer-events: none` (non cliquable au doigt)',
				).toEqual([]);

				// Critère 9 : « Continuer » mène bien à la suite (la question répondue disparaît).
				await continuer.click();
				await expect(page.locator(zone.continuer)).toHaveCount(0);

				expect(errors).toEqual([]);
			});
		}
	}
}
