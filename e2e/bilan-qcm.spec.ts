/* ============================================================
   Smoke e2e — QCM SANS trou dans le bilan ordinaire (décision du 10 oct. 2026).
   Avant : un item à choix sans `@` n'avait AUCUN champ à l'écran, l'enfant
   n'avait rien à répondre. Maintenant (`qcmChoixHTML`, core/items.ts) :
   fieldset.fiche-choix + un radio par choix + un `input[type=hidden].ans` qui
   porte `data-answer` (et `data-attendue` = le LIBELLÉ si les choix ont une vue
   riche), alimenté par le radio coché (`initSession`).

   Deux leçons, choisies pour leur déterminisme (bilan scopé à UNE leçon via le
   composeur, cf. README) :
   - `num-frac-sens` (math-numeration) : QCM à vue riche (fractions empilées,
     libellé « trois quarts » ≠ valeur « 3/4 ») → tient le journal et la
     révélation par libellé ;
   - `geo-angles` (math-geometrie) : QCM à libellés bruts → la révélation est la
     valeur elle-même.
   Contre-exemple : `fr-homophones-a` (QCM À TROU) garde son champ texte.
   ============================================================ */
import { test, expect, type Locator, type Page } from '@playwright/test';
import { watchErrors, gotoHash } from './helpers';

const CLEAR_PIN = `localStorage.removeItem('ludaskia_encadrant_lock');`;

/* Lance un bilan scopé à UNE leçon d'une catégorie (mode « bilan », pas sprint). */
async function lancerBilan(page: Page, categorieId: string, lessonId: string): Promise<void> {
	await gotoHash(page, `bilan-cat-${categorieId}`);
	await page.locator('#bcSelectNone').click();
	await page.locator(`.bc-lesson-check[value="${lessonId}"]`).check();
	await expect(page.locator('.bc-mode-radio[value="bilan"]')).toBeChecked();
	await page.locator('#bcRun').click();
	await page.locator('#sheets .fiche-choix').first().waitFor();
}

/* Le champ caché (porteur de la réponse) et le groupe de radios d'un item. */
const champs = (page: Page): Locator => page.locator('#sheets input.ans');
const groupeDe = (page: Page, champ: Locator): Promise<Locator> =>
	champ.getAttribute('id').then((id) => page.locator(`fieldset.fiche-choix[data-for="${id}"]`));

/* Le <label> cliquable d'un radio, par valeur (le radio peut être masqué visuellement). */
const optionPar = (groupe: Locator, valeur: string): Locator =>
	groupe.locator('label.fiche-choix-opt', {
		has: groupe.page().locator(`input[value="${valeur}"]`),
	});

/* Une valeur de choix qui n'est PAS la bonne réponse. */
async function mauvaiseValeur(groupe: Locator, bonne: string): Promise<string> {
	const valeurs = await groupe
		.locator('input[type=radio]')
		.evaluateAll((els) => els.map((e) => (e as HTMLInputElement).value));
	const faux = valeurs.find((v) => v !== bonne);
	expect(faux, 'un QCM doit proposer au moins un mauvais choix').toBeTruthy();
	return faux as string;
}

const journal = async (page: Page) =>
	JSON.parse((await page.evaluate(() => localStorage.getItem('e2e/ludaskia_erreurs'))) ?? '[]') as {
		lessonId: string;
		donnee: string;
		attendue: string;
		question: string;
	}[];

for (const [categorie, lecon] of [
	['math-numeration', 'num-frac-sens'],
	['math-geometrie', 'geo-angles'],
] as const) {
	test(`${lecon} : chaque QCM sans trou montre un groupe de radios, aucun champ texte vide à remplir`, async ({
		page,
	}) => {
		const errors = watchErrors(page);
		await lancerBilan(page, categorie, lecon);

		const n = await champs(page).count();
		expect(n).toBeGreaterThan(0);
		// Autant de groupes que de champs : aucun item sans rien à répondre.
		await expect(page.locator('#sheets fieldset.fiche-choix')).toHaveCount(n);
		for (let i = 0; i < n; i++) {
			const champ = champs(page).nth(i);
			expect(await champ.getAttribute('type')).toBe('hidden');
			expect(await champ.getAttribute('data-answer')).toBeTruthy();
			const groupe = await groupeDe(page, champ);
			expect(await groupe.locator('input[type=radio]').count()).toBeGreaterThanOrEqual(2);
			// Le groupe a un nom accessible (legend) non vide.
			expect(((await groupe.locator('legend').textContent()) ?? '').trim()).not.toBe('');
			// Rien n'est pré-coché : l'enfant doit choisir.
			await expect(groupe.locator('input[type=radio]:checked')).toHaveCount(0);
		}
		expect(errors).toEqual([]);
	});
}

