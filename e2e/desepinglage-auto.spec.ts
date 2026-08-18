/* ============================================================
   Désépinglage automatique de la file « à revoir » (#465) — smoke tests e2e.
   ------------------------------------------------------------
   Couvre : le bloc « Retirées automatiquement » de l'espace encadrant
   (onglet Programme, section « À revoir ensemble ») et le ré-épinglage
   d'une entrée qui vient d'en être retirée ; le nettoyage DUR déclenché
   par la carte « À revoir » de l'accueil enfant (la file persistée perd
   l'entrée, pas seulement son affichage) ; et le même nettoyage DUR vu
   depuis l'onglet Suivi (ligne de détail par catégorie), qui lit lui aussi
   `RecapNotion.epingle` — la purge vit dans `tabPanelHTML` (encadrant.ts),
   AVANT le calcul du récap, pour Suivi ET Programme : une régression qui la
   restreindrait au seul onglet Programme laisserait Suivi afficher
   « Retirer » pour une entrée déjà purgée de la file.

   Scénario déterministe : on seed directement la file `ludaskia_revoir`
   avec une leçon déjà SOLIDE (étoilée). Comme les marques de fragilité
   (`ludaskia_revoirFragile`) sont absentes au tout premier rendu, la file
   seedée est « adoptée » (cf. core/encadrant-stats.ts, purgeRevoirSolides)
   et toute entrée solide est retirée dès CE premier rendu — pas besoin de
   deux passages successifs pour observer le retrait.

   #571 (suivi de #556) retire l'affirmation « X les maîtrise de nouveau » de
   la phrase du bloc (elle prononçait une maîtrise pour TOUTE entrée retirée,
   y compris une leçon d'une classe suivante réussie une seule fois) et porte
   désormais le motif du retrait sur CHAQUE ligne (`.enc-revoir-quand`) : « de
   nouveau maîtrisée » pour une classe suivie/précédente, « essai réussi »
   pour une classe suivante — jamais de maîtrise sur un contenu pas encore
   enseigné. Dernier test du fichier : le CONTRASTE entre les deux motifs sur
   le même écran, profil CE2 par défaut, `math-complements` (CE2, classe
   suivie) face à `num-dec-comparer` (CM1 seule, classe suivante — même leçon
   que `programme-revoir-etat.spec.ts` pour le cas « au-dessus »).
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

test("onglet Suivi : la ligne de détail d'une notion purgée propose « Épingler », pas « Retirer »", async ({
	page,
}) => {
	const errors = watchErrors(page);
	await page.addInitScript(CLEAR_PIN);
	await page.addInitScript(SEED_STARS_SOLIDE);
	await page.addInitScript(SEED_REVOIR_PIN);
	// Suivi est l'onglet par défaut de #encadrant (pas de suffixe de route).
	await gotoHash(page, 'encadrant');

	// Déplier chaque catégorie (clic sur son résumé = toggle natif <details>) pour
	// exposer les lignes de détail par leçon, dont celle de « math-complements ».
	const resumes = page.locator('.enc-cat-sum');
	const n = await resumes.count();
	for (let i = 0; i < n; i++) await resumes.nth(i).click();

	// La purge dure a déjà tourné (dans tabPanelHTML, avant le calcul du récap) :
	// le récap qui alimente cette ligne de détail voit une file déjà nettoyée,
	// donc `epingle` est faux et le bouton propose « Épingler ».
	const btn = page.locator('button[data-act="epingler"][data-lesson="math-complements"]');
	await expect(btn).toContainText('Épingler');

	expect(errors).toEqual([]);
});

/* `num-dec-comparer` (rubrique « Nombres décimaux », CM1 SEULE, cf.
   `programme-revoir-etat.spec.ts`) : pour le profil CE2 par défaut (helpers.ts), c'est une
   classe SUIVANTE — le scénario que #571 corrige. Solidité étoilée au niveau de STOCKAGE
   réel de la leçon (`@cm1`, cf. `origineLecon`/`etatEpingle`), comme `math-complements@ce2`
   ci-dessus pour le cas « classe suivie ». */
const LABEL_AU_DESSUS = 'Je compare les nombres décimaux';
const SEED_STARS_SOLIDE_CONTRASTE = `(() => {
  localStorage.setItem('e2e/ludaskia_stars', JSON.stringify({
    'math-complements@ce2': 1,
    'num-dec-comparer@cm1': 1,
  }));
})();`;
const SEED_REVOIR_PIN_CONTRASTE = `(() => {
  localStorage.setItem('e2e/ludaskia_revoir', JSON.stringify(['math-complements', 'num-dec-comparer']));
})();`;

test('bloc « Retirées automatiquement » : motif « essai réussi » pour une classe suivante, jamais une maîtrise (#571)', async ({
	page,
}) => {
	const errors = watchErrors(page);
	await page.addInitScript(CLEAR_PIN);
	await page.addInitScript(SEED_STARS_SOLIDE_CONTRASTE);
	await page.addInitScript(SEED_REVOIR_PIN_CONTRASTE);
	await gotoHash(page, 'encadrant/programme');

	// La phrase du bloc n'affirme plus aucune maîtrise (elle vaut pour toutes les entrées,
	// y compris celle d'une classe suivante juste en dessous).
	const hint = page
		.locator('.enc-hint')
		.filter({ hasText: "Ces notions ont quitté la liste d'elles-mêmes" });
	await expect(hint).toHaveText(
		"Ces notions ont quitté la liste d'elles-mêmes. Épinglez-en une si vous voulez quand même y revenir.",
	);
	await expect(hint).not.toContainText('maîtrise de nouveau');

	// Contraste sur la MÊME liste : classe suivie → motif de maîtrise…
	const ligneSuivie = page
		.locator('.enc-revoir-item')
		.filter({ hasText: 'Complément à 10/100/1000' });
	await expect(ligneSuivie.locator('.enc-revoir-quand')).toHaveText(
		"Retirée aujourd'hui, de nouveau maîtrisée",
	);

	// … classe suivante → compte-rendu d'essai, jamais une maîtrise.
	const ligneAuDessus = page.locator('.enc-revoir-item').filter({ hasText: LABEL_AU_DESSUS });
	const quandAuDessus = ligneAuDessus.locator('.enc-revoir-quand');
	await expect(quandAuDessus).toHaveText("Retirée aujourd'hui, essai réussi");
	await expect(quandAuDessus).not.toContainText('maîtris');

	expect(errors).toEqual([]);
});
