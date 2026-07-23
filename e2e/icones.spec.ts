/* ============================================================
   Smoke test e2e : migration des emojis d'UI fonctionnelle vers les
   icônes Phosphor (SVG inline, helper src/ui/icon.ts). On vérifie que
   les icônes se rendent bien (SVG .ph-icon présent), que le libellé
   textuel des boutons subsiste (accessibilité) et qu'aucune erreur de
   rendu n'apparaît. Le décor expressif (avatars, rangs…) reste en emoji
   et n'est PAS concerné ici.
   ============================================================ */
import { test, expect } from '@playwright/test';
import { watchErrors, gotoHash } from './helpers';

test('toolbar : les boutons portent une icône Phosphor + leur libellé', async ({ page }) => {
	const errors = watchErrors(page);
	// En exercice, Vérifier et Imprimer sont visibles dans la barre d'outils.
	await gotoHash(page, 'lecon-math-tables-addition');
	const verify = page.locator('#btnVerify');
	await expect(verify.locator('svg.ph-icon')).toBeVisible();
	// Le libellé textuel subsiste (il n'était pas porté par l'emoji) → accessibilité.
	await expect(verify).toContainText('Vérifier');
	await expect(page.locator('#btnPrint svg.ph-icon')).toBeVisible();
	expect(errors).toEqual([]);
});

test('accueil : les cartes de mode portent une icône Phosphor', async ({ page }) => {
	const errors = watchErrors(page);
	await gotoHash(page, 'accueil');
	await expect(page.locator('#cardSprint .ico svg.ph-icon')).toBeVisible();
	await expect(page.locator('#cardLecon .ico svg.ph-icon')).toBeVisible();
	expect(errors).toEqual([]);
});

test('écran de choix de mode : chaque mode porte son picto en icône', async ({ page }) => {
	const errors = watchErrors(page);
	await gotoHash(page, 'mode-num-comparer'); // leçon à 2 modes (saisie + tuiles)
	await expect(page.locator('.mode-btn')).toHaveCount(2);
	// Chaque bouton de mode affiche un SVG d'icône (plus d'emoji).
	expect(await page.locator('.mode-btn .mode-btn-ico svg.ph-icon').count()).toBe(2);
	expect(errors).toEqual([]);
});

test('cartes de catégorie : pastille + icône Phosphor', async ({ page }) => {
	const errors = watchErrors(page);
	await gotoHash(page, 'matiere-francais');
	await expect(page.locator('.nav-card .cat-ico svg.ph-icon').first()).toBeVisible();
	// Une icône par catégorie de la matière (Grammaire, Conjugaison, Orthographe, Vocabulaire).
	expect(await page.locator('.nav-card .cat-ico svg.ph-icon').count()).toBeGreaterThan(2);
	expect(errors).toEqual([]);
});

test('écran « Mon espace » : outils du profil rendus en icônes', async ({ page }) => {
	const errors = watchErrors(page);
	await gotoHash(page, 'profils');
	// Outils de SON profil : changer l'avatar + renommer (2 icônes Phosphor).
	await expect(page.locator('.profile-tools button svg.ph-icon').first()).toBeVisible();
	expect(await page.locator('.profile-tools button svg.ph-icon').count()).toBeGreaterThanOrEqual(2);
	expect(errors).toEqual([]);
});

test('espace encadrants : gestion + sauvegarde rendues en icônes', async ({ page }) => {
	const errors = watchErrors(page);
	// Gestion des profils + sauvegarde vivent dans l'onglet Profils (#459).
	await gotoHash(page, 'encadrant/profils');
	// Nouveau profil + export/import portent leur icône.
	await expect(page.locator('#encAdd svg.ph-icon')).toBeVisible();
	await expect(page.locator('[data-act="enc-export"] svg.ph-icon')).toBeVisible();
	await expect(page.locator('[data-act="enc-import"] svg.ph-icon')).toBeVisible();
	// Actions de gestion (repliées) : icônes aussi (renommer / avatar / réinitialiser / supprimer).
	await page.locator('.enc-gerer > summary').first().click();
	expect(await page.locator('.enc-gerer-actions button svg.ph-icon').count()).toBeGreaterThan(2);
	expect(errors).toEqual([]);
});
