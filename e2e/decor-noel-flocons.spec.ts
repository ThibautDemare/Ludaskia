/* ============================================================
   #785 — Décor de Noël : les flocons de décembre (accueil de l'appli et vitrine).
   Écrit AVANT l'implémentation, depuis les critères de l'issue et le contrat DOM.

   Contrat : en décembre seulement, `#home` contient `.decor-saison[aria-hidden="true"]` avec
   `FLOCONS.length` `.decor-flocon` (le flocon porte la chute et l'opacité, son enfant
   `.decor-flocon-glyphe` est le dessin). Hors décembre : AUCUN `.decor-saison` dans le DOM.
   Vitrine : `.decor-saison` juste avant `.v-hero`. Guide : jamais (cf. `decor-guide.spec.ts`).

   Échantillonnage : les flocons sont animés en CSS, donc leur position dépend du moment de
   la mesure. Plutôt que d'attendre, `placerAuTemps` règle toutes les animations du décor sur
   un instant donné (« la page est ouverte depuis N secondes ») : mesures espacées, mais
   déterministes. Un « visible » = opacité effective > 0,05 ET dessin dans la vue.
   Largeurs : mobile (défaut du projet) ET tablette paysage, où la mise en page de l'accueil
   diffère. Horloge : voir `decor-aide.ts`.
   ============================================================ */
import { test, expect } from '@playwright/test';
import type { Page } from '@playwright/test';
import { watchErrors, gotoHash } from './helpers';
import { FLOCONS } from '../src/core/decor-saison';
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
	pileDesFlocons,
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

/* Critère 13 : à l'un des instants au moins, un flocon visible a le centre de son dessin sous
   la mi-hauteur de l'écran ; après un défilement d'un écran, des flocons sont encore visibles.
   La page doit vraiment défiler, sinon le second volet ne prouve rien. */
async function verifierToutEcran(page: Page): Promise<void> {
	const hauteur = await page.evaluate(() => window.innerHeight);
	let dansLaMoitieBasse = 0;
	for (const t of INSTANTS) {
		await placerAuTemps(page, t);
		for (const f of (await mesurerFlocons(page)).filter((x) => x.visible)) {
			if ((f.haut + f.bas) / 2 > hauteur / 2) dansLaMoitieBasse++;
		}
	}
	expect(
		dansLaMoitieBasse,
		`aucun flocon visible sous la mi-hauteur (${hauteur / 2} px) aux ${INSTANTS.length} instants`,
	).toBeGreaterThan(0);

	await page.evaluate(() => window.scrollTo(0, window.innerHeight));
	expect(
		await page.evaluate(() => window.scrollY),
		'la page défile d’un écran (sinon le test ne prouve rien)',
	).toBeGreaterThanOrEqual(hauteur - 1);
	for (const t of INSTANTS) {
		await placerAuTemps(page, t);
		const encore = (await mesurerFlocons(page)).filter((f) => f.visible).length;
		expect(encore, `à ${t} ms, après défilement : des flocons restent dans la vue`).toBeGreaterThan(
			0,
		);
	}
}

/* Critère 14 : là où un flocon visible chevauche un texte, une commande ou une carte, il est
   SOUS lui dans la pile de peinture. TÉMOIN : à un instant au moins, un flocon est réellement
   vu (rien d'opaque au-dessus de son centre), sinon « jamais par-dessus » serait vrai d'une
   couche enfouie sous un conteneur opaque. */
