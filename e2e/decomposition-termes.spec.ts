/* ============================================================
   Décomposition multiplicative CM1 (`num-decompose-multiplicative`) — retour
   terrain de novembre 2026 : « 6 × » en fin de ligne et « 10 000 » au début de la
   suivante, des tailles de chiffres inégales, un bouton d'étayage qui mord sur la
   consigne, un grand nombre tronqué dans son champ.
   Markup : `.decompo` (un bloc par item), `.decompo-cible` (nombre à décomposer,
   absent en sens « composer » : `.decompo--composer`), `.decompo-terme` (insécable).

   Critères couverts :
   - (a) aucun terme n'est coupé, sur tablette ET sur viewport étroit ;
   - (b) une seule taille de chiffres : un `.bignum` a la taille de son terme ;
   - (c) le bouton d'étayage ne chevauche pas la consigne ;
   - (d) interaction clé : bonnes réponses validées ;
   - (e) en sens « composer », la valeur complète tient dans le champ.
   ============================================================ */
import { test, expect, type Page } from '@playwright/test';
import { watchErrors, gotoHash, seedAideVue } from './helpers';

const SEED_CM1 = `localStorage.setItem('ludaskia_profiles', JSON.stringify({ list: [{ uuid: 'e2e', name: 'E2E', emoji: '\\uD83E\\uDD8A', updatedAt: 1, niveauReference: 'cm1' }], active: 'e2e' }));`;
const HASH = 'lecon-num-decompose-multiplicative';

test.beforeEach(async ({ page }) => {
	await seedAideVue(page);
	await page.addInitScript(SEED_CM1);
});

async function ouvrir(page: Page, largeur: number): Promise<void> {
	await page.setViewportSize({ width: largeur, height: 900 });
	await gotoHash(page, HASH);
	await page.locator('.decompo-terme').first().waitFor();
}

for (const [nom, largeur] of [
	['tablette', 820],
	['viewport étroit', 390],
] as const) {
	test(`(a)(b)(c) ${nom} : termes sur une ligne, une seule taille, étayage hors consigne`, async ({
		page,
	}) => {
		const errors = watchErrors(page);
		await ouvrir(page, largeur);

		const mesures = await page.evaluate(() => {
			const termes = [...document.querySelectorAll<HTMLElement>('.decompo-terme')];
			const hauteurs = termes.map((t) => t.getBoundingClientRect().height);
			const tailles = [...document.querySelectorAll<HTMLElement>('.decompo-terme .bignum')].map(
				(b) => [
					getComputedStyle(b).fontSize,
					getComputedStyle(b.closest('.decompo-terme')!).fontSize,
				],
			);
			const btn = document.querySelector('.etayage-btn')?.getBoundingClientRect();
			const cons = document.querySelector('.consigne-line')?.getBoundingClientRect();
			return {
				hauteurs,
				tailles,
				btn: btn && { t: btn.top, b: btn.bottom, l: btn.left, r: btn.right },
				cons: cons && { t: cons.top, b: cons.bottom, l: cons.left, r: cons.right },
			};
		});

		// (a) Un terme coupé fait au moins deux fois la hauteur d'une ligne : on compare à
		// la plus petite (un terme à champ est un peu plus haut, jamais 1,6 fois).
		expect(mesures.hauteurs.length).toBeGreaterThan(0);
		const plusPetite = Math.min(...mesures.hauteurs);
		for (const h of mesures.hauteurs) expect(h).toBeLessThan(plusPetite * 1.6);

		// (b) Le chiffre du terme n'est pas plus grand ni plus petit que le terme lui-même.
		expect(mesures.tailles.length).toBeGreaterThan(0);
		for (const [bignum, terme] of mesures.tailles) expect(bignum).toBe(terme);

		// (c) Boîtes englobantes disjointes (en vertical ou en horizontal).
		expect(mesures.btn).toBeTruthy();
		expect(mesures.cons).toBeTruthy();
		const b = mesures.btn!;
		const c = mesures.cons!;
		const disjoints = b.b <= c.t || c.b <= b.t || b.r <= c.l || c.r <= b.l;
		expect(disjoints, `bouton ${JSON.stringify(b)} vs consigne ${JSON.stringify(c)}`).toBe(true);

		expect(errors).toEqual([]);
	});
}

test('(d) remplir chaque champ avec son data-answer : autant de .mark.correct que de champs', async ({
	page,
}) => {
	const errors = watchErrors(page);
	await ouvrir(page, 820);
	const champs = page.locator('.decompo input.ans');
	await champs.first().waitFor();
	const n = await champs.count();
	expect(n).toBeGreaterThan(0);
	for (let i = 0; i < n; i++) {
		const bonne = await champs.nth(i).getAttribute('data-answer');
		expect(bonne).not.toBeNull();
		await champs.nth(i).fill(bonne ?? '');
	}
	await page.locator('#btnVerify').click();
	await expect(page.locator('.mark.correct')).toHaveCount(n);
	expect(errors).toEqual([]);
});

test('(e) sens « composer » : la valeur complète tient dans le champ', async ({ page }) => {
	const errors = watchErrors(page);
	await ouvrir(page, 390);
	// Le sens est tiré : on relance la fiche jusqu'à en trouver un (borne explicite).
	for (let essai = 0; essai < 15; essai++) {
		if ((await page.locator('.decompo--composer').count()) > 0) break;
		await gotoHash(page, HASH);
		await page.locator('.decompo-terme').first().waitFor();
	}
	const champ = page.locator('.decompo--composer input.ans').first();
	await expect(champ, 'aucun item « composer » en 15 tirages').toBeVisible();
	const bonne = ((await champ.getAttribute('data-answer')) ?? '').replace(/\D/g, '');
	expect(bonne.length).toBeGreaterThanOrEqual(2);
	await champ.focus();
	await champ.pressSequentially(bonne);
	const tient = await champ.evaluate(
		(el) => (el as HTMLInputElement).scrollWidth <= el.clientWidth,
	);
	expect(tient, `« ${await champ.inputValue()} » déborde du champ`).toBe(true);
	expect(errors).toEqual([]);
});
