/* ============================================================
   Smoke e2e — Orthographe lexicale CM1 (#243).
   Filtrage CUMULATIF des dictées prédéfinies : un profil CM1 voit les
   listes CE2 ET les 4 nouvelles listes CM1 (révision spiralaire) ; un
   profil CE2 ne voit que les listes CE2.

   ⚠ Listes taguées par niveau : on amorce un profil CM1/CE2 et on navigue
   DIRECTEMENT (pas gotoHash, qui force CE2 via ENSURE_NIVEAU), comme
   accords-cm1.spec.ts. Dans la catégorie Orthographe, les cartes des dictées
   prédéfinies portent `data-ortho` (rendu catalog-nav.ts), distinct du
   `data-lecon` des leçons « moteur ».
   ============================================================ */
import { test, expect, type Page } from '@playwright/test';
import { watchErrors } from './helpers';

/* Profil amorcé sur un niveau donné (sans popup d'onboarding : niveauReference fixé). */
function seedScript(niveau: 'ce2' | 'cm1'): string {
	return `localStorage.setItem('ludaskia_profiles', JSON.stringify({ list: [{ uuid: 'e2e', name: 'E2E', emoji: '🦊', updatedAt: 1, niveauReference: '${niveau}' }], active: 'e2e' }));`;
}

async function goto(page: Page, niveau: 'ce2' | 'cm1', hash: string): Promise<void> {
	await page.addInitScript(seedScript(niveau));
	await page.goto(`app.html#${hash}`, { waitUntil: 'networkidle' });
}

test('en CM1, la catégorie Orthographe affiche les listes CM1', async ({ page }) => {
	const errors = watchErrors(page);
	await goto(page, 'cm1', 'categorie-fr-orthographe');
	// Au moins une liste CM1 est visible (carte de dictée prédéfinie).
	await expect(page.locator('[data-ortho="fr-ortho-cm1-invariables"]')).toBeVisible();
	await expect(page.locator('[data-ortho="fr-ortho-cm1-homophones"]')).toBeVisible();
	// Les listes CE2 restent présentes (révision spiralaire cumulative).
	await expect(page.locator('[data-ortho="fr-ortho-invariables-1"]')).toBeVisible();
	expect(errors).toEqual([]);
});

test('en CE2, les listes CM1 ne sont pas proposées (contre-épreuve)', async ({ page }) => {
	const errors = watchErrors(page);
	await goto(page, 'ce2', 'categorie-fr-orthographe');
	// La liste CE2 est là…
	await expect(page.locator('[data-ortho="fr-ortho-invariables-1"]')).toBeVisible();
	// …mais aucune liste CM1 n'apparaît.
	await expect(page.locator('[data-ortho="fr-ortho-cm1-invariables"]')).toHaveCount(0);
	await expect(page.locator('[data-ortho="fr-ortho-cm1-homophones"]')).toHaveCount(0);
	expect(errors).toEqual([]);
});
