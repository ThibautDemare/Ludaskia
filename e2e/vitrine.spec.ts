/* ============================================================
   Smoke test de la PAGE VITRINE (#271) — index.html.
   Page d'atterrissage publique distincte de l'application (app.html) :
   pas de `gotoHash` ici (qui cible app.html). On charge la racine via
   `page.goto('./')`, résolu contre la baseURL (…/Ludaskia/).
   Couverture : rendu sans erreur, structure attendue, CTA vers app.html,
   lien « Continuer » conditionnel au profil.
   ============================================================ */
import { test, expect } from '@playwright/test';
import { watchErrors } from './helpers';

/* ================================================================
   A. Rendu de base et structure
   ================================================================ */

test('vitrine : se rend sans erreur JS', async ({ page }) => {
	const errors = watchErrors(page);
	await page.goto('./', { waitUntil: 'networkidle' });
	expect(errors).toEqual([]);
});

test('vitrine : un seul <h1> visible avec le bon id', async ({ page }) => {
	const errors = watchErrors(page);
	await page.goto('./', { waitUntil: 'networkidle' });

	const h1s = page.locator('h1');
	await expect(h1s).toHaveCount(1);
	await expect(page.locator('h1#vHeroTitle')).toBeVisible();

	expect(errors).toEqual([]);
});

/* ================================================================
   B. CTAs principaux → pointent vers app.html
   ================================================================ */

test('vitrine : les CTAs hero et bande finale pointent vers app.html', async ({ page }) => {
	const errors = watchErrors(page);
	await page.goto('./', { waitUntil: 'networkidle' });

	// CTA du hero (le grand bouton vert « Commencer »).
	const heroCtaHref = await page.locator('.v-hero-actions .v-cta').getAttribute('href');
	expect(heroCtaHref).toMatch(/app\.html$/);

	// CTA de la bande finale (.v-final .v-cta).
	const finalCtaHref = await page.locator('.v-final .v-cta').getAttribute('href');
	expect(finalCtaHref).toMatch(/app\.html$/);

	expect(errors).toEqual([]);
});

test('vitrine : cliquer sur le CTA hero charge app.html (toolbar visible)', async ({ page }) => {
	const errors = watchErrors(page);
	await page.goto('./', { waitUntil: 'networkidle' });

	// Clic sur le CTA principal du hero → on doit atterrir sur app.html.
	await page.locator('.v-hero-actions .v-cta').click();
	await page.waitForLoadState('networkidle');

	// L'application est chargée : la barre d'outils est présente.
	await expect(page.locator('.toolbar')).toBeVisible();

	expect(errors).toEqual([]);
});

/* ================================================================
   C. Sections clés et éléments structurants
   ================================================================ */

test('vitrine : bloc confiance .v-trust avec ses garanties', async ({ page }) => {
	const errors = watchErrors(page);
	await page.goto('./', { waitUntil: 'networkidle' });

	await expect(page.locator('.v-trust')).toBeVisible();
	// Quatre garanties (aucun compte, gratuit, données sur l'appareil, hors-ligne).
	await expect(page.locator('.v-guarantees li')).toHaveCount(4);

	expect(errors).toEqual([]);
});

test('vitrine : FAQ avec 5 items .v-faq-item', async ({ page }) => {
	const errors = watchErrors(page);
	await page.goto('./', { waitUntil: 'networkidle' });

	await expect(page.locator('.v-faq-item')).toHaveCount(5);

	expect(errors).toEqual([]);
});

test('vitrine : section #exemples visible', async ({ page }) => {
	const errors = watchErrors(page);
	await page.goto('./', { waitUntil: 'networkidle' });

	await expect(page.locator('#exemples')).toBeVisible();

	expect(errors).toEqual([]);
});

test('vitrine : ancre « Voir un exemple » pointe vers #exemples', async ({ page }) => {
	const errors = watchErrors(page);
	await page.goto('./', { waitUntil: 'networkidle' });

	const anchor = page.locator('a.v-anchor[href="#exemples"]');
	await expect(anchor).toBeVisible();

	expect(errors).toEqual([]);
});

/* ================================================================
   D. Lien « Continuer » conditionnel
   ================================================================ */

test("vitrine : [data-continuer] porte l'attribut hidden sans profil", async ({ page }) => {
	const errors = watchErrors(page);
	await page.goto('./', { waitUntil: 'networkidle' });

	// Sans profil dans le localStorage, vitrine.ts ne retire PAS l'attribut hidden.
	// On teste l'attribut DOM posé/retiré par vitrine.ts (le bon niveau pour la
	// logique JS) ; le masquage VISUEL est garanti à part par la règle
	// `.vitrine [hidden] { display:none !important }` (vitrine.scss).
	await expect(page.locator('[data-continuer]')).toHaveAttribute('hidden', '');

	expect(errors).toEqual([]);
});

test("vitrine : [data-continuer] perd l'attribut hidden quand un profil existe", async ({
	page,
}) => {
	const errors = watchErrors(page);

	// On injecte un profil AVANT le chargement (addInitScript s'exécute avant
	// l'évaluation de src/vitrine.ts, qui lit localStorage au démarrage).
	await page.addInitScript(() => {
		localStorage.setItem(
			'ludaskia_profiles',
			JSON.stringify({
				list: [{ uuid: 'x', name: 'Léa', emoji: '🦊', updatedAt: 1 }],
				active: 'x',
			}),
		);
	});

	await page.goto('./', { waitUntil: 'networkidle' });

	// Avec un profil, vitrine.ts retire l'attribut hidden : on vérifie son absence
	// (le lien devient alors visible, le reset `.vitrine [hidden]` ne s'appliquant plus).
	await expect(page.locator('[data-continuer]')).not.toHaveAttribute('hidden', '');

	expect(errors).toEqual([]);
});
