/* ============================================================
   Désépinglage automatique de la file « à revoir » (#465) — smoke tests e2e.
   ------------------------------------------------------------
   Couvre : le bloc « Retirées automatiquement » de l'espace encadrant
   (onglet Programme, section « À revoir ensemble ») et le ré-épinglage
   d'une entrée qui vient d'en être retirée ; et le nettoyage DUR déclenché
   par la carte « À revoir » de l'accueil enfant (la file persistée perd
   l'entrée, pas seulement son affichage).

   Scénario déterministe : on seed directement la file `ludaskia_revoir`
   avec une leçon déjà SOLIDE (étoilée). Comme les marques de fragilité
   (`ludaskia_revoirFragile`) sont absentes au tout premier rendu, la file
   seedée est « adoptée » (cf. core/encadrant-stats.ts, purgeRevoirSolides)
   et toute entrée solide est retirée dès CE premier rendu — pas besoin de
   deux passages successifs pour observer le retrait.
   ============================================================ */
import { test, expect } from '@playwright/test';
import { watchErrors, gotoHash } from './helpers';

/* Pas de verrou PIN hérité d'un test précédent. */
const CLEAR_PIN = `localStorage.removeItem('ludaskia_encadrant_lock');`;

/* Leçon « math-complements » rendue SOLIDE (étoilée) pour le profil e2e/CE2 :
   c'est ce qui la rend candidate au retrait automatique une fois épinglée. */
const SEED_STARS_SOLIDE = `(() => {
  localStorage.setItem('e2e/ludaskia_stars', JSON.stringify({ 'math-complements@ce2': 1 }));
})();`;

/* File « à revoir » pré-existante contenant cette leçon déjà solide (pas encore
   passée par #465, donc aucune marque de fragilité connue → adoption au 1er rendu). */
const SEED_REVOIR_PIN = `(() => {
  localStorage.setItem('e2e/ludaskia_revoir', JSON.stringify(['math-complements']));
})();`;

test("bloc « Retirées automatiquement » : une notion solide épinglée en est retirée, et se ré-épingle d'un clic", async ({
	page,
}) => {
	const errors = watchErrors(page);
	await page.addInitScript(CLEAR_PIN);
	await page.addInitScript(SEED_STARS_SOLIDE);
	await page.addInitScript(SEED_REVOIR_PIN);
	await gotoHash(page, 'encadrant/programme');

	// Nettoyage dur au tout premier rendu : la notion étoilée quitte la file
	// d'elle-même et apparaît tracée dans « Retirées automatiquement ».
	await expect(
		page.locator('.enc-sub-lab').filter({ hasText: 'Retirées automatiquement' }),
	).toBeVisible();
	await expect(page.locator('.enc-revoir-quand').filter({ hasText: "aujourd'hui" })).toBeVisible();

	const btn = page.locator('button[data-act="epingler"][data-lesson="math-complements"]');
	await expect(btn).toContainText('Épingler');

	// Ré-épingler depuis ce bloc : l'entrée réintègre « Épinglées »…
	await btn.click();
	await expect(btn).toContainText('Retirer');
	// … et la trace « Retirée … » disparaît (elle est de retour dans la file).
	await expect(page.locator('.enc-revoir-quand')).toHaveCount(0);

	expect(errors).toEqual([]);
});

test("accueil enfant : la carte « À revoir » déclenche le nettoyage DUR de la file (pas que l'affichage)", async ({
	page,
}) => {
	const errors = watchErrors(page);
	await page.addInitScript(CLEAR_PIN);
	await page.addInitScript(SEED_STARS_SOLIDE);
	await page.addInitScript(SEED_REVOIR_PIN);
	await gotoHash(page, 'accueil');

	// La notion est déjà solide : la carte « À revoir » n'a rien à proposer.
	await expect(page.locator('#home')).toBeVisible();
	await expect(page.locator('#aRevoir')).toBeHidden();

	// Navigation SPA (hash interne, pas de rechargement) pour ne PAS ré-exécuter
	// les addInitScript ci-dessus, qui re-seederaient la file et masqueraient
	// le nettoyage dur qu'on veut observer côté encadrant.
	await page.evaluate(() => {
		location.hash = 'encadrant/programme';
	});
	await expect(page.locator('.enc-title')).toBeVisible();

	// La leçon n'est plus listée sous « Épinglées »…
	await expect(
		page
			.locator('.enc-revoir button[data-act="epingler"][data-lesson="math-complements"]')
			.filter({ hasText: 'Retirer' }),
	).toHaveCount(0);
	// … mais tracée dans « Retirées automatiquement » (le rendu de l'accueil a bien
	// persisté le retrait, pas seulement filtré l'affichage de la carte).
	await expect(page.locator('.enc-revoir-quand').filter({ hasText: "aujourd'hui" })).toBeVisible();

	expect(errors).toEqual([]);
});
