/* ============================================================
   Accueil large (#336+) : sur la grille à DEUX colonnes (≥ 920 px), la colonne
   gauche (progression puis objectifs / récompenses / trophées) doit se caler EN
   HAUT, juste sous le bloc progression — et NON paraître centrée verticalement
   face aux cartes de droite (souvent plus hautes). Régression corrigée via
   `grid-template-rows: auto 1fr` (home.scss) : la 2de rangée absorbe le surplus.
   ============================================================ */
import { test, expect } from '@playwright/test';
import { watchErrors, gotoHash } from './helpers';

// Le projet par défaut émule un mobile (une seule colonne) ; on force un viewport
// large pour exercer la grille à deux colonnes — c'est là que vivait le bug.
test.use({ viewport: { width: 1119, height: 744 } });

test('la colonne gauche se cale sous la progression (grille large)', async ({ page }) => {
	const errors = watchErrors(page);
	await gotoHash(page, 'accueil');

	await expect(page.locator('.home-grid')).toBeVisible();

	const prog = await page.locator('#progression').boundingBox();
	const left = await page.locator('.home-col-left').boundingBox();
	const right = await page.locator('.home-col-right').boundingBox();
	if (!prog || !left || !right) throw new Error('boîtes de la grille introuvables');

	// On est bien sur la grille à deux colonnes (droite à côté de la gauche).
	expect(right.x).toBeGreaterThan(left.x + left.width / 2);
	// Cas qui révélait le bug : la colonne droite est plus haute que prog + gauche.
	expect(right.height).toBeGreaterThan(prog.height + left.height);

	// Le correctif : la colonne gauche colle sous la progression (pas centrée),
	// quelle que soit la hauteur des cartes de droite.
	const gap = left.y - (prog.y + prog.height);
	expect(gap).toBeLessThan(40);

	expect(errors).toEqual([]);
});
