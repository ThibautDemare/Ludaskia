/* ============================================================
   #785 — Décor de Noël : la forêt de sapins enneigés (critères 35 à 39). Écrit AVANT
   l'implémentation, depuis `notes/commentaire-785-sapins.md`.

   Contrat : en décembre, `#homeForet` (accueil) et `#vitrineForet` (vitrine) chargent
   `foret-pied-noel.svg` (racine `svg.foret-svg.foret-noel`, chaque sapin dans un
   `<g class="sway">`) au lieu de `foret-pied.svg`. Le guide garde `foret-pied.svg` toute
   l'année. Les forêts sont injectées en asynchrone : on attend un `.sway` avant de compter.
   ============================================================ */
import { test, expect } from '@playwright/test';
import type { Page } from '@playwright/test';
import { watchErrors } from './helpers';
import {
	DATES,
	FUSEAU,
	basculerDecor,
	attendreEtat,
	ouvrirAccueil,
	ouvrirGuide,
	ouvrirVitrine,
} from './decor-aide';

test.use({ timezoneId: FUSEAU });

const FORETS = [
	{ nom: 'accueil', conteneur: '#homeForet', ouvrir: ouvrirAccueil },
	{ nom: 'vitrine', conteneur: '#vitrineForet', ouvrir: ouvrirVitrine },
] as const;

/* Attend que la forêt soit injectée (au moins 5 arbres), puis renvoie le nombre de `.sway`. */
async function compterArbres(page: Page, conteneur: string, selecteur = ''): Promise<number> {
	const arbres = page.locator(`${conteneur} svg${selecteur} .sway`);
	await expect(arbres.nth(4), `forêt injectée dans ${conteneur}${selecteur}`).toBeAttached();
	return arbres.count();
}

for (const f of FORETS) {
	test(`critère 35 : le 15 décembre, la forêt de ${f.nom} est faite de sapins`, async ({
		page,
	}) => {
		const errors = watchErrors(page);
		await f.ouvrir(page, DATES.noel);
		const sapins = page.locator(`${f.conteneur} svg.foret-noel .sway`);
		await expect(sapins.nth(5), `plus de 5 sapins dans ${f.conteneur}`).toBeAttached();
		await expect(page.locator(`${f.conteneur} svg.foret-noel`)).toHaveCount(1);
		expect(errors).toEqual([]);
	});

	for (const [quand, date] of [
		['30 novembre', DATES.veilleDecembre],
		['1er janvier', DATES.premierJanvier],
	] as const) {
		test(`critère 35 : le ${quand}, ${f.nom} : forêt habituelle, aucun sapin`, async ({ page }) => {
			const errors = watchErrors(page);
			await f.ouvrir(page, date);
			// Témoin : la forêt habituelle est bien là (sinon « pas de sapin » serait vide de sens).
			expect(
				await compterArbres(page, f.conteneur),
				'témoin : la forêt habituelle est là',
			).toBeGreaterThanOrEqual(5);
			await expect(page.locator('.foret-noel')).toHaveCount(0);
			expect(errors).toEqual([]);
		});
	}
}

test('critère 37 : le 15 décembre, le guide garde la forêt habituelle', async ({ page }) => {
	const errors = watchErrors(page);
	await ouvrirGuide(page, DATES.noel);
	expect(
		await compterArbres(page, '#guideForet'),
		'témoin : forêt habituelle',
	).toBeGreaterThanOrEqual(5);
	await expect(page.locator('.foret-noel')).toHaveCount(0);
	expect(errors).toEqual([]);
});

for (const f of FORETS) {
	test(`critère 36 : le 15 décembre, les sapins de ${f.nom} se balancent, et « Arrêter le décor » les fige`, async ({
		page,
	}) => {
		const errors = watchErrors(page);
		await f.ouvrir(page, DATES.noel);
		const sapins = page.locator(`${f.conteneur} svg.foret-noel .sway`);
		await expect(sapins.nth(5)).toBeAttached();
		const etats = () =>
			sapins.evaluateAll((els) =>
				els.map((e) => {
					const cs = getComputedStyle(e);
					return `${cs.animationName === 'none' ? 'immobile' : 'anime'}/${cs.animationPlayState}`;
				}),
			);

		// Sans réglage, ils bougent : un sapin immobile ne prouverait pas que le bouton agit.
		expect(
			(await etats()).every((e) => e === 'anime/running'),
			'les sapins sont animés et en cours',
		).toBe(true);

		await attendreEtat(page, 'bouge');
		await basculerDecor(page);
		await attendreEtat(page, 'fige');
		await expect.poll(async () => (await etats()).every((e) => e === 'anime/paused')).toBe(true);
		expect(errors).toEqual([]);
	});
}

/* ---------- Fichiers : critères 38 et 39 ---------- */

test('critère 38 : le SVG de Noël ne pèse pas plus lourd que celui de l’année', async ({
	page,
}) => {
	const [noel, annee] = await Promise.all([
		page.request.get('./foret-pied-noel.svg'),
		page.request.get('./foret-pied.svg'),
	]);
	expect(noel.ok(), 'foret-pied-noel.svg servi').toBe(true);
	expect(annee.ok(), 'foret-pied.svg servi').toBe(true);
	const [pn, pa] = [(await noel.body()).length, (await annee.body()).length];
	expect(pn, `Noël ${pn} o, année ${pa} o`).toBeLessThanOrEqual(pa);
});

/* Couleurs des fruits et étincelles de la forêt de l'année (tools/forest/generate-forest.mjs). */
const COULEURS_FRUITS = ['#d8392b', '#e2632a', '#e8a21d', '#e0b020', '#8a5bc0'];
const COULEUR_ETOILE = '#ffe9a0';

test('critère 39 : le SVG de Noël ne porte ni fruit ni étoile (témoin : ils sont dans celui de l’année)', async ({
	page,
}) => {
	const lire = async (nom: string) =>
		(await (await page.request.get(`./${nom}`)).text()).toLowerCase();
	const [noel, annee] = [await lire('foret-pied-noel.svg'), await lire('foret-pied.svg')];

	for (const c of [...COULEURS_FRUITS, COULEUR_ETOILE]) {
		expect(annee, `témoin : ${c} présent dans foret-pied.svg`).toContain(c);
		expect(noel, `${c} absent de foret-pied-noel.svg`).not.toContain(c);
	}
});
