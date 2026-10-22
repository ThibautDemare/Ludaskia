/* ============================================================
   Smoke e2e — QCM SANS trou dans le bilan ordinaire (décision du 10 oct. 2026).
   Avant : un item à choix sans `@` n'avait AUCUN champ à l'écran, l'enfant
   n'avait rien à répondre. Maintenant (`qcmChoixHTML`, core/items.ts) :
   fieldset.fiche-choix + un radio par choix + un `input[type=hidden].ans` qui
   porte `data-answer` (et `data-attendue` = le LIBELLÉ si les choix ont une vue
   riche), alimenté par le radio coché (`initSession`).

   Deux leçons, rejouées dans la séance partagée (#777, voir plus bas) :
   - `num-frac-sens` (math-numeration) : QCM à vue riche (fractions empilées,
     libellé « trois quarts » ≠ valeur « 3/4 ») → tient le journal et la
     révélation par libellé ;
   - `geo-angles` (math-geometrie) : QCM à libellés bruts → la révélation est la
     valeur elle-même.

   Retirés par #777 (le bilan joué à l'écran est un parcours, la page unique n'est
   plus qu'imprimée ; aucun écran réel ne garde ces gestes) :
   - « bon radio ✓, changer de radio après correction efface la marque » : la séance
     partagée fige la correction (radios `aria-disabled`), les leçons QCM passent par
     `lqcm` sans fiche : plus aucun écran ne permet « Vérifier puis rechoisir » ;
   - « reprise : le radio coché reste coché après rechargement » : la séance partagée
     n'a pas de reprise, et le parcours reprend la question, pas un radio à moitié coché ;
   - « après Vérifier, le groupe fautif est amené à l'écran » : la séance partagée défile
     vers la correction (`partage-seance.ts`), pas vers la question fausse ; « mener
     l'enfant à son erreur » est porté par la fin de partie du parcours ;
   - « QCM à trou (fr-homophones-a) garde son champ texte » : exigeait l'ancien
     comportement ; l'exigence inverse (le QCM à trou se joue en radios à l'écran) est le
     critère 1 tenu par `e2e/bilan-parcours-suivi.spec.ts`.
   ============================================================ */
import { test, expect, type Locator, type Page } from '@playwright/test';
import { watchErrors, gotoHash } from './helpers';
import { codeDe, envoiBilanDe } from './partage-fixtures';
import { fractionChoiceViews } from '../src/core/fraction-text';

const CLEAR_PIN = `localStorage.removeItem('ludaskia_encadrant_lock');`;

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

/* ---------- #777 : écran « séance partagée » ----------
   Depuis #777, un bilan joué à l'écran est un PARCOURS (une question par écran, voir
   bilan-parcours.spec.ts) : la page unique et ses groupes de radios `fieldset.fiche-choix`
   ne servent plus que dans la séance partagée par lien (`#envoi/<code>`, partage-seance.spec.ts),
   qui garde le même rendu (`renderItem`) et corrige à la demande. Les tests ci-dessous y
   ont été déplacés : mêmes exigences, nouvel écran. */

type ExoQcm = {
	type: 'qcm';
	question: string;
	answer: string;
	choices: string[];
	choicesView?: ReturnType<typeof fractionChoiceViews>;
};

/* Un envoi (bilan) à une leçon, joué jusqu'à l'affichage des items. */
async function ouvrirSeancePartagee(page: Page, lecon: string, exercices: ExoQcm[]) {
	const code = await codeDe(envoiBilanDe([{ lecon, exercices }]));
	await gotoHash(page, `envoi/${code}`);
	await page.locator('#partageCommencer').click();
	await expect(page.locator('.partage-item').first()).toBeVisible();
}

/* Répond juste à tous les items SAUF le premier (déjà répondu faux par le test) : sous
   60 % de réponses, « J'ai fini » ne fige rien (partage-seance.spec.ts, critère 23). */
