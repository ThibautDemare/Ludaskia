/* ============================================================
   Étayage de la NOTION (#490) sur les runners DÉDIÉS du français.
   ------------------------------------------------------------
   `etayage-redige.spec.ts` couvre déjà la forme rédigée (règle + étapes, sans
   déroulé) sur la fiche en saisie et sur le runner QCM générique
   (`.sprint-stage` monté par `demarrerRunner`). Cette PR ajoute le contenu
   rédigé de 53 leçons de FRANÇAIS, dont trois s'appuient sur des runners
   DÉDIÉS jamais exercés côté étayage : « clique sur le mot »
   (`ui/lecon-clic-mot.ts`), le tri en tuiles (`ui/lecon-tri.ts`) et
   l'appariement (`ui/lecon-appariement.ts`). Chacun rend son propre écran,
   mais tous appellent `demarrerRunner` → le bouton persistant (`.etayage-btn`,
   `monterBoutonEtayage`) se monte de la même façon dans les trois cas ; ce
   qu'on vérifie ici, c'est que ce branchement commun fonctionne bien SUR CES
   ÉCRANS-LÀ, et que la notion rédigée sert la bonne leçon.

   On laisse la 4ᵉ famille dédiée (remise en ordre, `ui/lecon-ordre.ts`,
   `fr-vocab-alpha-initiale`) de côté : son mécanisme de sélection/dépôt est
   structurellement très proche de celui du tri déjà couvert ici, pour un
   risque marginal supplémentaire faible.

   Comme `etayage-redige.spec.ts` : on ouvre le panneau AVANT toute réponse
   (le bouton persistant est disponible dès le rendu), on vérifie la FORME
   (règle + étapes, aucun déroulé) sans jamais ancrer sur le TEXTE rédigé
   (relecture en cours, #490 PR 4/4), puis on referme et on s'assure que le
   runner sous-jacent est intact (rien cliqué, rien perdu).
   ============================================================ */
import { test, expect, type Page } from '@playwright/test';
import { watchErrors, gotoHash, seedAideVue } from './helpers';

/* Le bouton persistant se monte APRÈS l'aide au geste (`maybeAutoAide`), qui
   s'auto-affiche au 1er lancement et bloquerait le clic sur `.etayage-btn`.
   On la marque déjà vue (comme champs-lexicaux.spec.ts / appariement.spec.ts)
   pour atteindre directement l'écran d'exercice. */
test.beforeEach(async ({ page }) => {
	await seedAideVue(page);
});

/* Assertions communes à la forme RÉDIGÉE (même contrat que
   `etayage-redige.spec.ts`) : la règle et les étapes sont là, rien de ce qui
   appartient au déroulé pas-à-pas ne l'est. Aucune assertion sur le TEXTE
   rédigé lui-même (titre/règle/étapes) — seulement sur la structure. */
async function verifierFormeRedigee(page: Page): Promise<void> {
	await expect(page.locator('#etayageOverlay')).toBeVisible();
	await expect(page.locator('#etayTitle')).not.toHaveText('');
	await expect(page.locator('.etay-regle')).toBeVisible();
	await expect(page.locator('.etay-regle')).not.toHaveText('');

	const etapes = page.locator('#etayEtapes li');
	const n = await etapes.count();
	expect(n).toBeGreaterThan(0);
	expect(n).toBeLessThanOrEqual(3);

	// Rien du déroulé pas-à-pas : ni compteur, ni visuel, ni bouton « Précédent ».
	await expect(page.locator('.etay-compteur')).toHaveCount(0);
	await expect(page.locator('#etayVisuel')).toHaveCount(0);
	await expect(page.locator('#etayPrec')).toHaveCount(0);

	// Un seul bouton de sortie, déjà libellé pour partir (pas de « Suivant ▶ » à traverser) —
	// c'est ce libellé fixe qui distingue une notion rédigée d'un déroulé en cours de route.
	await expect(page.locator('#etaySuivant')).toHaveText("D'accord, à moi de jouer !");
}