test('bon radio : ✓ ; changer de radio après correction efface la marque', async ({ page }) => {
	const errors = watchErrors(page);
	await lancerBilan(page, 'math-geometrie', 'geo-angles');

	const champ = champs(page).first();
	const bonne = (await champ.getAttribute('data-answer')) as string;
	const groupe = await groupeDe(page, champ);
	const marque = page.locator('#sheets .mark').first();

	await optionPar(groupe, bonne).click();
	await page.locator('#btnVerify').click();
	await expect(marque).toHaveClass(/\bcorrect\b/);

	// Rechoisir (n'importe quel autre radio) : le marquage se lève, comme une saisie.
	await optionPar(groupe, await mauvaiseValeur(groupe, bonne)).click();
	await expect(marque).not.toHaveClass(/\b(correct|wrong)\b/);
	expect(errors).toEqual([]);
});

test('mauvais radio sur geo-angles : ✗ et la bonne réponse révélée', async ({ page }) => {
	const errors = watchErrors(page);
	await lancerBilan(page, 'math-geometrie', 'geo-angles');

	const champ = champs(page).first();
	const bonne = (await champ.getAttribute('data-answer')) as string;
	const groupe = await groupeDe(page, champ);
	await optionPar(groupe, await mauvaiseValeur(groupe, bonne)).click();
	await page.locator('#btnVerify').click();

	const marque = page.locator('#sheets .mark').first();
	await expect(marque).toHaveClass(/\bwrong\b/);
	await expect(marque).toContainText(bonne);
	// La marque est rattachée au groupe (nom/description lus par un lecteur d'écran).
	const marqueId = await marque.getAttribute('id');
	expect(marqueId).toBeTruthy();
	await expect(groupe).toHaveAttribute('aria-describedby', marqueId as string);
	expect(errors).toEqual([]);
});

test('vue riche (fractions) : ✗ révèle le LIBELLÉ, le journal encadrant écrit libellés et non valeurs internes', async ({
	page,
}) => {
	const errors = watchErrors(page);
	await page.addInitScript(CLEAR_PIN);
	await lancerBilan(page, 'math-numeration', 'num-frac-sens');

	const champ = champs(page).first();
	const bonne = (await champ.getAttribute('data-answer')) as string; // valeur interne « 3/4 »
	const libelleBonne = (await champ.getAttribute('data-attendue')) as string; // « trois quarts »
	expect(libelleBonne).toBeTruthy();
	expect(libelleBonne).not.toBe(bonne); // sinon le test ne distinguerait rien

	const groupe = await groupeDe(page, champ);
	const fausse = await mauvaiseValeur(groupe, bonne);
	// Libellé du choix faux = nom accessible posé sur son radio.
	const libelleFausse = (await groupe
		.locator(`input[value="${fausse}"]`)
		.getAttribute('aria-label')) as string;
	expect(libelleFausse).toBeTruthy();

	await optionPar(groupe, fausse).click();
	await page.locator('#btnVerify').click();

	const marque = page.locator('#sheets .mark').first();
	await expect(marque).toHaveClass(/\bwrong\b/);
	await expect(marque).toContainText(libelleBonne);
	await expect(marque).not.toContainText(bonne);

	// Journal : libellés lisibles hors de l'appli, jamais « a/b ».
	const entrees = (await journal(page)).filter(
		(e) => e.lessonId === 'num-frac-sens' && e.donnee === libelleFausse,
	);
	expect(entrees).toHaveLength(1);
	expect(entrees[0].attendue).toBe(libelleBonne);
	expect(entrees[0].question.trim()).not.toBe('');

	// Même chose côté vue encadrant.
	await gotoHash(page, 'encadrant');
	await page.locator('.enc-err-lecon').first().locator('summary').click();
	const ligne = page.locator('.enc-err-item').first();
	await expect(ligne.locator('.enc-err-bonne')).toContainText(libelleBonne);
	await expect(ligne.locator('.enc-err-donnee')).toContainText(libelleFausse);
	expect(errors).toEqual([]);
});

