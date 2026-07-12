/* ============================================================
   Aide contextuelle des exercices (#272) — smoke tests.
   Couvre les 6 runners concernés (tuiles, ordre, tri, atelier, lettres,
   appariement) via les leçons mono-mode les plus simples (ordre + tri +
   appariement), une leçon tuiles + atelier, et le mode dictée « lettres »
   de l'ortho-runner :

   1. Auto-affichage au 1er lancement + fermeture (.aide-ok).
   2. Présence du bouton .aide-btn ; ré-ouverture à la demande.
   3. Pas de réapparition automatique au 2e chargement
      (aide déjà vue mémorisée par profil, clé e2e/ludaskia_aide_vue).

   Les leçons "ordre" (fr-vocab-alpha-initiale) et "tri"
   (fr-vocab-champs-tri) sont mono-mode → lancement direct du runner,
   chemin le plus robuste pour déclencher l'aide sans passer par un
   écran de choix de mode.

   Le type "lettres" (renderTuiles dans ortho-runner) est atteint via
   l'écran de choix de mode (ortho-mode-{id}) en cliquant le bouton
   .mode-btn[data-mode="tuiles"], ce qui force seanceMode='tuiles' et
   garantit un chemin déterministe vers renderTuiles, sans aléatoire.

   Le bouton « Revoir » (.aide-revoir) est présent sur tous les types
   animés (tuiles, ordre, tri, atelier, lettres), pas seulement l'atelier.
   ============================================================ */
import { test, expect } from '@playwright/test';
import { watchErrors, gotoHash } from './helpers';

/* Clé préfixée du profil e2e (uuid = 'e2e', préfixe = 'e2e/') */
const AIDE_VUE_KEY = 'e2e/ludaskia_aide_vue';

/* Injecte en localStorage un état "aide déjà vue" pour un ou
   plusieurs types, avant la navigation (addInitScript). */
function seedAideVue(types: string[]): string {
	const map: Record<string, boolean> = {};
	for (const t of types) map[t] = true;
	return `localStorage.setItem(${JSON.stringify(AIDE_VUE_KEY)}, ${JSON.stringify(JSON.stringify(map))});`;
}

/* ================================================================
   1. Runner « ordre » — fr-vocab-alpha-initiale
   ================================================================ */

test('aide ordre : auto-affichage au 1er lancement, fermeture via .aide-ok', async ({ page }) => {
	const errors = watchErrors(page);
	// Profil neuf → aucune aide vue : la modale doit s'ouvrir automatiquement.
	await gotoHash(page, 'lecon-fr-vocab-alpha-initiale');
	await page.locator('.lord-tuile').first().waitFor();

	// L'overlay #aideOverlay est visible (auto-affichage 1er lancement).
	await expect(page.locator('#aideOverlay')).toBeVisible();
	// La carte d'aide porte les attributs a11y attendus.
	await expect(page.locator('.aide-modal[role="dialog"]')).toBeVisible();
	await expect(page.locator('#aideTitle')).toBeVisible();
	await expect(page.locator('ol.aide-etapes')).toBeVisible();

	// Fermeture via le bouton principal.
	await page.locator('.aide-ok').click();
	await expect(page.locator('#aideOverlay')).toHaveCount(0);

	expect(errors).toEqual([]);
});

test('aide ordre : bouton .aide-btn présent et rouvre la modale', async ({ page }) => {
	const errors = watchErrors(page);
	// On seed l'aide comme déjà vue → pas d'auto-modale, mais le bouton reste.
	await page.addInitScript(seedAideVue(['ordre']));
	await gotoHash(page, 'lecon-fr-vocab-alpha-initiale');
	await page.locator('.lord-tuile').first().waitFor();

	// Pas d'auto-modale cette fois.
	await expect(page.locator('#aideOverlay')).toHaveCount(0);

	// Le bouton ampoule est présent et visible.
	const btn = page.locator('button.aide-btn');
	await expect(btn).toBeVisible();

	// Cliquer rouvre la modale.
	await btn.click();
	await expect(page.locator('#aideOverlay')).toBeVisible();

	// Fermeture via la croix.
	await page.locator('.aide-close').click();
	await expect(page.locator('#aideOverlay')).toHaveCount(0);

	expect(errors).toEqual([]);
});

