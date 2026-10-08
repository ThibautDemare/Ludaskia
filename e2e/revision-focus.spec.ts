/* ============================================================
   Révision : le focus après chaque question (#528, défaut a11y).

   `renderCurrent` remplace tout le contenu de `#revStage`, « Continuer ▶ » (`#revNext`,
   dans `#revAfter`, dans le stage) compris : sans reprise du focus, il tombe sur <body>
   et un lecteur d'écran n'annonce pas la question suivante. En révision le FORMAT change
   d'une question à l'autre, donc la cible est la carte `#revStage` (`tabindex="-1"`), pas
   une consigne. Deux formats placent le curseur eux-mêmes (saisie, problème) : on ne
   le leur vole pas.
   ============================================================ */
import { test, expect } from '@playwright/test';
import { watchErrors, gotoHash, seedAideVueScript } from './helpers';

const UUID = 'e2e-revision-focus';

/* Rend DEUX leçons « dues » : la révision enchaîne donc deux questions, ce qui est le
   seul moyen d'exercer le passage de l'une à l'autre. */
function seedDues(ids: string[]): string {
	const etat = Object.fromEntries(
		ids.map((id) => [id, { palier: 0, prochaineRevision: 1, reussites: 0, dernierTest: null }]),
	);
	return `
    localStorage.setItem('ludaskia_profiles', ${JSON.stringify(
			JSON.stringify({
				list: [{ uuid: UUID, name: 'Test', emoji: '🦊', updatedAt: 1 }],
				active: UUID,
			}),
		)});
    localStorage.setItem('${UUID}/ludaskia_lessonRevision', ${JSON.stringify(JSON.stringify(etat))});
    ${seedAideVueScript(UUID)}
  `;
}

/* Joue la séance : à CHAQUE question, vérifie où est le focus, répond, passe à la suite.
   Renvoie les contrôles faits (le test exige qu'il y en ait eu, pas une boucle vide). */
async function jouerEtVerifierFocus(
	page: import('@playwright/test').Page,
): Promise<{ saisies: number; clicMots: number; questions: number }> {
	const bilan = { saisies: 0, clicMots: 0, questions: 0 };
	for (let q = 0; q < 6; q++) {
		const stage = page.locator('#revStage');
		await expect(stage).toBeVisible();
		const saisie = page.locator('#revInput');
		const clic = page.locator('.lclic-mot');
		await expect(saisie.or(clic.first())).toBeVisible();
		bilan.questions++;

		if ((await saisie.count()) > 0) {
			// Un champ déjà focalisé par le rendu vaut mieux que la carte : on ne le vole pas.
			await expect(saisie, 'le curseur doit rester dans le champ de saisie').toBeFocused();
			bilan.saisies++;
			await saisie.fill('0');
		} else {
			// Ni <body>, ni un élément resté d'une question précédente : la carte elle-même.
			await expect(stage, 'focus perdu sur <body> à l’arrivée de la question').toBeFocused();
			bilan.clicMots++;
			await clic.first().click();
		}
		await page.locator('#revValidate').click();
		await page.locator('#revNext').click();
		if ((await page.locator('.rev-done').count()) > 0) break;
	}
	return bilan;
}

test('Révision : après « Continuer », le focus est repris par la carte (clic-mot puis clic-mot)', async ({
	page,
}) => {
	const errors = watchErrors(page);
	await page.addInitScript(seedDues(['fr-gram-clic-adj', 'fr-gram-clic-det']));
	await gotoHash(page, 'revision-espacee');
	const bilan = await jouerEtVerifierFocus(page);
	expect(bilan.questions).toBe(2);
	expect(bilan.clicMots).toBe(2); // Q1 ET Q2 : la perte se produisait dès la 1re question
	await expect(page.locator('.rev-done')).toBeVisible();
	expect(errors).toEqual([]);
});

test('Révision : un focus déjà posé par le format n’est pas volé (saisie → le champ garde le curseur)', async ({
	page,
}) => {
	const errors = watchErrors(page);
	await page.addInitScript(seedDues(['num-valeur-position', 'fr-gram-clic-adj']));
	await gotoHash(page, 'revision-espacee');
	const bilan = await jouerEtVerifierFocus(page);
	expect(bilan.questions).toBe(2);
	expect(bilan.saisies).toBe(1); // une saisie ET un clic-mot, quel que soit l'ordre de tirage
	expect(bilan.clicMots).toBe(1);
	await expect(page.locator('.rev-done')).toBeVisible();
	expect(errors).toEqual([]);
});
