/* ============================================================
   Guide de première visite (#330) — smoke.
   Navigation « à froid » (PAS gotoHash, qui amorce les drapeaux « déjà vu ») :
   on amorce un profil AVEC niveau (pas de popup de classe) mais SANS les drapeaux
   du guide, pour que l'enchaînement mot parents → tour enfant s'affiche.
   Viewport projet = Pixel 5 (mobile) : le bouton « ? » vit dans le tiroir.
   ============================================================ */
import { test, expect } from '@playwright/test';
import { watchErrors } from './helpers';

/* Profil neuf, classe CE2 déjà choisie (pas de popup de niveau), guide jamais vu. */
const SEED_NEUF = `localStorage.setItem('ludaskia_profiles', JSON.stringify({ list: [{ uuid: 'e2e', name: 'E2E', emoji: '🦊', updatedAt: 1, niveauReference: 'ce2' }], active: 'e2e' }));`;
/* Idem, mais guide DÉJÀ vu (mot parents + tour) : aucun auto-affichage. */
const SEED_VU =
	SEED_NEUF +
	`localStorage.setItem('e2e/ludaskia_parents_seen', 'true');` +
	`localStorage.setItem('e2e/ludaskia_tour_seen', 'true');`;
/* Profil VIERGE (sans classe ni drapeaux) → enchaînement complet de 1re visite :
   popup de choix de classe, puis mot aux parents, puis tour enfant. */
const SEED_VIERGE = `localStorage.setItem('ludaskia_profiles', JSON.stringify({ list: [{ uuid: 'e2e', name: 'E2E', emoji: '🦊', updatedAt: 1 }], active: 'e2e' }));`;

test('1re visite complète : choix de classe → mot aux parents → tour enfant', async ({ page }) => {
	const errors = watchErrors(page);
	await page.addInitScript(SEED_VIERGE);
	await page.goto('app.html#accueil', { waitUntil: 'networkidle' });
	// 1) Le choix de classe (forcé) s'affiche en premier.
	const classe = page.locator('#onboardingNiveau');
	await expect(classe).toBeVisible();
	await classe.locator('[data-niveau="ce2"]').click();
	await expect(classe).toHaveCount(0);
	// 2) Puis le mot aux parents s'enchaîne.
	const parents = page.locator('#motParentsOverlay');
	await expect(parents).toBeVisible();
	await parents.locator('.parents-ok').click();
	// 3) Puis le tour enfant.
	await expect(page.locator('#tourOverlay')).toBeVisible();
	expect(errors).toEqual([]);
});

test('1re visite : mot aux parents puis tour enfant (3 étapes)', async ({ page }) => {
	const errors = watchErrors(page);
	await page.addInitScript(SEED_NEUF);
	await page.goto('app.html#accueil', { waitUntil: 'networkidle' });
	// Le mot aux parents s'affiche en premier.
	const parents = page.locator('#motParentsOverlay');
	await expect(parents).toBeVisible();
	// « Montrer à mon enfant » → enchaîne sur le tour enfant.
	await parents.locator('.parents-ok').click();
	await expect(parents).toHaveCount(0);
	const tour = page.locator('#tourOverlay');
	await expect(tour).toBeVisible();
	// 3 points de progression, le 1er actif ; 1er bloc surligné = les cartes de jeu.
	await expect(tour.locator('.tour-dot')).toHaveCount(3);
	await expect(tour.locator('.tour-dot').first()).toHaveClass(/on/);
	await expect(page.locator('.cards.tour-cible')).toBeVisible();
	expect(errors).toEqual([]);
});

test('« Suivant » fait avancer les étapes et déplace le surlignage', async ({ page }) => {
	const errors = watchErrors(page);
	await page.addInitScript(SEED_NEUF);
	await page.goto('app.html#accueil', { waitUntil: 'networkidle' });
	await page.locator('#motParentsOverlay .parents-ok').click();
	const tour = page.locator('#tourOverlay');
	const next = tour.locator('.tour-next');
	// Étape 2 : mes progrès.
	await next.click();
	await expect(tour.locator('.tour-dot').nth(1)).toHaveClass(/on/);
	await expect(page.locator('#progression.tour-cible')).toBeVisible();
	// Étape 3 : mes récompenses + bouton final.
	await next.click();
	await expect(tour.locator('.tour-dot').nth(2)).toHaveClass(/on/);
	await expect(page.locator('#rewardNav.tour-cible')).toBeVisible();
	await expect(next).toHaveText(/parti/i);
	// « C'est parti ! » ferme le tour.
	await next.click();
	await expect(tour).toHaveCount(0);
	expect(errors).toEqual([]);
});

test('« Passer » ferme le tour et ne le réaffiche plus', async ({ page }) => {
	const errors = watchErrors(page);
	await page.addInitScript(SEED_NEUF);
	await page.goto('app.html#accueil', { waitUntil: 'networkidle' });
	await page.locator('#motParentsOverlay .parents-ok').click();
	await page.locator('#tourOverlay .tour-skip').click();
	await expect(page.locator('#tourOverlay')).toHaveCount(0);
	// Rechargement : guide vu → ni mot parents ni tour.
	await page.goto('app.html#accueil', { waitUntil: 'networkidle' });
	await expect(page.locator('#motParentsOverlay')).toHaveCount(0);
	await expect(page.locator('#tourOverlay')).toHaveCount(0);
	expect(errors).toEqual([]);
});

test('le bouton « ? » rejoue le tour, sans le mot aux parents', async ({ page }) => {
	const errors = watchErrors(page);
	await page.addInitScript(SEED_VU);
	await page.goto('app.html#accueil', { waitUntil: 'networkidle' });
	// Guide déjà vu : rien ne s'affiche automatiquement.
	await expect(page.locator('#tourOverlay')).toHaveCount(0);
	await expect(page.locator('#motParentsOverlay')).toHaveCount(0);
	// Tiroir mobile (Pixel 5) : ouvrir le menu, puis le bouton « ? ».
	await page.locator('#toolbarBurger').click();
	await page.locator('#btnGuide').click();
	await expect(page.locator('#tourOverlay')).toBeVisible();
	await expect(page.locator('#motParentsOverlay')).toHaveCount(0);
	expect(errors).toEqual([]);
});