test('aide ordre : pas de réapparition automatique au 2e chargement', async ({ page }) => {
	const errors = watchErrors(page);
	// Seed : aide ordre déjà vue.
	await page.addInitScript(seedAideVue(['ordre']));
	await gotoHash(page, 'lecon-fr-vocab-alpha-initiale');
	await page.locator('.lord-tuile').first().waitFor();

	// Aucune modale automatique.
	await expect(page.locator('#aideOverlay')).toHaveCount(0);
	// Mais le bouton est toujours là.
	await expect(page.locator('button.aide-btn')).toBeVisible();

	expect(errors).toEqual([]);
});

/* ================================================================
   2. Runner « tri » — fr-vocab-champs-tri
   ================================================================ */

test('aide tri : auto-affichage au 1er lancement, fermeture via .aide-ok', async ({ page }) => {
	const errors = watchErrors(page);
	await gotoHash(page, 'lecon-fr-vocab-champs-tri');
	await page.locator('.ltri-tuile').first().waitFor();

	await expect(page.locator('#aideOverlay')).toBeVisible();
	await expect(page.locator('.aide-modal[role="dialog"]')).toBeVisible();
	await expect(page.locator('#aideTitle')).toBeVisible();

	await page.locator('.aide-ok').click();
	await expect(page.locator('#aideOverlay')).toHaveCount(0);

	expect(errors).toEqual([]);
});

test('aide tri : bouton .aide-btn présent et rouvre la modale', async ({ page }) => {
	const errors = watchErrors(page);
	await page.addInitScript(seedAideVue(['tri']));
	await gotoHash(page, 'lecon-fr-vocab-champs-tri');
	await page.locator('.ltri-tuile').first().waitFor();

	await expect(page.locator('#aideOverlay')).toHaveCount(0);

	const btn = page.locator('button.aide-btn');
	await expect(btn).toBeVisible();
	await btn.click();
	await expect(page.locator('#aideOverlay')).toBeVisible();

	// Fermeture via .aide-ok.
	await page.locator('.aide-ok').click();
	await expect(page.locator('#aideOverlay')).toHaveCount(0);

	expect(errors).toEqual([]);
});

/* ================================================================
   3. Runner « tuiles » — numération (num-comparer, mode tuiles)
   ================================================================ */

test('aide tuiles : auto-affichage au 1er lancement, fermeture via .aide-ok', async ({ page }) => {
	const errors = watchErrors(page);
	// Le mode tuiles de numération est accessible via l'écran de mode.
	await gotoHash(page, 'mode-num-comparer');
	await page.getByText('Je déplace les tuiles').click();
	await expect(page.locator('#ltuiSlot')).toBeVisible();

	await expect(page.locator('#aideOverlay')).toBeVisible();
	await expect(page.locator('.aide-modal[role="dialog"]')).toBeVisible();

	await page.locator('.aide-ok').click();
	await expect(page.locator('#aideOverlay')).toHaveCount(0);

	expect(errors).toEqual([]);
});

test('aide tuiles : bouton .aide-btn présent et rouvre la modale', async ({ page }) => {
	const errors = watchErrors(page);
	await page.addInitScript(seedAideVue(['tuiles']));
	await gotoHash(page, 'mode-num-comparer');
	await page.getByText('Je déplace les tuiles').click();
	await expect(page.locator('#ltuiSlot')).toBeVisible();

	await expect(page.locator('#aideOverlay')).toHaveCount(0);

	const btn = page.locator('button.aide-btn');
	await expect(btn).toBeVisible();
	await btn.click();
	await expect(page.locator('#aideOverlay')).toBeVisible();

	await page.locator('.aide-ok').click();
	await expect(page.locator('#aideOverlay')).toHaveCount(0);

	expect(errors).toEqual([]);
});