async function verifierDerriere(page: Page): Promise<void> {
	let vus = 0;
	for (const t of INSTANTS) {
		await placerAuTemps(page, t);
		const pile = await pileDesFlocons(page);
		vus += pile.vus;
		expect(pile.fautes, `à ${t} ms : un flocon est peint au-dessus du contenu`).toEqual([]);
	}
	expect(
		vus,
		'témoin : au moins un flocon est vu (aucun fond opaque au-dessus de son centre)',
	).toBeGreaterThan(0);
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
		test(`critère 10 : le ${nom}, l'accueil porte tous ses flocons dans un décor masqué aux lecteurs d'écran`, async ({
			page,
		}) => {
			const errors = watchErrors(page);
			await ouvrirAccueil(page, date);
			const decor = page.locator('#home .decor-saison');
			await expect(decor).toHaveCount(1);
			await expect(decor).toHaveAttribute('aria-hidden', 'true');
			await expect(decor.locator('.decor-flocon')).toHaveCount(FLOCONS.length);
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
			await expect(page.locator('#home .decor-saison .decor-flocon')).toHaveCount(FLOCONS.length);
			await ouvrirVitrine(page, DATES.noel);
			await expect(page.locator('.decor-saison .decor-flocon')).toHaveCount(FLOCONS.length);

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
		await expect(decor.locator('.decor-flocon')).toHaveCount(FLOCONS.length);
		await expect(page.locator('.v-hero').locator('xpath=preceding-sibling::*[1]')).toHaveClass(
			/decor-saison/,
		);
		expect(errors).toEqual([]);
	});

	/* Critère 10 (couleurs forcées) : le navigateur peindrait les flocons de la couleur du texte,
	   qui effacerait un mot de même couleur. On teste le RENDU (`checkVisibility`), pas la
	   présence dans le DOM : le décor peut y rester. */
	const flocons = (page: Page) =>
		page.evaluate(
			() =>
				[...document.querySelectorAll<HTMLElement>('.decor-flocon')].filter((e) =>
					e.checkVisibility(),
				).length,
		);
	const ECRANS = [
		['accueil', ouvrirAccueil],
		['vitrine', ouvrirVitrine],
	] as const;
	for (const [nom, ouvrir] of ECRANS) {
		test(`critère 10 (couleurs forcées, ${nom}) : le 15 décembre, aucun flocon n’est affiché`, async ({
			page,
		}) => {
			const errors = watchErrors(page);
			// TÉMOIN : sans couleurs forcées, tous les flocons sont affichés (sinon le test passerait
			// aussi sans aucun décor).
			await page.emulateMedia({ forcedColors: 'none' });
			await ouvrir(page, DATES.noel);
			await expect(page.locator('.decor-flocon')).toHaveCount(FLOCONS.length);
			expect(await flocons(page), 'témoin : tous les flocons affichés hors couleurs forcées').toBe(
				FLOCONS.length,
			);

			await page.emulateMedia({ forcedColors: 'active' });
			await ouvrir(page, DATES.noel);
			expect(
				await page.evaluate(() => matchMedia('(forced-colors: active)').matches),
				'les couleurs forcées sont bien actives',
			).toBe(true);
			expect(await flocons(page), 'couleurs forcées : aucun flocon rendu').toBe(0);
			expect(errors).toEqual([]);
		});
	}
});

/* ---------- Rendu des flocons, par largeur ---------- */

