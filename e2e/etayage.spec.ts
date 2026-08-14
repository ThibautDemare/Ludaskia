/* ============================================================
   Étayage de la NOTION (#490) — smoke tests.
   Pilote : le calcul posé — les trois seules leçons du catalogue à porter un
   contenu d'étayage à ce stade ; on en exerce deux (addition, et soustraction
   pour son prérequis). On ne teste PAS le libellé des phrases (Vitest, et ça bougera),
   seulement la MÉCANIQUE : ouverture par chacun des points d'entrée, remplissage
   pas à pas de la grille de démonstration, mise de côté du prérequis, mémoire
   de l'avant-série, et un minimum d'accessibilité (Échap + focus).
   ============================================================ */
import { test, expect, type Page } from '@playwright/test';
import { watchErrors, gotoHash } from './helpers';

/* Nombre de cellules-cible (`[data-cible]`) déjà écrites dans le panneau ouvert,
   c-à-d celles dont la démonstration a déjà rempli le chiffre. Une seule par pas
   (contrairement à la case de retenue, qui n'existe pas à chaque colonne) : c'est
   donc le compteur robuste, indépendant de l'opération tirée au hasard. */
async function cellesRemplies(page: Page): Promise<number> {
	return page
		.locator('#etayageOverlay [data-cible]')
		.evaluateAll((els) => els.filter((el) => (el.textContent ?? '').trim() !== '').length);
}

/* Lit « Étape i sur n » dans le compteur du panneau. */
async function etape(page: Page): Promise<{ i: number; n: number }> {
	const txt = (await page.locator('#etayCompteur').textContent()) ?? '';
	const m = txt.match(/Étape (\d+) sur (\d+)/);
	if (!m) throw new Error(`Compteur d'étapes illisible : "${txt}"`);
	return { i: Number(m[1]), n: Number(m[2]) };
}

/* ================================================================
   1. Chemin principal : lien proposé après une grille ratée, panneau sur
      L'OPÉRATION RATÉE, déroulé pas à pas, sortie.
   ================================================================ */

test('addition posée : lien « Comprendre ce calcul » sous la grille ratée, pas sous une grille juste', async ({
	page,
}) => {
	const errors = watchErrors(page);
	await gotoHash(page, 'lecon-calc-addition-posee');
	const grilles = page.locator('.posee');
	const n = await grilles.count();
	expect(n).toBeGreaterThan(1); // il faut au moins une grille ratée ET une grille juste

	// Toutes les grilles remplies JUSTE avec leur data-answer…
	for (let g = 0; g < n; g++) {
		const cells = grilles.nth(g).locator('.posee-input');
		const c = await cells.count();
		for (let i = 0; i < c; i++) {
			const cell = cells.nth(i);
			await cell.fill((await cell.getAttribute('data-answer')) ?? '');
		}
	}
	// …sauf la toute première cellule de la 1re grille, faussée volontairement.
	const premiereCellule = grilles.first().locator('.posee-input').first();
	const bonne = Number((await premiereCellule.getAttribute('data-answer')) ?? '0');
	await premiereCellule.fill(String((bonne + 1) % 10));

	await page.locator('#btnVerify').click();
	// Un quasi-sans-faute peut déclencher la modale de niveau (puis célébration) :
	// la fermer avant d'aller plus loin, sinon elle intercepte les clics (#484-like).
	for (const ok of ['#levelupOk', '#celebrateOk']) {
		const btn = page.locator(ok);
		if (await btn.isVisible().catch(() => false)) await btn.click();
	}

	// Le lien n'apparaît qu'après la grille ratée, jamais après une grille juste.
	await expect(page.locator('.etay-lien-posee')).toHaveCount(1);
	await expect(page.locator('.posee:has(.posee-input.wrong) + .etay-lien-posee')).toHaveCount(1);
	await expect(page.locator('.posee:not(:has(.posee-input.wrong)) + .etay-lien-posee')).toHaveCount(
		0,
	);

	// L'opération de la grille ratée (attributs posés par poseeGrilleHTML), pour
	// vérifier ensuite que le panneau s'ouvre bien SUR CELLE-LÀ.
	const grilleRatee = page.locator('.posee:has(.posee-input.wrong)');
	const a = await grilleRatee.getAttribute('data-pose-a');
	const b = await grilleRatee.getAttribute('data-pose-b');

	await page.locator('.etay-lien-posee button').click();
	await expect(page.locator('#etayageOverlay')).toBeVisible();
	// Le titre EST l'opération ratée (addition : signe '+' sans ambiguïté typographique).
	await expect(page.locator('#etayTitle')).toHaveText(`${a} + ${b}`);

	// 1er pas : une seule cellule-cible écrite, compteur à « Étape 1 sur n ».
	expect(await cellesRemplies(page)).toBe(1);
	let e = await etape(page);
	expect(e.i).toBe(1);

	// La grille de démonstration se remplit strictement à chaque pas, le compteur avance.
	let rempli = 1;
	for (let pas = 1; pas < e.n; pas++) {
		await page.locator('#etaySuivant').click();
		const now = await cellesRemplies(page);
		expect(now).toBeGreaterThan(rempli);
		rempli = now;
		e = await etape(page);
		expect(e.i).toBe(pas + 1);
	}

	// Dernier pas : le bouton devient la sortie, et il ferme le panneau.
	await expect(page.locator('#etaySuivant')).toHaveText("D'accord, à moi de jouer !");
	await page.locator('#etaySuivant').click();
	await expect(page.locator('#etayageOverlay')).toHaveCount(0);

	expect(errors).toEqual([]);
});