/* ================================================================
   4. Runner « atelier » — liste prédéfinie fr-ortho-invariables-1
   ================================================================ */

test('aide atelier : auto-affichage au 1er lancement, fermeture via .aide-ok', async ({ page }) => {
	const errors = watchErrors(page);
	// Liste prédéfinie → profil neuf = atelier d'abord.
	await gotoHash(page, 'ortho-fr-ortho-invariables-1');
	// Attendre que l'atelier soit monté (le mot s'affiche).
	await page.locator('#atelierMot').waitFor();

	await expect(page.locator('#aideOverlay')).toBeVisible();
	// Le bouton « Revoir » est présent dans la modale (tous les types animés).
	await expect(page.locator('.aide-revoir')).toBeVisible();

	await page.locator('.aide-ok').click();
	await expect(page.locator('#aideOverlay')).toHaveCount(0);

	expect(errors).toEqual([]);
});

test('aide atelier : bouton .aide-btn présent et rouvre la modale', async ({ page }) => {
	const errors = watchErrors(page);
	await page.addInitScript(seedAideVue(['atelier']));
	await gotoHash(page, 'ortho-fr-ortho-invariables-1');
	await page.locator('#atelierMot').waitFor();

	await expect(page.locator('#aideOverlay')).toHaveCount(0);

	const btn = page.locator('button.aide-btn');
	await expect(btn).toBeVisible();
	await btn.click();
	await expect(page.locator('#aideOverlay')).toBeVisible();
	// La modale atelier affiche bien le bouton « Revoir » et ses étapes.
	await expect(page.locator('.aide-revoir')).toBeVisible();
	await expect(page.locator('ol.aide-etapes')).toBeVisible();

	await page.locator('.aide-ok').click();
	await expect(page.locator('#aideOverlay')).toHaveCount(0);

	expect(errors).toEqual([]);
});

/* ================================================================
   5. Runner « lettres » — ortho-runner renderTuiles
      (fr-ortho-invariables-1, mode ciblé « Je remets les lettres en ordre »)

   Chemin déterministe vers renderTuiles : naviguer sur ortho-mode-{id}
   (écran de choix de mode) puis cliquer .mode-btn[data-mode="tuiles"],
   ce qui pose seanceMode='tuiles' et force renderTuiles à chaque mot.
   ================================================================ */

test('aide lettres : auto-affichage au 1er lancement, fermeture via .aide-ok', async ({ page }) => {
	const errors = watchErrors(page);
	// Profil neuf → aucune aide vue : la modale « lettres » doit s'ouvrir automatiquement.
	await gotoHash(page, 'ortho-mode-fr-ortho-invariables-1');
	// Forcer le mode « tuiles » (renderTuiles) via l'écran de choix de mode.
	await page.locator('.mode-btn[data-mode="tuiles"]').click();
	// Attendre que l'écran tuiles soit monté (#construction = zone de construction du mot).
	await page.locator('#construction').waitFor();

	// L'overlay est visible (auto-affichage 1er lancement).
	await expect(page.locator('#aideOverlay')).toBeVisible();
	await expect(page.locator('.aide-modal[role="dialog"]')).toBeVisible();
	// Titre spécifique au type « lettres ».
	await expect(page.locator('#aideTitle')).toHaveText('Comment remettre les lettres ?');
	await expect(page.locator('ol.aide-etapes')).toBeVisible();
	// Le bouton « Revoir » est présent (animation rejouable).
	await expect(page.locator('.aide-revoir')).toBeVisible();

	// Fermeture via le bouton principal.
	await page.locator('.aide-ok').click();
	await expect(page.locator('#aideOverlay')).toHaveCount(0);

	expect(errors).toEqual([]);
});

