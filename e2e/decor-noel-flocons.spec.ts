/* ============================================================
   #785 — Décor de Noël : les flocons de décembre (accueil de l'appli et vitrine).
   Écrit AVANT l'implémentation, depuis les critères de l'issue et le contrat DOM.

   Contrat : en décembre seulement, `#home` contient `.decor-saison[aria-hidden="true"]` avec
   10 `.decor-flocon` (le flocon porte la chute et l'opacité, son enfant
   `.decor-flocon-glyphe` est le dessin). Hors décembre : AUCUN `.decor-saison` dans le DOM.
   Vitrine : `.decor-saison` juste avant `.v-hero`. Guide : jamais (cf. `decor-guide.spec.ts`).

   Échantillonnage : les flocons sont animés en CSS, donc leur position dépend du moment de
   la mesure. Plutôt que d'attendre, `placerAuTemps` règle toutes les animations du décor sur
   un instant donné (« la page est ouverte depuis N secondes ») : mesures espacées, mais
   déterministes. Un « visible » = opacité effective > 0,05 ET dessin dans la vue.
   Largeurs : mobile (défaut du projet) ET tablette paysage, où la bande n'est pas au même
   endroit. Horloge : voir `decor-aide.ts`.
   ============================================================ */
import { test, expect } from '@playwright/test';
import type { Page } from '@playwright/test';
import { watchErrors, gotoHash } from './helpers';
import {
	DATES,
	FUSEAU,
	INSTANTS,
	VUES,
	laisserPasser,
	mesurerFlocons,
	ouvrirAccueil,
	ouvrirVitrine,
	placerAuTemps,
	recouvrements,
	attendreEtat,
	basculerDecor,
} from './decor-aide';

test.use({ timezoneId: FUSEAU });

const CLEAR_PIN = `localStorage.removeItem('ludaskia_encadrant_lock');`;

/* Éléments du décor réellement rendus (ni `display: none` ni ancêtre masqué). */
async function decorAffiche(page: Page): Promise<number> {
	return page.evaluate(
		() =>
			[...document.querySelectorAll<HTMLElement>('.decor-saison, .decor-flocon')].filter((e) =>
				e.checkVisibility(),
			).length,
	);
}

/* ---------- Présence selon la date (critères 10, 33, 34) ---------- */

test.describe('présence du décor selon la date', () => {
	const EN_PERIODE = [
		['15 décembre', DATES.noel],
		['1er décembre, 00 h 01', DATES.premierDecembre],
		['31 décembre, 23 h 59', DATES.finDecembre],
	] as const;
	const HORS_PERIODE = [
		['30 novembre', DATES.veilleDecembre],
		['30 novembre, 23 h 59', DATES.veilleDecembreTard],
		['1er janvier, 00 h 01', DATES.premierJanvier],
		['14 juillet', DATES.ete],
	] as const;

	for (const [nom, date] of EN_PERIODE) {
		test(`critère 10 : le ${nom}, l'accueil porte 10 flocons dans un décor masqué aux lecteurs d'écran`, async ({
			page,
		}) => {
			const errors = watchErrors(page);
			await ouvrirAccueil(page, date);
			const decor = page.locator('#home .decor-saison');
			await expect(decor).toHaveCount(1);
			await expect(decor).toHaveAttribute('aria-hidden', 'true');
			await expect(decor.locator('.decor-flocon')).toHaveCount(10);
			expect(errors).toEqual([]);
		});
	}

	for (const [nom, date] of HORS_PERIODE) {
		test(`critères 33, 34 : le ${nom}, aucun décor de saison sur l'accueil ni sur la vitrine`, async ({
			page,
		}) => {
			const errors = watchErrors(page);
			// TÉMOIN : le même appareil, le 15 décembre, porte bien le décor. Sans lui, « rien hors
			// période » serait vrai par simple absence de la fonctionnalité.
			await ouvrirAccueil(page, DATES.noel);
			await expect(page.locator('#home .decor-saison .decor-flocon')).toHaveCount(10);
			await ouvrirVitrine(page, DATES.noel);
			await expect(page.locator('.decor-saison .decor-flocon')).toHaveCount(10);

			await ouvrirAccueil(page, date);
			// Rien dans le DOM, pas seulement rien de visible.
			await expect(page.locator('.decor-saison')).toHaveCount(0);
			await expect(page.locator('.decor-flocon')).toHaveCount(0);

			await ouvrirVitrine(page, date);
			await expect(page.locator('.decor-saison')).toHaveCount(0);
			await expect(page.locator('.decor-flocon')).toHaveCount(0);
			expect(errors).toEqual([]);
		});
	}

	test('critère 10 (vitrine) : le 15 décembre, le décor est juste avant .v-hero, masqué aux lecteurs d’écran', async ({
		page,
	}) => {
		const errors = watchErrors(page);
		await ouvrirVitrine(page, DATES.noel);
		const decor = page.locator('.decor-saison');
		await expect(decor).toHaveCount(1);
		await expect(decor).toHaveAttribute('aria-hidden', 'true');
		await expect(decor.locator('.decor-flocon')).toHaveCount(10);
		await expect(page.locator('.v-hero').locator('xpath=preceding-sibling::*[1]')).toHaveClass(
			/decor-saison/,
		);
		expect(errors).toEqual([]);
	});
});

