/* ============================================================
   Suivi des listes de dictée dans l'espace encadrant (#424).
   ------------------------------------------------------------
   Couvre : le bloc « Listes de dictée » (une liste + son avancement),
   l'épinglage qui la fait rejoindre la file « à revoir » (comme une
   leçon du catalogue), la carte « À revoir » de l'accueil enfant qui
   l'affiche ensuite (`data-kind="ortho"`), et le lancement de la
   dictée au clic (hash `ortho-`/`ortho-mode-`, pas une leçon).
   Bonus : épingler une erreur de dictée depuis « Ce qui a été
   difficile récemment » (action désormais possible pour une liste
   d'orthographe, plus seulement pour une leçon du catalogue).
   ============================================================ */
import { test, expect } from '@playwright/test';
import { watchErrors, gotoHash } from './helpers';

/* Pas de verrou PIN hérité d'un test précédent. */
const CLEAR_PIN = `localStorage.removeItem('ludaskia_encadrant_lock');`;

/* Liste de dictée « maison » (source: 'liste' → toujours visible, même à découvrir) :
   un mot dont l'atelier est fait mais aucun mode encore validé → niveau « en cours ».
   Découverte TERMINÉE (atelierFait: true) : le clic sur la carte d'accueil ira donc
   direct à l'écran de choix du mode (hash ortho-mode-), sans repasser par l'atelier. */
const LISTE_ID = 'l-e2e-suivi';
const SEED_ORTHO = {
	banque: {
		w1: {
			id: 'w1',
			mot: 'cahier',
			entourage: [],
			atelierFait: true,
			validation: { motCache: false, tuiles: false, dictee: false },
			revision: { palier: 0, prochaineRevision: null, reussites: 0, dernierTest: null },
			origine: 'liste',
		},
	},
	listes: [{ id: LISTE_ID, label: 'Ma liste maison', motIds: ['w1'], createdAt: 1, updatedAt: 1 }],
	motIdParForme: { cahier: 'w1' },
};

test.beforeEach(async ({ page }) => {
	await page.addInitScript(CLEAR_PIN);
	await page.addInitScript((seed) => {
		localStorage.setItem('e2e/ludaskia_ortho', JSON.stringify(seed));
	}, SEED_ORTHO);
});

test('bloc « Listes de dictée » : la liste et son avancement se rendent dans l’espace encadrant', async ({
	page,
}) => {
	const errors = watchErrors(page);
	await gotoHash(page, 'encadrant');

	await expect(page.locator('.enc-h3').filter({ hasText: 'Listes de dictée' })).toBeVisible();

	const ligne = page.locator(`.enc-detail-item:has([data-lesson="ortho:${LISTE_ID}"])`);
	await expect(ligne).toBeVisible();
	await expect(ligne.locator('.enc-detail-puce.enc-key-en-cours')).toBeVisible();
	await expect(ligne.locator('.enc-detail-meta')).toContainText('maîtrisé');
	await expect(ligne.locator('button[data-act="epingler"]')).toContainText('Épingler');

	expect(errors).toEqual([]);
});

test('épingler une liste de dictée : rejoint « à revoir », apparaît sur l’accueil, lance la dictée', async ({
	page,
}) => {
	const errors = watchErrors(page);
	await gotoHash(page, 'encadrant');

	// Épingler depuis le bloc « Listes de dictée ».
	const btnEpingler = page.locator(
		`.enc-detail-item:has([data-lesson="ortho:${LISTE_ID}"]) button[data-act="epingler"]`,
	);
	await btnEpingler.click();
	await expect(btnEpingler).toContainText('Retirer');

	// Rejoint la section « À revoir ensemble » → « Épinglées ».
	await expect(
		page
			.locator(`.enc-revoir button[data-act="epingler"][data-lesson="ortho:${LISTE_ID}"]`)
			.filter({ hasText: 'Retirer' }),
	).toBeVisible();

	// Retour à l'accueil enfant : la carte « À revoir » affiche la liste (kind ortho).
	await page.locator('.enc-back[data-act="retour"]').click();
	const carte = page.locator('#aRevoir');
	await expect(carte).toBeVisible();
	await expect(carte).toHaveAttribute('data-kind', 'ortho');
	await expect(carte).toHaveAttribute('data-lesson', LISTE_ID);
	await expect(carte.locator('.lj-title')).toHaveText('Ma liste maison');

	// Clic : lance la dictée (pas une leçon du catalogue) → hash ortho-/ortho-mode-.
	await carte.locator('.lj-title').click();
	await expect(page).toHaveURL(new RegExp(`#ortho-(mode-)?${LISTE_ID}$`));
	await expect(page.locator('.mode-choice-title')).toBeVisible();

	expect(errors).toEqual([]);
});

/* Bonus (#424) : une erreur de dictée peut désormais être épinglée depuis
   « Ce qui a été difficile récemment » (l'action était masquée pour une liste
   d'orthographe ; seules les leçons du catalogue pouvaient l'être). */
test('épingler une erreur de dictée depuis « Ce qui a été difficile récemment »', async ({ page }) => {
	const errors = watchErrors(page);
	const now = Date.now();
	await page.addInitScript((liste) => {
		localStorage.setItem('e2e/ludaskia_erreurs', JSON.stringify(liste));
	}, [
		{
			ts: now,
			lessonId: 'fr-ortho-invariables-1',
			mode: 'dictee',
			question: 'Mot à écrire sous la dictée',
			donnee: 'osi',
			attendue: 'aussi',
		},
	]);
	await gotoHash(page, 'encadrant');

	const lecon = page.locator('.enc-err-lecon').filter({ hasText: 'Mots invariables (1)' });
	await expect(lecon).toBeVisible();
	await lecon.locator('.enc-err-sum').click(); // déplie

	const btnEpingler = lecon.locator('button[data-act="epingler"]');
	await expect(btnEpingler).toContainText('Épingler');
	await btnEpingler.click();
	await expect(btnEpingler).toContainText('Retirer');

	await expect(
		page
			.locator('.enc-revoir button[data-act="epingler"][data-lesson="ortho:fr-ortho-invariables-1"]')
			.filter({ hasText: 'Retirer' }),
	).toBeVisible();

	expect(errors).toEqual([]);
});