test('aide lettres : bouton .aide-btn présent et rouvre la modale', async ({ page }) => {
	const errors = watchErrors(page);
	// Seed : aide « lettres » déjà vue → pas d'auto-modale, mais le bouton reste.
	await page.addInitScript(seedAideVue(['lettres']));
	await gotoHash(page, 'ortho-mode-fr-ortho-invariables-1');
	await page.locator('.mode-btn[data-mode="tuiles"]').click();
	await page.locator('#construction').waitFor();

	// Pas d'auto-modale cette fois.
	await expect(page.locator('#aideOverlay')).toHaveCount(0);

	// Le bouton ampoule est présent et visible.
	const btn = page.locator('button.aide-btn');
	await expect(btn).toBeVisible();

	// Cliquer rouvre la modale.
	await btn.click();
	await expect(page.locator('#aideOverlay')).toBeVisible();
	await expect(page.locator('#aideTitle')).toHaveText('Comment remettre les lettres ?');
	await expect(page.locator('.aide-revoir')).toBeVisible();
	await expect(page.locator('ol.aide-etapes')).toBeVisible();

	// Fermeture via la croix.
	await page.locator('.aide-close').click();
	await expect(page.locator('#aideOverlay')).toHaveCount(0);

	expect(errors).toEqual([]);
});

/* ================================================================
   6. Runner « appariement » — fr-vocab-familles-relier (#392)
      Mono-mode → lancement direct du runner, chemin le plus robuste
      (même schéma que « tri »).
   ================================================================ */

test('aide appariement : auto-affichage au 1er lancement, fermeture via .aide-ok', async ({
	page,
}) => {
	const errors = watchErrors(page);
	// Profil neuf → aucune aide vue : la modale « appariement » doit s'ouvrir automatiquement.
	await gotoHash(page, 'lecon-fr-vocab-familles-relier');
	await page.locator('.lapp-mot').first().waitFor();

	await expect(page.locator('#aideOverlay')).toBeVisible();
	await expect(page.locator('.aide-modal[role="dialog"]')).toBeVisible();
	// Titre spécifique au type « appariement ».
	await expect(page.locator('#aideTitle')).toHaveText('Comment relier les mots ?');
	await expect(page.locator('ol.aide-etapes')).toBeVisible();
	// Illustration animée dédiée (le doigt relie « dent » à « dentiste »).
	await expect(page.locator('.aide-anim--appariement')).toBeVisible();
	await expect(page.locator('.aide-revoir')).toBeVisible();

	await page.locator('.aide-ok').click();
	await expect(page.locator('#aideOverlay')).toHaveCount(0);

	expect(errors).toEqual([]);
});

test('aide appariement : bouton .aide-btn présent et rouvre la modale', async ({ page }) => {
	const errors = watchErrors(page);
	// Seed : aide « appariement » déjà vue → pas d'auto-modale, mais le bouton reste.
	await page.addInitScript(seedAideVue(['appariement']));
	await gotoHash(page, 'lecon-fr-vocab-familles-relier');
	await page.locator('.lapp-mot').first().waitFor();

	// Pas d'auto-modale cette fois.
	await expect(page.locator('#aideOverlay')).toHaveCount(0);

	// Le bouton ampoule est présent et visible.
	const btn = page.locator('button.aide-btn');
	await expect(btn).toBeVisible();

	// Cliquer rouvre la modale.
	await btn.click();
	await expect(page.locator('#aideOverlay')).toBeVisible();
	await expect(page.locator('#aideTitle')).toHaveText('Comment relier les mots ?');
	await expect(page.locator('.aide-anim--appariement')).toBeVisible();

	// Fermeture via la croix.
	await page.locator('.aide-close').click();
	await expect(page.locator('#aideOverlay')).toHaveCount(0);

	expect(errors).toEqual([]);
});
