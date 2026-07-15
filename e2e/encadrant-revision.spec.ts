/* ============================================================
   Espace encadrant — récap du mode Révision (#423). Smoke tests e2e.
   Sème directement `ludaskia_lessonRevision` par UUID (profil « e2e » du
   helper, celui que `gotoHash` amorce) : plus robuste que jouer une session
   complète pour amener des entrées dans la file de répétition espacée.
   Couvre : rendu de la section (entrée due + entrée acquise), bascule
   « Par catégorie » / « Par urgence », état vide (aucune révision seedée).
   ============================================================ */
import { test, expect } from '@playwright/test';
import { watchErrors, gotoHash } from './helpers';

/* Deux leçons réelles du catalogue CE2 (labels tels que rendus par le
   catalogue — cf. `label` dans src/core/catalog.ts / src/data). */
const LABEL_DUE = 'Je compare les nombres'; // num-comparer
const LABEL_ACQUIS = 'Complément à 10/100/1000'; // math-complements

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
	await expect(btnCat).toHaveAttribute('aria-pressed', 'true');
	await expect(btnUrg).toHaveAttribute('aria-pressed', 'false');

	// Bascule vers « Par urgence » : liste à plat, entrées visibles sans dépliage.
	await btnUrg.click();
	await expect(btnUrg).toHaveClass(/on/);
	await expect(btnUrg).toHaveAttribute('aria-pressed', 'true');
	await expect(btnCat).toHaveAttribute('aria-pressed', 'false');
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
