/* ============================================================
   Espace encadrant — récap du mode Révision (#423). Smoke tests e2e.
   Sème directement `ludaskia_lessonRevision` par UUID (profil « e2e » du
   helper, celui que `gotoHash` amorce) : plus robuste que jouer une session
   complète pour amener des entrées dans la file de répétition espacée.
   Couvre : rendu de la section (entrée due + entrée acquise), bascule
   « Par catégorie » / « Par urgence » / « Par palier » (#555), état vide
   (aucune révision seedée).
   ============================================================ */
import { test, expect } from '@playwright/test';
import { watchErrors, gotoHash } from './helpers';

/* Deux leçons réelles du catalogue CE2 (labels tels que rendus par le
   catalogue — cf. `label` dans src/core/catalog.ts / src/data). */
const LABEL_DUE = 'Je compare les nombres'; // num-comparer
const LABEL_ACQUIS = 'Complément à 10/100/1000'; // math-complements
const LABEL_MID = 'Doubles'; // math-doubles

/* Une entrée DUE (palier intermédiaire, échéance passée) et une entrée
   ACQUISE (palier maximal PALIER_ACQUIS = 6, sans échéance). Clé préfixée
   par le profil actif du helper ('e2e/'). */
const SEED_REVISION = `(() => {
  const now = Date.now();
  const day = 86400000;
  localStorage.setItem('e2e/ludaskia_lessonRevision', JSON.stringify({
    'num-comparer@ce2': { palier: 2, prochaineRevision: now - day, reussites: 2, dernierTest: now - 3 * day },
    'math-complements@ce2': { palier: 6, prochaineRevision: null, reussites: 6, dernierTest: now - 20 * day },
  }));
})();`;

test('récap Révision : section rendue, entrées due + acquise, bascule catégorie/urgence', async ({
	page,
}) => {
	const errors = watchErrors(page);
	await page.addInitScript(SEED_REVISION);
	await gotoHash(page, 'encadrant');

	const section = page.locator('.enc-rev-section');
	await expect(section).toBeVisible();
	expect(await section.locator('.enc-rev-item').count()).toBeGreaterThanOrEqual(2);

	// Vue par défaut : « Par catégorie » (regroupement dépliable, <details>).
	await expect(section.locator('details.enc-rev-d').first()).toBeVisible();
	const btnCat = section.locator('[data-act="revision-mode"][data-mode="categorie"]');
	const btnUrg = section.locator('[data-act="revision-mode"][data-mode="urgence"]');
	await expect(btnCat).toHaveClass(/on/);
	await expect(btnCat).toHaveAttribute('aria-checked', 'true');
	await expect(btnUrg).toHaveAttribute('aria-checked', 'false');

	// Bascule vers « Par urgence » : liste à plat, entrées visibles sans dépliage.
	await btnUrg.click();
	await expect(btnUrg).toHaveClass(/on/);
	await expect(btnUrg).toHaveAttribute('aria-checked', 'true');
	await expect(btnCat).toHaveAttribute('aria-checked', 'false');
	await expect(section.locator('ul.enc-rev-flat')).toBeVisible();

	// L'entrée DUE affiche son palier + une échéance échue (classe `.du`).
	const itemDue = section.locator('.enc-rev-item').filter({ hasText: LABEL_DUE });
	await expect(itemDue.locator('.enc-rev-palier')).toBeVisible();
	await expect(itemDue.locator('.enc-rev-echeance.du')).toBeVisible();

	// L'entrée ACQUISE affiche le badge dédié, jamais de palier/échéance.
	const itemAcquis = section.locator('.enc-rev-item').filter({ hasText: LABEL_ACQUIS });
	await expect(itemAcquis.locator('.enc-rev-badge')).toBeVisible();
	await expect(itemAcquis.locator('.enc-rev-palier')).toHaveCount(0);

	expect(errors).toEqual([]);
});