/* ---------- Rendu des flocons, par largeur ---------- */

for (const vue of VUES) {
	test.describe(`flocons — ${vue.nom}`, () => {
		if (vue.viewport) test.use({ viewport: { ...vue.viewport } });

		test('critère 12 : entre 6 et 10 flocons visibles à la fois, à plusieurs instants', async ({
			page,
		}) => {
			const errors = watchErrors(page);
			await ouvrirAccueil(page, DATES.noel);
			await expect(page.locator('.decor-flocon')).toHaveCount(10);

			const nb: number[] = [];
			for (const t of INSTANTS) {
				const animations = await placerAuTemps(page, t);
				expect(
					animations,
					'les flocons sont animés en CSS (une animation au moins chacun)',
				).toBeGreaterThanOrEqual(10);
				nb.push((await mesurerFlocons(page)).filter((f) => f.visible).length);
			}
			for (const [i, n] of nb.entries()) {
				expect(n, `à ${INSTANTS[i]} ms : ${nb.join(', ')}`).toBeGreaterThanOrEqual(6);
				expect(n, `à ${INSTANTS[i]} ms : ${nb.join(', ')}`).toBeLessThanOrEqual(10);
			}
			expect(errors).toEqual([]);
		});

		test('critère 13 : flocons dans le haut de la page (jamais sous la mi-hauteur du premier écran), hors vue après un défilement d’un écran', async ({
			page,
		}) => {
			const errors = watchErrors(page);
			await ouvrirAccueil(page, DATES.noel);
			await expect(page.locator('.decor-flocon')).toHaveCount(10);
			const hauteur = await page.evaluate(() => window.innerHeight);

			for (const t of INSTANTS) {
				await placerAuTemps(page, t);
				const visibles = (await mesurerFlocons(page)).filter((f) => f.visible);
				expect(visibles.length, 'au moins un flocon à voir').toBeGreaterThan(0);
				for (const f of visibles) {
					const milieuDessin = (f.haut + f.bas) / 2;
					expect(
						milieuDessin,
						`à ${t} ms : un flocon est dessiné sous la mi-hauteur (${hauteur / 2} px)`,
					).toBeLessThanOrEqual(hauteur / 2);
				}
			}

			// Défilement d'un écran : le décor appartient à la page, il s'en va avec le haut.
			await page.evaluate(() => window.scrollTo(0, window.innerHeight));
			expect(await page.evaluate(() => window.scrollY)).toBeGreaterThanOrEqual(hauteur - 1);
			for (const t of INSTANTS) {
				await placerAuTemps(page, t);
				const encoreVisibles = (await mesurerFlocons(page)).filter((f) => f.visible);
				expect(encoreVisibles, `à ${t} ms, après défilement`).toEqual([]);
			}
			expect(errors).toEqual([]);
		});

		test('critère 14 : aucun flocon visible ne recouvre un texte, un bouton, un lien ou un champ (accueil)', async ({
			page,
		}) => {
			const errors = watchErrors(page);
			await ouvrirAccueil(page, DATES.noel);
			await expect(page.locator('.decor-flocon')).toHaveCount(10); // témoin : il y a des flocons à vérifier
			let vus = 0;
			for (const t of INSTANTS) {
				await placerAuTemps(page, t);
				vus += (await mesurerFlocons(page)).filter((f) => f.visible).length;
				const gene = await recouvrements(page);
				expect(gene, `à ${t} ms : ${JSON.stringify(gene)}`).toEqual([]);
			}
			expect(vus, 'témoin : des flocons visibles ont bien été comparés au texte').toBeGreaterThan(
				0,
			);
			expect(errors).toEqual([]);
		});

		test('critère 14 (vitrine) : aucun flocon visible ne recouvre un texte ni une commande', async ({
			page,
		}) => {
			const errors = watchErrors(page);
			await ouvrirVitrine(page, DATES.noel);
			let vus = 0;
			for (const t of INSTANTS) {
				expect(await placerAuTemps(page, t)).toBeGreaterThanOrEqual(10);
				vus += (await mesurerFlocons(page)).filter((f) => f.visible).length;
				const gene = await recouvrements(page);
				expect(gene, `à ${t} ms : ${JSON.stringify(gene)}`).toEqual([]);
			}
			expect(vus, 'témoin : des flocons visibles ont bien été comparés au texte').toBeGreaterThan(
				0,
			);
			expect(errors).toEqual([]);
		});

		test("critère 30 : un appui sur un flocon atteint l'élément dessous ; le décor est aria-hidden", async ({
			page,
		}) => {
			const errors = watchErrors(page);
			await ouvrirAccueil(page, DATES.noel);
			await expect(page.locator('#home .decor-saison')).toHaveAttribute('aria-hidden', 'true');

			let testes = 0;
			for (const t of INSTANTS) {
				await placerAuTemps(page, t);
				const dansLeDecor = await page.evaluate(() => {
					const fautifs: string[] = [];
					for (const g of document.querySelectorAll<HTMLElement>(
						'.decor-saison .decor-flocon-glyphe',
					)) {
						const r = g.getBoundingClientRect();
						const x = r.left + r.width / 2;
						const y = r.top + r.height / 2;
						if (x < 0 || y < 0 || x > innerWidth || y > innerHeight) continue;
						const dessus = document.elementFromPoint(x, y);
						if (dessus?.closest('.decor-saison')) fautifs.push(dessus.className.toString());
					}
					return fautifs;
				});
				expect(dansLeDecor, `à ${t} ms : le doigt tomberait sur un flocon`).toEqual([]);
				testes += (await mesurerFlocons(page)).filter((f) => f.visible).length;
			}
			// Témoin : le test a bien regardé des flocons visibles (sinon il serait vide).
			expect(testes).toBeGreaterThan(0);
			expect(errors).toEqual([]);
		});

		test('critères 1, 16 : le bouton fige les flocons — plus aucun mouvement entre deux instants, ils restent visibles', async ({
			page,
		}) => {
			const errors = watchErrors(page);
			await ouvrirAccueil(page, DATES.noel);
			await expect(page.locator('.decor-flocon')).toHaveCount(10);
			// Un instant où les flocons sont bien lancés.
			await placerAuTemps(page, INSTANTS[3], false);

			const positions = async () =>
				(await mesurerFlocons(page)).map((f) => [Math.round(f.gauche), Math.round(f.haut)]);

			// Témoin : décor vivant, ça bouge (sinon « immobile » ne prouverait rien).
			const avant = await positions();
			await laisserPasser(page, 600);
			expect(
				await positions(),
				'témoin : les flocons doivent bouger tant que le décor tourne',
			).not.toEqual(avant);

			await basculerDecor(page);
			await attendreEtat(page, 'fige');
			await expect
				.poll(() =>
					page.evaluate(() =>
						[...document.querySelectorAll('.decor-flocon')].map(
							(el) => getComputedStyle(el).animationPlayState,
						),
					),
				)
				.toEqual(Array(10).fill('paused'));

			const t1 = await positions();
			await laisserPasser(page, 600);
			const t2 = await positions();
			expect(t2, 'figé : positions identiques à deux instants').toEqual(t1);

			// Figé ne veut pas dire disparu. Le clic a fait défiler jusqu'au pied de page : on
			// remonte en haut avant de regarder la bande (sinon « hors vue » ≠ « disparu »).
			await page.evaluate(() => window.scrollTo(0, 0));
			const visibles = (await mesurerFlocons(page)).filter((f) => f.visible);
			expect(visibles.length, 'les flocons restent visibles une fois figés').toBeGreaterThanOrEqual(
				6,
			);
			expect(errors).toEqual([]);
		});

		test('critère 16 (case) : la case « Figer le décor » des Préférences fige les flocons, qui restent visibles', async ({
			page,
		}) => {
			const errors = watchErrors(page);
			await ouvrirAccueil(page, DATES.noel);
			await expect(page.locator('.decor-flocon')).toHaveCount(10);

			await gotoHash(page, 'profils');
			await page.locator('#prefDecor').check();
			await expect(page.locator('#prefDecor')).toBeChecked();
			await gotoHash(page, 'accueil');
			await expect(page.locator('#home .decor-flocon')).toHaveCount(10);
			await attendreEtat(page, 'fige'); // le bouton du pied de page suit la case
			await expect
				.poll(() =>
					page.evaluate(() =>
						[...document.querySelectorAll('.decor-flocon')].map(
							(el) => getComputedStyle(el).animationPlayState,
						),
					),
				)
				.toEqual(Array(10).fill('paused'));

			await page.evaluate(() => window.scrollTo(0, 0));
			await placerAuTemps(page, INSTANTS[3], false);
			const positions = async () =>
				(await mesurerFlocons(page)).map((f) => [Math.round(f.gauche), Math.round(f.haut)]);
			const t1 = await positions();
			await laisserPasser(page, 600);
			expect(await positions(), 'figé par la case : positions identiques').toEqual(t1);
			const visibles = (await mesurerFlocons(page)).filter((f) => f.visible);
			expect(visibles.length, 'les flocons restent visibles').toBeGreaterThanOrEqual(6);
			expect(errors).toEqual([]);
		});
	});
}

