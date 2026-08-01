/* ============================================================
   Suivi des listes de dictée dans l'espace encadrant (#424, #441).
   ------------------------------------------------------------
   Couvre : le bloc « Listes de dictée » (une liste + son avancement),
   l'épinglage qui la fait rejoindre la file « à revoir » (comme une
   leçon du catalogue), la carte « À revoir » de l'accueil enfant qui
   l'affiche ensuite (`data-kind="ortho"`), et le lancement de la
   dictée au clic (hash `ortho-`/`ortho-mode-`, pas une leçon).
   Bonus : épingler une erreur de dictée depuis « Ce qui a été
   difficile récemment » (action désormais possible pour une liste
   d'orthographe, plus seulement pour une leçon du catalogue).
   #441 : les cartes « Proposer une dictée à l'avance » passent par le
   renderer `ligneRevoir` (badge de niveau, méta « N mots »), et les
   mots d'une dictée deviennent consultables (repli <details>) dans les
   DEUX listes.
   ============================================================ */
import { test, expect } from '@playwright/test';
import { watchErrors, gotoHash } from './helpers';

/* Pas de verrou PIN hérité d'un test précédent. */
const CLEAR_PIN = `localStorage.removeItem('ludaskia_encadrant_lock');`;

/* Liste de dictée « maison » (source: 'liste' → toujours visible, même à découvrir) :
   trois mots dont l'atelier est fait mais aucun mode encore validé → niveau « en cours »,
   découverte TERMINÉE (les 3 `atelierFait: true`) : le clic sur la carte d'accueil ira donc
   direct à l'écran de choix du mode (hash ortho-mode-), sans repasser par l'atelier — décisif
   pour ne pas faire régresser ce test existant (`decouverteEnCours` bascule sur l'atelier dès
   qu'UN mot n'a pas encore le sien).
   Les 2e/3e mots (#441) sont saisis dans un ordre volontairement NON alphabétique
   (« zèbre » avant « abeille ») : ils vérifient que l'aperçu encadrant trie une liste du
   parent (motsApercu), sans changer le niveau « en cours » (maitrises reste à 0, seul le
   compte total bouge). */
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
		w2: {
			id: 'w2',
			mot: 'zèbre',
			entourage: [],
			atelierFait: true,
			validation: { motCache: false, tuiles: false, dictee: false },
			revision: { palier: 0, prochaineRevision: null, reussites: 0, dernierTest: null },
			origine: 'liste',
		},
		w3: {
			id: 'w3',
			mot: 'abeille',
			entourage: [],
			atelierFait: true,
			validation: { motCache: false, tuiles: false, dictee: false },
			revision: { palier: 0, prochaineRevision: null, reussites: 0, dernierTest: null },
			origine: 'liste',
		},
	},
	listes: [
		{
			id: LISTE_ID,
			label: 'Ma liste maison',
			motIds: ['w1', 'w2', 'w3'],
			createdAt: 1,
			updatedAt: 1,
		},
	],
	motIdParForme: { cahier: 'w1', zèbre: 'w2', abeille: 'w3' },
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

/* #441 : les mots d'une liste de dictée sont consultables sans lancer la dictée, via un
   repli <details> scopé aux mots (dernier enfant de la ligne). Fermé par défaut, il ne
   doit ni déplacer ni gêner le bouton « Épingler » (avis a11y : ordre de tabulation). */