test('reprise : le radio coché est toujours coché après avoir quitté le bilan et rechargé', async ({
	page,
}) => {
	const errors = watchErrors(page);
	await lancerBilan(page, 'math-geometrie', 'geo-angles');

	const champ = champs(page).first();
	const id = (await champ.getAttribute('id')) as string;
	const bonne = (await champ.getAttribute('data-answer')) as string;
	const groupe = await groupeDe(page, champ);
	// Un choix NON trivial (pas le 1er radio) : une restauration « coche le premier » échouerait.
	const valeurs = await groupe
		.locator('input[type=radio]')
		.evaluateAll((els) => els.map((e) => (e as HTMLInputElement).value));
	const choisie = valeurs[valeurs.length - 1];
	expect(choisie).toBeTruthy();
	await optionPar(groupe, choisie).click();
	expect(bonne).toBeTruthy();

	await page.locator('#toolbarBurger').click();
	await page.locator('#btnHome').click();
	await expect(page.locator('#home')).toBeVisible();
	await page.reload({ waitUntil: 'networkidle' });

	const carte = page.locator('.reprise-card').first();
	await expect(carte).toBeVisible();
	await carte.locator('.reprise-continue').click();

	// Le HTML rejoué garde les ids : on retrouve le même item.
	const groupeRepris = page.locator(`fieldset.fiche-choix[data-for="${id}"]`);
	await expect(groupeRepris).toBeVisible();
	await expect(groupeRepris.locator('input[type=radio]:checked')).toHaveCount(1);
	await expect(groupeRepris.locator('input[type=radio]:checked')).toHaveValue(choisie);
	// Et le champ caché suit (sinon « Vérifier » corrigerait une réponse vide).
	await expect(page.locator(`#${id}`)).toHaveValue(choisie);
	expect(errors).toEqual([]);
});

test('QCM à trou (fr-homophones-a) : garde son champ texte au trou, sans groupe de radios', async ({
	page,
}) => {
	const errors = watchErrors(page);
	// L'orthographe n'a pas de bilan de catégorie : on passe par le composeur global,
	// dont on déplie toutes les rubriques repliées pour atteindre la case de la leçon.
	await gotoHash(page, 'bilan-custom');
	await page.locator('#bcSelectNone').click();
	await page.evaluate(() =>
		document.querySelectorAll('details').forEach((d) => d.setAttribute('open', '')),
	);
	await page.locator('.bc-lesson-check[value="fr-homophones-a"]').check();
	await page.locator('#bcRun').click();

	const champ = page.locator('#sheets input.ans').first();
	await champ.waitFor();
	expect(await champ.getAttribute('type')).not.toBe('hidden');
	expect(await champ.getAttribute('data-answer')).toBeTruthy();
	await expect(page.locator('#sheets fieldset.fiche-choix')).toHaveCount(0);

	// Le geste reste : écrire le mot au trou puis vérifier.
	await champ.fill((await champ.getAttribute('data-answer')) as string);
	await page.locator('#btnVerify').click();
	await expect(page.locator('#sheets .mark.correct').first()).toBeVisible();
	expect(errors).toEqual([]);
});

test('après « Vérifier » depuis le bas du bilan, le groupe de choix de la question fausse est amené à l’écran', async ({
	page,
}) => {
	const errors = watchErrors(page);
	await lancerBilan(page, 'math-numeration', 'num-frac-sens');

	const n = await champs(page).count();
	expect(n).toBeGreaterThanOrEqual(3); // sinon la page ne défile pas assez pour que le test dise quelque chose
	// Tout juste, sauf la PREMIÈRE question (la plus haute), répondue faux.
	let idFaux = '';
	for (let i = 0; i < n; i++) {
		const champ = champs(page).nth(i);
		const bonne = (await champ.getAttribute('data-answer')) as string;
		const groupe = await groupeDe(page, champ);
		const valeur = i === 0 ? await mauvaiseValeur(groupe, bonne) : bonne;
		if (i === 0) idFaux = (await champ.getAttribute('id')) as string;
		await optionPar(groupe, valeur).click();
	}
	const groupeFaux = page.locator(`fieldset.fiche-choix[data-for="${idFaux}"]`);

	// Garde de construction : en bas de page, la question fausse est HORS de la fenêtre.
	await page.evaluate(() => window.scrollTo(0, document.documentElement.scrollHeight));
	await expect(groupeFaux).not.toBeInViewport();

	await page.locator('#btnVerify').click();
	await expect(page.locator(`.mark[data-for="${idFaux}"]`)).toHaveClass(/\bwrong\b/);
	// Exigence : l'enfant est mené à son erreur (le défilement fluide laisse `toBeInViewport` réessayer).
	await expect(groupeFaux).toBeInViewport();
	expect(errors).toEqual([]);
});