for (const vue of VUES) {
	test.describe(`flocons — ${vue.nom}`, () => {
		if (vue.viewport) test.use({ viewport: { ...vue.viewport } });

		test('critère 12 : au moins 6 visibles, au plus 11 hors lointains, au plus 5 lointains, à plusieurs instants', async ({
			page,
		}) => {
			const errors = watchErrors(page);
			await ouvrirAccueil(page, DATES.noel);
			await expect(page.locator('.decor-flocon')).toHaveCount(FLOCONS.length);

			const mesures: { total: number; saillants: number; loin: number }[] = [];
			for (const t of INSTANTS) {
				const animations = await placerAuTemps(page, t);
				expect(
					animations,
					'les flocons sont animés en CSS (une animation au moins chacun)',
				).toBeGreaterThanOrEqual(FLOCONS.length);
				const visibles = (await mesurerFlocons(page)).filter((f) => f.visible);
				const loin = visibles.filter((f) => f.plan === 'loin').length;
				mesures.push({ total: visibles.length, saillants: visibles.length - loin, loin });
			}
			const resume = JSON.stringify(mesures);
			for (const [i, m] of mesures.entries()) {
				const ctx = `à ${INSTANTS[i]} ms : ${resume}`;
				expect(m.total, ctx).toBeGreaterThanOrEqual(6);
				expect(m.saillants, ctx).toBeLessThanOrEqual(11);
				expect(m.loin, ctx).toBeLessThanOrEqual(5);
			}
			expect(errors).toEqual([]);
		});

		test('critère 12 (garde) : chaque flocon porte exactement un plan, et le DOM suit la répartition de FLOCONS', async ({
			page,
		}) => {
			const errors = watchErrors(page);
			await ouvrirAccueil(page, DATES.noel);
			await expect(page.locator('.decor-flocon')).toHaveCount(FLOCONS.length);
			const plansDom = await page.evaluate(() =>
				[...document.querySelectorAll('.decor-saison .decor-flocon')].map(
					(f) =>
						[...f.classList].filter((c) =>
							['loin', 'milieu', 'devant', 'premier-plan'].some((p) => c === `decor-flocon--${p}`),
						).length,
				),
			);
			expect(plansDom, 'chaque flocon porte exactement une classe de plan').toEqual(
				Array(FLOCONS.length).fill(1),
			);
			const mesures = await mesurerFlocons(page);
			for (const p of ['loin', 'milieu', 'devant', 'premier-plan'] as const) {
				expect(
					mesures.filter((f) => f.plan === p).length,
					`flocons du plan « ${p} » dans le DOM`,
				).toBe(FLOCONS.filter((f) => f.plan === p).length);
			}
			expect(errors).toEqual([]);
		});

		test('critère 13 : flocons sur toute la hauteur de l’écran (dont la moitié basse), encore là après un défilement d’un écran', async ({
			page,
		}) => {
			const errors = watchErrors(page);
			await ouvrirAccueil(page, DATES.noel);
			await expect(page.locator('.decor-flocon')).toHaveCount(FLOCONS.length);
			await verifierToutEcran(page);
			expect(errors).toEqual([]);
		});

		test('critère 13 (vitrine) : flocons sur toute la hauteur de l’écran, encore là après un défilement d’un écran', async ({
			page,
		}) => {
			const errors = watchErrors(page);
			await ouvrirVitrine(page, DATES.noel);
			await expect(page.locator('.decor-flocon')).toHaveCount(FLOCONS.length);
			await verifierToutEcran(page);
			expect(errors).toEqual([]);
		});

		test('critère 14 : les flocons passent derrière le contenu, jamais par-dessus un texte, une commande ou une carte (accueil)', async ({
			page,
		}) => {
			const errors = watchErrors(page);
			await ouvrirAccueil(page, DATES.noel);
			await expect(page.locator('.decor-flocon')).toHaveCount(FLOCONS.length);
			await verifierDerriere(page);
			expect(errors).toEqual([]);
		});

		test('critère 14 (vitrine) : les flocons passent derrière le contenu, jamais par-dessus un texte, une commande ou une carte', async ({
			page,
		}) => {
			const errors = watchErrors(page);
			await ouvrirVitrine(page, DATES.noel);
			await expect(page.locator('.decor-flocon')).toHaveCount(FLOCONS.length);
			await verifierDerriere(page);
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
			await expect(page.locator('.decor-flocon')).toHaveCount(FLOCONS.length);
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
				.toEqual(Array(FLOCONS.length).fill('paused'));

			const t1 = await positions();
			await laisserPasser(page, 600);
			const t2 = await positions();
			expect(t2, 'figé : positions identiques à deux instants').toEqual(t1);

			// Figé ne veut pas dire disparu. Le clic a fait défiler jusqu'au pied de page : on
			// remonte en haut avant de regarder les flocons (sinon « hors vue » ≠ « disparu »).
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
			await expect(page.locator('.decor-flocon')).toHaveCount(FLOCONS.length);

			await gotoHash(page, 'profils');
			await page.locator('#prefDecor').check();
			await expect(page.locator('#prefDecor')).toBeChecked();
			await gotoHash(page, 'accueil');
			await expect(page.locator('#home .decor-flocon')).toHaveCount(FLOCONS.length);
			await attendreEtat(page, 'fige'); // le bouton du pied de page suit la case
			await expect
				.poll(() =>
					page.evaluate(() =>
						[...document.querySelectorAll('.decor-flocon')].map(
							(el) => getComputedStyle(el).animationPlayState,
						),
					),
				)
				.toEqual(Array(FLOCONS.length).fill('paused'));

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
	await expect(page.locator('#home .decor-flocon')).toHaveCount(FLOCONS.length);
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