/* Trois entrées à trois paliers DISTINCTS (0, 3, PALIER_ACQUIS=6), pour éprouver
   l'ORDRE des étages : le plus fragile (palier 0 → « 1 jour ») en premier, un
   palier intermédiaire (palier 3 → « 2 semaines »), « Acquis » en dernier. La
   première (palier 0) est échue (prochaineRevision < now) pour vérifier que
   l'échéance `.du` reste visible même sans répéter le palier (déjà porté par
   l'en-tête d'étage, #555). */
const SEED_PALIER = `(() => {
  const now = Date.now();
  const day = 86400000;
  localStorage.setItem('e2e/ludaskia_lessonRevision', JSON.stringify({
    'num-comparer@ce2': { palier: 0, prochaineRevision: now - day, reussites: 1, dernierTest: now - 2 * day },
    'math-doubles@ce2': { palier: 3, prochaineRevision: now + 5 * day, reussites: 4, dernierTest: now - 10 * day },
    'math-complements@ce2': { palier: 6, prochaineRevision: null, reussites: 6, dernierTest: now - 30 * day },
  }));
})();`;

test('récap Révision : vue « Par palier » — étages du plus fragile au plus ancré, acquis en dernier', async ({
	page,
}) => {
	const errors = watchErrors(page);
	await page.addInitScript(SEED_PALIER);
	await gotoHash(page, 'encadrant');

	const section = page.locator('.enc-rev-section');
	const btnPalier = section.locator('[data-act="revision-mode"][data-mode="palier"]');
	await btnPalier.click();
	await expect(btnPalier).toHaveClass(/on/);
	await expect(btnPalier).toHaveAttribute('aria-checked', 'true');

	// Un étage par palier NON VIDE (les trois seedés), aucun étage intermédiaire vide.
	const etages = section.locator('.enc-rev-etage');
	await expect(etages).toHaveCount(3);

	// ORDRE : le plus fragile d'abord, « Acquis » en dernier — cœur de la fonctionnalité.
	// (`.enc-rev-etage-lab` est le <h3> du titre, distinct du compteur `.enc-rev-etage-n`.)
	await expect(etages.nth(0).locator('h3.enc-rev-etage-lab')).toHaveText('Palier : 1 jour');
	await expect(etages.nth(1).locator('h3.enc-rev-etage-lab')).toHaveText('Palier : 2 semaines');
	await expect(etages.nth(2).locator('h3.enc-rev-etage-lab')).toHaveText('Acquis');
	await expect(etages.nth(0)).toContainText(LABEL_DUE);
	await expect(etages.nth(1)).toContainText(LABEL_MID);
	await expect(etages.nth(2)).toContainText(LABEL_ACQUIS);

	// L'étage du bas garde l'échéance échue sur sa ligne, mais ne répète PAS son
	// palier (déjà porté par l'en-tête « Palier : 1 jour »).
	const itemBas = etages.nth(0).locator('.enc-rev-item').filter({ hasText: LABEL_DUE });
	await expect(itemBas.locator('.enc-rev-echeance.du')).toBeVisible();
	await expect(itemBas.locator('.enc-rev-palier')).toHaveCount(0);

	// L'étage « Acquis » : dans CETTE vue, l'entrée acquise n'affiche PAS le badge
	// dédié (déjà porté par le titre d'étage), contrairement aux vues catégorie/urgence.
	const itemAcquis = etages.nth(2).locator('.enc-rev-item').filter({ hasText: LABEL_ACQUIS });
	await expect(itemAcquis).toHaveClass(/acquis/);
	await expect(itemAcquis.locator('.enc-rev-badge')).toHaveCount(0);

	// Le focus clavier revient sur le bouton actif après le re-rendu complet de la bascule.
	await expect(page.locator(':focus')).toHaveAttribute('data-mode', 'palier');

	expect(errors).toEqual([]);
});

test('récap Révision : état vide (aucune révision programmée)', async ({ page }) => {
	const errors = watchErrors(page);
	await gotoHash(page, 'encadrant');

	const section = page.locator('.enc-rev-section');
	await expect(section).toBeVisible();
	await expect(section.locator('.enc-block')).toHaveCount(0);
	await expect(section.locator('.enc-rev-item')).toHaveCount(0);
	await expect(section).toContainText('Aucune révision');

	expect(errors).toEqual([]);
});