async function repondreJusteSaufLePremier(page: Page): Promise<void> {
	const n = await champs(page).count();
	for (let i = 1; i < n; i++) {
		const champ = champs(page).nth(i);
		const bonne = (await champ.getAttribute('data-answer')) as string;
		await optionPar(await groupeDe(page, champ), bonne).click();
	}
}

const angles: ExoQcm[] = [
	{
		type: 'qcm',
		question: 'Un angle droit mesure…',
		answer: '90°',
		choices: ['45°', '90°', '180°'],
	},
	{
		type: 'qcm',
		question: 'Un angle plat mesure…',
		answer: '180°',
		choices: ['90°', '180°', '360°'],
	},
];
const FRACS = ['3/4', '1/2', '1/4'];
const fractions: ExoQcm[] = [
	{
		type: 'qcm',
		question: 'Quelle fraction est la plus grande ?',
		answer: '3/4',
		choices: FRACS,
		choicesView: fractionChoiceViews(FRACS),
	},
	{
		type: 'qcm',
		question: 'Quelle fraction vaut une moitié ?',
		answer: '1/2',
		choices: FRACS,
		choicesView: fractionChoiceViews(FRACS),
	},
];

for (const [lecon, exercices] of [
	['num-frac-sens', fractions],
	['geo-angles', angles],
] as const) {
	// #777 (catégorie C) : exigence inchangée, écran déplacé du bilan en page unique vers
	// la séance partagée, seul écran qui rend encore ces QCM en radios.
	test(`${lecon} : chaque QCM sans trou montre un groupe de radios, aucun champ texte vide à remplir`, async ({
		page,
	}) => {
		const errors = watchErrors(page);
		await ouvrirSeancePartagee(page, lecon, [...exercices]);

		const n = await champs(page).count();
		expect(n).toBe(exercices.length);
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

// #777 (catégorie C) : l'exigence « une erreur révèle la bonne réponse, rattachée au groupe »
// vaut dans la séance partagée, où la correction se demande (« Voir ma correction ») au lieu
// de se déclencher par `#btnVerify`.
test('mauvais radio sur geo-angles : ✗ et la bonne réponse révélée', async ({ page }) => {
	const errors = watchErrors(page);
	await ouvrirSeancePartagee(page, 'geo-angles', [...angles]);

	const champ = champs(page).first();
	const bonne = (await champ.getAttribute('data-answer')) as string;
	const groupe = await groupeDe(page, champ);
	await optionPar(groupe, await mauvaiseValeur(groupe, bonne)).click();
	await repondreJusteSaufLePremier(page);
	await page.locator('#partageFini').click();
	await page.locator('#partageVoirCorrection').click();

	const marque = page.locator('#sheets .mark.wrong').first();
	await expect(marque).toBeVisible();
	await expect(marque).toContainText(bonne);
	// La marque est rattachée au groupe (nom/description lus par un lecteur d'écran).
	const marqueId = await marque.getAttribute('id');
	expect(marqueId).toBeTruthy();
	await expect(groupe).toHaveAttribute('aria-describedby', marqueId as string);
	expect(errors).toEqual([]);
});

// #777 (catégorie C) : même exigence (libellés lisibles, jamais « a/b »), déplacée vers la
// séance partagée ; le journal y est écrit à « J'ai fini » (mode « partage »).
test('vue riche (fractions) : ✗ révèle le LIBELLÉ, le journal encadrant écrit libellés et non valeurs internes', async ({
	page,
}) => {
	const errors = watchErrors(page);
	await page.addInitScript(CLEAR_PIN);
	await ouvrirSeancePartagee(page, 'num-frac-sens', [...fractions]);

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
	await repondreJusteSaufLePremier(page);
	await page.locator('#partageFini').click();
	await page.locator('#partageVoirCorrection').click();

	const marque = page.locator('#sheets .mark.wrong').first();
	await expect(marque).toBeVisible();
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
