/* ============================================================
   Smoke e2e — « Nomme les mots du groupe » (#731), CM1 uniquement.

   Leçon `fr-gram-gn-nommer`, mode unique `nommer` → lancement DIRECT (pas d'écran de
   choix). Widget et runner de l'appariement (#392) : mots du groupe à gauche, étiquettes
   à droite, une paire par mot, aucun intrus. Spec propre parce que le mode `nommer` est
   la maille de `tests/couverture-e2e-gate.test.ts` (#598).

   Critères de #731 portés ici (numérotation de l'issue) :
   - 1 (moitié « geste »)  : groupe montré délimité, mots à relier, aucune classe désignée ;
   - 3  : une paire par mot, jamais d'intrus ;
   - 7  : après une erreur, l'enfant voit quelle étiquette allait avec quel mot ;
   - 8  : l'erreur est journalisée, appariement donné face à l'appariement attendu ;
   - le piège Dét + Adj + Nom, cœur de la leçon : l'adjectif ne se prend pas pour le nom.

   Aucun `data-answer` n'existe sur ce widget (la solution n'est volontairement pas dans
   le DOM avant « Vérifier »). Pour ne pas dépendre du tirage, les tests qui ont besoin
   d'un verdict connu à l'avance RESTREIGNENT la banque aux groupes Dét + Adj + Nom en vol
   (`page.route` sur le module de la leçon) : le rôle de chaque mot est alors garanti par
   la grammaire (déterminant, adjectif, nom), pas recalculé depuis le code. Aucun fichier
   n'est modifié. Si la ligne visée change dans `src/`, `bancheDAN` échoue explicitement.
   ============================================================ */
import { test, expect, type Page } from '@playwright/test';
import { watchErrors, gotoHash, seedAideVue } from './helpers';
import { CLEAR_PIN } from './journal-couverture';

const LECON_HASH = 'lecon-fr-gram-gn-nommer';

/* Profil CM1 (la leçon n'est servie qu'à ce niveau), sans popup ni guides de 1re visite. */
const SEED_CM1 = `(() => {
  localStorage.setItem('ludaskia_profiles', JSON.stringify({ list: [{ uuid: 'e2e', name: 'E2E', emoji: '\\uD83E\\uDD8A', updatedAt: 1, niveauReference: 'cm1' }], active: 'e2e' }));
  localStorage.setItem('e2e/ludaskia_tour_seen', 'true');
  localStorage.setItem('e2e/ludaskia_parents_seen', 'true');
})();`;

const ETIQUETTE = { det: 'déterminant', adj: 'adjectif', nom: 'nom' } as const;

test.beforeEach(async ({ page }) => {
	await page.addInitScript(SEED_CM1);
	await page.addInitScript(CLEAR_PIN);
	await seedAideVue(page);
});

/* Restreint la banque servie aux groupes Dét + Adj + Nom (le piège), en vol. */
async function bancheDAN(page: Page): Promise<void> {
	await page.route('**/data/francais/grammaire-gn-nommer.ts*', async (route) => {
		const reponse = await route.fetch();
		const source = await reponse.text();
		const cible = 'choice(banque)';
		if (!source.includes(cible)) {
			throw new Error(
				`Le tirage « ${cible} » a disparu de grammaire-gn-nommer.ts : adapter bancheDAN.`,
			);
		}
		await route.fulfill({
			response: reponse,
			body: source.replace(cible, "choice(banque.filter((g) => g.patron === 'DAN'))"),
		});
	});
}

/* Les mots du groupe, lus dans l'énoncé (« un grand tableau »). */
async function motsDuGroupe(page: Page): Promise<string[]> {
	const q = (await page.locator('.lapp-titre').textContent()) ?? '';
	const m = q.match(/«\s*([^»]+?)\s*»/);
	if (!m) throw new Error(`Aucun groupe délimité par « » dans l'énoncé : « ${q} »`);
	return m[1].split(/\s+/);
}