/* ---------- Critère 31 : aucun rappel ni compte à rebours lié à la saison ---------- */

const RAPPEL = /plus que \d|il reste \d|encore \d+ jours?|avant la fin de décembre/i;

test('critère 31 : le 15 décembre, ni l’accueil ni la galerie des trophées ne rappellent ou ne décomptent la saison', async ({
	page,
}) => {
	const errors = watchErrors(page);
	await ouvrirAccueil(page, DATES.noel);
	const texte = async () => await page.evaluate(() => document.body.innerText);
	const accueil = await texte();
	// Témoin : c'est bien le texte de l'accueil, avec le décor présent.
	expect(accueil).toContain((await page.locator('#home h1, #home h2').first().innerText()).trim());
	await expect(page.locator('#home .decor-flocon')).toHaveCount(10);
	expect(accueil).not.toMatch(RAPPEL);

	await page.locator('[data-act="open-trophees"]').click();
	await expect(page.locator('#trophees')).toBeVisible();
	await page.locator('#tropheesContent .trophy').first().waitFor();
	const galerie = await page.locator('#trophees').innerText();
	expect(galerie, 'témoin : la galerie contient bien les trophées de Noël').toContain(
		(await page.locator('[data-trophy-id="noel1"] .trophy-title').innerText()).trim(),
	);
	expect(galerie).not.toMatch(RAPPEL);
	expect(errors).toEqual([]);
});