test('« Listes de dictée » : les mots sont consultables via un repli fermé par défaut, triés (liste du parent)', async ({
	page,
}) => {
	const errors = watchErrors(page);
	await gotoHash(page, 'encadrant');

	const ligne = page.locator(`.enc-detail-item:has([data-lesson="ortho:${LISTE_ID}"])`);
	const details = ligne.locator('details.enc-mots');
	const summary = details.locator('summary');
	const mots = details.locator('.enc-mots-list li');

	// « Épingler » reste utilisable, repli fermé (contenu présent dans le DOM mais masqué
	// par le rendu natif de <details>, cf. règle CSS du navigateur — pas de `hidden` custom).
	await expect(ligne.locator('button[data-act="epingler"]')).toContainText('Épingler');
	await expect(summary).toHaveAttribute('aria-label', /Voir les mots de.*Ma liste maison/);
	await expect(details).not.toHaveJSProperty('open', true);
	await expect(mots.first()).toBeHidden();

	await summary.click();
	await expect(mots.first()).toBeVisible();

	// Ordre alphabétique (source: 'liste', saisie « zèbre, abeille » dans le seed) : #441.
	await expect(mots).toHaveText(['abeille', 'cahier', 'zèbre']);

	// Le bouton « Épingler » reste fonctionnel une fois le repli ouvert.
	await ligne.locator('button[data-act="epingler"]').click();
	await expect(ligne.locator('button[data-act="epingler"]')).toContainText('Retirer');

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

	// Rejoint la section « À revoir ensemble » → « Épinglées », onglet Programme (#459).
	await page.locator('.enc-tab[data-tab="programme"]').click();
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

/* #441 : les cartes « Proposer une dictée à l'avance » passent désormais par `ligneRevoir`,
   le renderer de la famille .enc-revoir-item — elles gagnent le badge de niveau (constant,
   « à découvrir » : une dictée proposée n'est par construction jamais commencée) et une méta
   « N mots » sous le libellé, ET les mots consultables via le même repli que le bloc Suivi.
   Dictée PRÉDÉFINIE (source: 'predefini') : l'ordre affiché doit rester l'ordre d'ORIGINE
   (pas de tri alphabétique) — fr-ortho-invariables-1 commence par « afin de », « ailleurs »,
   … et compte « à travers » en 7e position seulement (cf. src/data/francais/orthographe.ts) :
   un tri alphabétique le ferait remonter en tête, ce test le détecterait. */
test('« Proposer une dictée à l’avance » : badge « à découvrir », méta et mots (ordre d’origine)', async ({
	page,
}) => {
	const errors = watchErrors(page);
	await gotoHash(page, 'encadrant/programme');

	const bloc = page.locator('.enc-block').filter({ hasText: "Proposer une dictée à l'avance" });
	const carte = bloc.locator('.enc-revoir-item:has([data-lesson="ortho:fr-ortho-invariables-1"])');
	await expect(carte).toBeVisible();

	// Badge de niveau (gagné en passant par ligneRevoir, #441) + méta « N mots ».
	await expect(carte.locator('.enc-revoir-etat.enc-key-a-decouvrir')).toHaveText('à découvrir');
	await expect(carte.locator('.enc-revoir-main .enc-detail-meta')).toHaveText('12 mots');

	// Épingler reste au même endroit et fonctionne (le repli ne l'a pas fait bouger).
	const btnEpingler = carte.locator('button[data-act="epingler"]');
	await expect(btnEpingler).toContainText('Épingler');

	// Mots consultables : repli fermé par défaut, ordre d'origine une fois ouvert.
	const details = carte.locator('details.enc-mots');
	const summary = details.locator('summary');
	const mots = details.locator('.enc-mots-list li');
	await expect(summary).toHaveAttribute('aria-label', /Voir les mots de.*Mots invariables/);
	await expect(mots.first()).toBeHidden();
	await summary.click();
	await expect(mots.first()).toBeVisible();
	await expect(mots.first()).toHaveText('afin de'); // pas « à travers » (1er alphabétique)
	await expect(mots.nth(6)).toHaveText('à travers'); // 7e dans l'ordre d'origine

	// Toujours épinglable une fois le repli ouvert : le clic la fait quitter « Proposer »
	// (comportement inchangé, cf. test dédié ci-dessous) — le repli ne bloque pas l'action.
	await btnEpingler.click();
	await expect(carte).toHaveCount(0);

	expect(errors).toEqual([]);
});

/* Section « Proposer une dictée à l'avance » (#424, épinglage à l'avance ; extraite dans
   son propre bloc de l'onglet Programme par #459, la collapse <details> a disparu) : les
   dictées prédéfinies du niveau, jamais commencées ni déjà épinglées. Le seed du profil
   (beforeEach) ne démarre aucune prédéfinie (seule une liste MAISON est en cours) : l'état
   par défaut suffit. */
test('« Proposer une dictée à l’avance » : épingler une prédéfinie la fait rejoindre le suivi et l’accueil', async ({
	page,
}) => {
	const errors = watchErrors(page);
	// « Proposer une dictée à l'avance » vit dans l'onglet Programme (#459).
	await gotoHash(page, 'encadrant/programme');

	const bloc = page.locator('.enc-block').filter({ hasText: "Proposer une dictée à l'avance" });
	await expect(bloc).toBeVisible();

	const btnEpingler = bloc.locator(
		'button[data-act="epingler"][data-lesson="ortho:fr-ortho-invariables-1"]',
	);
	await expect(btnEpingler).toBeVisible();
	await expect(btnEpingler).toContainText('Épingler');

	await btnEpingler.click();
	// Épinglée à l'avance : quitte la liste « Proposer »…
	await expect(bloc.locator('[data-lesson="ortho:fr-ortho-invariables-1"]')).toHaveCount(0);
	// … rejoint les épinglées, même onglet Programme (« À revoir ensemble »).
	await expect(
		page
			.locator(
				'.enc-revoir button[data-act="epingler"][data-lesson="ortho:fr-ortho-invariables-1"]',
			)
			.filter({ hasText: 'Retirer' }),
	).toBeVisible();
	// … ET rejoint le suivi (Listes de dictée, niveau « à découvrir »), onglet Suivi (#459).
	await page.locator('.enc-tab[data-tab="suivi"]').click();
	await expect(
		page.locator('.enc-detail-item:has([data-lesson="ortho:fr-ortho-invariables-1"])'),
	).toBeVisible();

	// Accueil enfant : la carte « À revoir » la propose, lançable (hash dictée).
	await page.locator('.enc-back[data-act="retour"]').click();
	const carte = page.locator('#aRevoir');
	await expect(carte).toBeVisible();
	await expect(carte).toHaveAttribute('data-kind', 'ortho');
	await expect(carte).toHaveAttribute('data-lesson', 'fr-ortho-invariables-1');
	await carte.locator('.lj-title').click();
	await expect(page).toHaveURL(/#ortho-(mode-)?fr-ortho-invariables-1$/);

	expect(errors).toEqual([]);
});

/* Bonus (#424) : une erreur de dictée peut désormais être épinglée depuis
   « Ce qui a été difficile récemment » (l'action était masquée pour une liste
   d'orthographe ; seules les leçons du catalogue pouvaient l'être). */
test('épingler une erreur de dictée depuis « Ce qui a été difficile récemment »', async ({
	page,
}) => {
	const errors = watchErrors(page);
	const now = Date.now();
	await page.addInitScript(
		(liste) => {
			localStorage.setItem('e2e/ludaskia_erreurs', JSON.stringify(liste));
		},
		[
			{
				ts: now,
				lessonId: 'fr-ortho-invariables-1',
				mode: 'dictee',
				question: 'Mot à écrire sous la dictée',
				donnee: 'osi',
				attendue: 'aussi',
			},
		],
	);
	await gotoHash(page, 'encadrant');

	const lecon = page.locator('.enc-err-lecon').filter({ hasText: 'Mots invariables (1)' });
	await expect(lecon).toBeVisible();
	await lecon.locator('.enc-err-sum').click(); // déplie

	const btnEpingler = lecon.locator('button[data-act="epingler"]');
	await expect(btnEpingler).toContainText('Épingler');
	await btnEpingler.click();
	await expect(btnEpingler).toContainText('Retirer');

	// Rejoint « À revoir ensemble », onglet Programme (#459).
	await page.locator('.enc-tab[data-tab="programme"]').click();
	await expect(
		page
			.locator(
				'.enc-revoir button[data-act="epingler"][data-lesson="ortho:fr-ortho-invariables-1"]',
			)
			.filter({ hasText: 'Retirer' }),
	).toBeVisible();

	expect(errors).toEqual([]);
});