async function relier(page: Page, mot: string, etiquette: string): Promise<void> {
	await page.locator(`.lapp-mot[data-side="g"][data-id="${mot}"]`).click();
	await page.locator(`.lapp-mot[data-side="d"][data-id="${etiquette}"]`).click();
}

/* Ouvre la leçon (banque DAN) et renvoie [déterminant, adjectif, nom]. */
async function ouvrirDAN(page: Page): Promise<string[]> {
	await bancheDAN(page);
	await gotoHash(page, LECON_HASH);
	await page.locator('.lapp-mot').first().waitFor();
	const mots = await motsDuGroupe(page);
	expect(mots, 'un groupe Dét + Adj + Nom a trois mots').toHaveLength(3);
	return mots;
}

/* Joue le réflexe visé : l'adjectif pris pour le nom, le nom pour l'adjectif. */
async function jouerLeReflexe(page: Page, [det, adj, nom]: string[]): Promise<void> {
	await relier(page, det, ETIQUETTE.det);
	await relier(page, adj, ETIQUETTE.nom);
	await relier(page, nom, ETIQUETTE.adj);
	await page.locator('#lappVerif').click();
}

test('critères 1 et 3 : groupe délimité, une paire par mot, aucun intrus', async ({ page }) => {
	const errors = watchErrors(page);
	await gotoHash(page, LECON_HASH);
	await page.locator('.lapp-mot').first().waitFor();

	// Mode unique : lancement direct, aucun écran de choix (« nommer » n'est pas un bouton).
	await expect(page.locator('.mode-btn[data-mode="nommer"]')).toHaveCount(0);

	// Le groupe est donné, délimité : ses mots sont exactement ceux de la colonne de gauche.
	const mots = await motsDuGroupe(page);
	expect(mots.length).toBeGreaterThanOrEqual(2);
	expect(mots.length).toBeLessThanOrEqual(3);
	const gauche = page.locator('.lapp-mot[data-side="g"]');
	await expect(gauche).toHaveCount(mots.length);
	const ids = await gauche.evaluateAll((els) => els.map((e) => (e as HTMLElement).dataset.id));
	expect([...ids].sort()).toEqual([...mots].sort());

	// Une étiquette par mot, pas une de plus (un intrus soufflerait ou piégerait) ; toutes
	// prises parmi les trois classes de la leçon.
	const droite = page.locator('.lapp-mot[data-side="d"]');
	await expect(droite).toHaveCount(mots.length);
	const etiquettes = await droite.evaluateAll((els) =>
		els.map((e) => (e as HTMLElement).dataset.id),
	);
	for (const e of etiquettes) expect(Object.values(ETIQUETTE)).toContain(e);

	// Négatif : aucune consigne ne désigne une classe à chercher (tâche inverse, déjà
	// couverte par les leçons « clique sur… »).
	const question = (await page.locator('.lapp-titre').textContent()) ?? '';
	expect(question).not.toMatch(/\b(trouve|cherche|clique|rep[èe]re)\b/i);

	// Geste complet : relier chaque mot, Vérifier s'active, la correction s'affiche, la
	// manche suivante se rend (le verdict dépend du tirage et n'est pas l'objet ici).
	await expect(page.locator('#lappVerif')).toBeDisabled();
	for (let i = 0; i < mots.length; i++) {
		await gauche.nth(i).click();
		await droite.nth(i).click();
	}
	await expect(page.locator('#lappVerif')).toBeEnabled();
	await page.locator('#lappVerif').click();
	await expect(page.locator('.lqcm-ok, .lqcm-ko')).toBeVisible();
	await page.locator('#lappActions button').click();
	await expect(page.locator('#lappVerif')).toBeDisabled();
	await expect(page.locator('.lapp-mot[data-side="g"]').first()).toBeVisible();
	expect(errors).toEqual([]);
});