/* ---------- Le décor n'existe que sur l'accueil et à l'écran (critère 29) ---------- */

test('critère 29 : aucun décor de saison sur les autres écrans (profils, encadrant, leçon)', async ({
	page,
}) => {
	const errors = watchErrors(page);
	await page.addInitScript(CLEAR_PIN);
	await ouvrirAccueil(page, DATES.noel);
	expect(await decorAffiche(page), 'témoin : le décor est bien là sur l’accueil').toBeGreaterThan(
		0,
	);

	await gotoHash(page, 'profils');
	await expect(page.locator('#profils')).toBeVisible();
	expect(await decorAffiche(page), 'écran Profils').toBe(0);

	await gotoHash(page, 'encadrant/reglages');
	await expect(page.locator('select[data-act="set-revision-plafond"]')).toBeVisible();
	expect(await decorAffiche(page), 'espace encadrants').toBe(0);

	await gotoHash(page, 'lecon-geo-angles');
	await expect(page.locator('body')).toHaveClass(/session-active/);
	expect(await decorAffiche(page), 'une leçon').toBe(0);

	expect(errors).toEqual([]);
});

test("critère 29 : aucun décor de saison à l'impression de l'accueil", async ({ page }) => {
	const errors = watchErrors(page);
	await ouvrirAccueil(page, DATES.noel);
	expect(await decorAffiche(page), 'témoin : visible à l’écran').toBeGreaterThan(0);

	await page.emulateMedia({ media: 'print' });
	expect(await decorAffiche(page), 'à l’impression').toBe(0);

	await page.emulateMedia({ media: 'screen' });
	expect(await decorAffiche(page), 'témoin : de retour à l’écran').toBeGreaterThan(0);
	expect(errors).toEqual([]);
});