/* ================================================================
   2. Bouton persistant de l'en-tête : ouvre le même panneau, sans erreur.
   ================================================================ */

test('addition posée : le bouton persistant de l’en-tête ouvre le panneau sur l’exemple de la leçon', async ({
	page,
}) => {
	const errors = watchErrors(page);
	await gotoHash(page, 'lecon-calc-addition-posee');
	const btn = page.locator('.etayage-btn');
	await expect(btn).toBeVisible();

	await btn.click();
	await expect(page.locator('#etayageOverlay')).toBeVisible();
	// Sans erreur préalable : exemple canonique de la leçon (data/maths/posee.ts).
	await expect(page.locator('#etayTitle')).toHaveText('347 + 285');

	await page.locator('.aide-close').click();
	await expect(page.locator('#etayageOverlay')).toHaveCount(0);

	expect(errors).toEqual([]);
});

/* ================================================================
   3. Exemple d'avant-série : ouverture AUTOMATIQUE sur un report échu,
      fermeture d'un geste, jamais deux fois pour le même épisode.
   ================================================================ */

/* État de report ÉCHU (`reprendreLe` déjà passé) avec moins de blocages que
   BLOCAGES_SIGNAL_ADULTE (3) : c'est la condition de `episodeEtayable`
   (core/etayage.ts). Namespacé comme dans lecon-du-jour.spec.ts. */
const SEED_REPORT_ECHU = `(() => {
	const now = Date.now();
	const day = 24 * 60 * 60 * 1000;
	const reports = { 'calc-addition-posee@ce2': {
		jours: 2, dernierJour: '', reporteLe: now - 3 * day,
		reprendreLe: now - 1000, meilleurPct: 40,
	} };
	localStorage.setItem('e2e/ludaskia_leconReport', JSON.stringify(reports));
})();`;

test('addition posée : l’exemple d’avant-série s’ouvre seul sur un report échu, et ne revient pas au lancement suivant', async ({
	page,
}) => {
	const errors = watchErrors(page);
	await page.addInitScript(SEED_REPORT_ECHU);
	await gotoHash(page, 'lecon-calc-addition-posee');

	// Ouverture AUTOMATIQUE, sans le moindre clic.
	await expect(page.locator('#etayageOverlay')).toBeVisible();
	await expect(page.locator('.mascotte-bulle')).toHaveText('Un petit rappel avant de commencer.');
	// Offre de partir tout de suite (jamais un péage) : bouton dédié.
	await expect(page.locator('#etayFiler')).toBeVisible();

	// Le panneau s'écarte d'un geste.
	await page.locator('#etayFiler').click();
	await expect(page.locator('#etayageOverlay')).toHaveCount(0);

	// Relancer la leçon (nouvelle navigation) ne redonne PAS l'exemple : l'épisode
	// est déjà marqué vu (ludaskia_etayageVu), le bouton persistant reste, lui.
	await gotoHash(page, 'lecon-calc-addition-posee');
	await expect(page.locator('#etayageOverlay')).toHaveCount(0);
	await expect(page.locator('.etayage-btn')).toBeVisible();

	expect(errors).toEqual([]);
});

/* ================================================================
   4. Leçon d'avant : la mettre de côté l'ajoute à la file « à revoir »
      du profil, remplace le bouton par une confirmation, sans fermer
      le panneau. (calc-soustraction-posee a un prérequis : la 1re leçon
      de la catégorie, calc-addition-posee, n'en a pas.)
   ================================================================ */

test('soustraction posée : mettre la leçon d’avant de côté l’ajoute à « à revoir » sans fermer le panneau', async ({
	page,
}) => {
	const errors = watchErrors(page);
	await gotoHash(page, 'lecon-calc-soustraction-posee');
	await page.locator('.etayage-btn').click();
	await expect(page.locator('#etayageOverlay')).toBeVisible();

	const epingler = page.locator('#etayEpingler');
	await expect(epingler).toBeVisible();
	await expect(page.locator('.etay-prerequis-txt')).toContainText("L'addition posée");

	await epingler.click();

	// Confirmation à la place du bouton, panneau toujours ouvert.
	await expect(page.locator('#etayEpingler')).toHaveCount(0);
	await expect(page.locator('.etay-prerequis-ok')).toBeVisible();
	await expect(page.locator('#etayageOverlay')).toBeVisible();

	// La file « à revoir » du profil (clé préfixée) porte bien la leçon prérequise.
	const revoir = await page.evaluate(() => localStorage.getItem('e2e/ludaskia_revoir'));
	expect(JSON.parse(revoir ?? '[]')).toContain('calc-addition-posee');

	expect(errors).toEqual([]);
});

/* ================================================================
   5. Accessibilité minimale : Échap ferme le panneau, le focus revient
      au bouton qui l'a ouvert.
   ================================================================ */

test('addition posée : Échap ferme le panneau et rend le focus au bouton persistant', async ({
	page,
}) => {
	const errors = watchErrors(page);
	await gotoHash(page, 'lecon-calc-addition-posee');
	await page.locator('.etayage-btn').click();
	await expect(page.locator('#etayageOverlay')).toBeVisible();

	await page.keyboard.press('Escape');
	await expect(page.locator('#etayageOverlay')).toHaveCount(0);
	await expect(page.locator('.etayage-btn')).toBeFocused();

	expect(errors).toEqual([]);
});