/* ================================================================
   1. « Clique sur le verbe » (fr-gram-clic-verbe, CE2) — runner
      ui/lecon-clic-mot.ts, mots rendus en boutons `.lclic-mot`.
   ================================================================ */

test('clique sur le mot (grammaire) : le bouton persistant ouvre un contenu rédigé, sans déroulé', async ({
	page,
}) => {
	const errors = watchErrors(page);
	await gotoHash(page, 'lecon-fr-gram-clic-verbe'); // mono-mode → lancement direct
	const mots = page.locator('.lclic-mot');
	await mots.first().waitFor();
	const nbMots = await mots.count();

	const btn = page.locator('.etayage-btn');
	await expect(btn).toBeVisible();
	await btn.click();

	await verifierFormeRedigee(page);

	await page.locator('#etaySuivant').click();
	await expect(page.locator('#etayageOverlay')).toHaveCount(0);
	// Le bouton persistant reste disponible, la phrase est intacte derrière : rien
	// n'a été cliqué avant l'ouverture, aucun mot n'est figé.
	await expect(btn).toBeVisible();
	await expect(mots).toHaveCount(nbMots);
	await expect(page.locator('#lclicVerif')).toBeDisabled();

	expect(errors).toEqual([]);
});

/* ================================================================
   2. « Ranger par thème » (fr-vocab-champs-tri, CE2) — runner
      ui/lecon-tri.ts, tuiles à déposer dans deux colonnes.
   ================================================================ */

test('ranger par thème (tri) : le bouton persistant du runner ouvre le même contenu rédigé', async ({
	page,
}) => {
	const errors = watchErrors(page);
	await gotoHash(page, 'lecon-fr-vocab-champs-tri'); // mono-mode → lancement direct
	await page.locator('.ltri-tuile').first().waitFor();
	const nbTuiles = await page.locator('.ltri-tuile').count();

	const btn = page.locator('.etayage-btn');
	await expect(btn).toBeVisible();
	await btn.click();
	await verifierFormeRedigee(page);

	// Fermeture par Échap (accessibilité minimale, cf. etayage.spec.ts) : le focus revient
	// au bouton qui a ouvert le panneau, le tri sous-jacent n'a pas bougé.
	await page.keyboard.press('Escape');
	await expect(page.locator('#etayageOverlay')).toHaveCount(0);
	await expect(btn).toBeFocused();
	await expect(page.locator('.ltri-tuile')).toHaveCount(nbTuiles);
	await expect(page.locator('#ltriVerif')).toBeDisabled();

	expect(errors).toEqual([]);
});

/* ================================================================
   3. « Familles de mots à relier » (fr-vocab-familles-relier, CE2) — runner
      ui/lecon-appariement.ts, deux colonnes de mots reliées par des liens.
   ================================================================ */

test('familles à relier (appariement) : le bouton persistant du runner ouvre le même contenu rédigé', async ({
	page,
}) => {
	const errors = watchErrors(page);
	await gotoHash(page, 'lecon-fr-vocab-familles-relier'); // mono-mode → lancement direct
	await page.locator('.lapp-mot').first().waitFor();
	const nbGauche = await page.locator('.lapp-mot[data-side="g"]').count();

	const btn = page.locator('.etayage-btn');
	await expect(btn).toBeVisible();
	await btn.click();
	await verifierFormeRedigee(page);

	await page.locator('.aide-close').click();
	await expect(page.locator('#etayageOverlay')).toHaveCount(0);
	// Le plateau est intact : aucun lien n'a été tracé pendant que le panneau était ouvert.
	await expect(page.locator('.lapp-mot[data-side="g"]')).toHaveCount(nbGauche);
	await expect(page.locator('.lapp-link')).toHaveCount(0);
	await expect(page.locator('#lappVerif')).toBeDisabled();

	expect(errors).toEqual([]);
});