test('Dét + Adj + Nom : étiqueter l’adjectif « adjectif » et le nom « nom » est juste', async ({
	page,
}) => {
	const errors = watchErrors(page);
	const [det, adj, nom] = await ouvrirDAN(page);

	await relier(page, det, ETIQUETTE.det);
	await relier(page, adj, ETIQUETTE.adj);
	await relier(page, nom, ETIQUETTE.nom);
	await page.locator('#lappVerif').click();

	await expect(page.locator('.lqcm-ok')).toBeVisible();
	await expect(page.locator('.lqcm-ko')).toHaveCount(0);
	await expect(page.locator('.lapp-mot[data-side="g"].correct')).toHaveCount(3);
	expect(errors).toEqual([]);
});

test('critère 7 : après le réflexe « le mot après le déterminant est le nom », l’enfant voit quelle étiquette allait avec quel mot', async ({
	page,
}) => {
	const errors = watchErrors(page);
	const [det, adj, nom] = await ouvrirDAN(page);
	await jouerLeReflexe(page, [det, adj, nom]);

	await expect(page.locator('.lqcm-ko')).toBeVisible();
	// Les deux mots inversés sont signalés faux, le déterminant reste juste.
	await expect(page.locator(`.lapp-mot[data-side="g"][data-id="${det}"]`)).toHaveClass(/correct/);
	await expect(page.locator(`.lapp-mot[data-side="g"][data-id="${adj}"]`)).toHaveClass(/wrong/);
	await expect(page.locator(`.lapp-mot[data-side="g"][data-id="${nom}"]`)).toHaveClass(/wrong/);

	// Le bon appariement est lisible : une ligne par mot, qui porte le mot ET sa bonne étiquette.
	const solution = page.locator('.lapp-solution');
	await expect(solution).toBeVisible();
	const lignes = (await solution.innerText()).split('\n').map((l) => l.trim());
	const attendu: Array<[string, string]> = [
		[det, ETIQUETTE.det],
		[adj, ETIQUETTE.adj],
		[nom, ETIQUETTE.nom],
	];
	for (const [mot, etiquette] of attendu) {
		const ligne = lignes.find((l) => l.startsWith(mot));
		expect(ligne, `aucune ligne de la solution ne commence par « ${mot} »`).toBeDefined();
		expect(ligne, `« ${mot} » devrait être associé à « ${etiquette} »`).toMatch(
			new RegExp(`${etiquette}$`),
		);
	}
	expect(errors).toEqual([]);
});

test('critère 8 : l’erreur est journalisée côté encadrant, appariement donné face à l’appariement attendu', async ({
	page,
}) => {
	const errors = watchErrors(page);
	const [det, adj, nom] = await ouvrirDAN(page);
	await jouerLeReflexe(page, [det, adj, nom]);
	await expect(page.locator('.lqcm-ko')).toBeVisible();

	await gotoHash(page, 'encadrant');
	const carte = page.locator('.enc-err-lecon');
	await expect(
		carte,
		'La manche ratée n’a produit AUCUNE entrée dans le journal (#391).',
	).toHaveCount(1);
	await carte.locator('.enc-err-sum').click();

	// Énoncé lisible hors de l'application : le groupe y figure en entier.
	const enonce = (await carte.locator('.enc-err-q').first().textContent()) ?? '';
	expect(enonce).toContain([det, adj, nom].join(' '));

	// Donné : les mots mal étiquetés avec l'étiquette que l'enfant a choisie.
	const donnee = (await carte.locator('.enc-err-donnee').first().textContent()) ?? '';
	expect(donnee).toMatch(new RegExp(`${adj}\\W+${ETIQUETTE.nom}`));
	expect(donnee).toMatch(new RegExp(`${nom}\\W+${ETIQUETTE.adj}`));

	// Attendu : les mêmes mots avec l'étiquette juste.
	const bonne = (await carte.locator('.enc-err-bonne').first().textContent()) ?? '';
	expect(bonne).toMatch(new RegExp(`${adj}\\W+${ETIQUETTE.adj}`));
	expect(bonne).toMatch(new RegExp(`${nom}\\W+${ETIQUETTE.nom}`));
	expect(errors).toEqual([]);
});
