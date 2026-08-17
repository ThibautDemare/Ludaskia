/* ============================================================
   Smoke test de la page GUIDE PARENTS (#562) — guide.html.
   Troisième page du build multi-page, à côté de la vitrine (index.html)
   et de l'application (app.html). Pas de `gotoHash` ici (qui cible
   app.html) : on charge la page via `page.goto('./guide.html')`, résolu
   contre la baseURL (…/Ludaskia/).
   Couverture : rendu sans erreur, sommaire dont chaque ancre existe
   réellement, liens de sortie, liens entrants depuis la vitrine, doctrine
   « pas de section enseignants » (#562), légende des 4 états d'acquisition.
   ============================================================ */
import { test, expect } from '@playwright/test';
import { watchErrors } from './helpers';

/* Les 9 sections attendues, DANS L'ORDRE de la page (#562). */
const SECTION_IDS = [
	'demarrer',
	'espace',
	'suivre',
	'preparer',
	'dictee',
	'adapter',
	'enfants',
	'papier',
	'faq',
];

/* ================================================================
   A. Rendu de base et structure
   ================================================================ */

test('guide : se rend sans erreur JS', async ({ page }) => {
	const errors = watchErrors(page);
	await page.goto('./guide.html', { waitUntil: 'networkidle' });
	expect(errors).toEqual([]);
});

test('guide : un seul <h1>', async ({ page }) => {
	const errors = watchErrors(page);
	await page.goto('./guide.html', { waitUntil: 'networkidle' });

	const h1s = page.locator('h1');
	await expect(h1s).toHaveCount(1);
	await expect(h1s).toBeVisible();

	expect(errors).toEqual([]);
});

/* ================================================================
   B. Sommaire : chaque lien pointe vers une ancre qui existe réellement
   ================================================================ */

test('guide : les 9 sections existent, dans le bon ordre', async ({ page }) => {
	const errors = watchErrors(page);
	await page.goto('./guide.html', { waitUntil: 'networkidle' });

	// section[id] exclut la section CTA finale (sans id de contenu, hors sommaire).
	const ids = await page
		.locator('main.v-main section[id]')
		.evaluateAll((sections) => sections.map((s) => s.id));
	expect(ids).toEqual(SECTION_IDS);

	expect(errors).toEqual([]);
});

test('guide : le sommaire a 9 liens, chacun vers une ancre existante avec son <h2>', async ({
	page,
}) => {
	const errors = watchErrors(page);
	await page.goto('./guide.html', { waitUntil: 'networkidle' });

	const links = page.locator('nav.g-toc ol > li > a');
	await expect(links).toHaveCount(9);

	const hrefs = await links.evaluateAll((as) => as.map((a) => a.getAttribute('href')));
	expect(hrefs).toEqual(SECTION_IDS.map((id) => `#${id}`));

	// Chaque ancre existe réellement : la section a l'id visé, un <h2>, et
	// son aria-labelledby pointe vers CE <h2> (pas un id orphelin).
	for (const id of SECTION_IDS) {
		const section = page.locator(`section#${id}`);
		await expect(section).toHaveCount(1);

		const labelledby = await section.getAttribute('aria-labelledby');
		expect(labelledby).toBeTruthy();

		const h2 = section.locator('h2').first();
		await expect(h2).toHaveCount(1);
		await expect(h2).toHaveAttribute('id', labelledby!);
	}

	expect(errors).toEqual([]);
});

/* ================================================================
   C. Liens de sortie
   ================================================================ */

test('guide : liens de sortie (retour vitrine, CTA app.html)', async ({ page }) => {
	const errors = watchErrors(page);
	await page.goto('./guide.html', { waitUntil: 'networkidle' });

	const brandHref = await page.locator('a.v-brand').getAttribute('href');
	expect(brandHref).toBe('./');

	const breadcrumbHref = await page.locator('.g-breadcrumb a').getAttribute('href');
	expect(breadcrumbHref).toBe('./');

	const headerCtaHref = await page.locator('.v-header .v-cta').getAttribute('href');
	expect(headerCtaHref).toMatch(/app\.html$/);

	const finalCtaHref = await page.locator('.v-final .v-cta').getAttribute('href');
	expect(finalCtaHref).toMatch(/app\.html$/);

	expect(errors).toEqual([]);
});

test('guide : le footer renvoie aussi vers la vitrine', async ({ page }) => {
	const errors = watchErrors(page);
	await page.goto('./guide.html', { waitUntil: 'networkidle' });

	const footerHref = await page
		.locator('.v-footer a', { hasText: /présentation/i })
		.getAttribute('href');
	expect(footerHref).toBe('./');

	expect(errors).toEqual([]);
});

/* ================================================================
   D. Liens entrants depuis la vitrine (index.html)
   ================================================================ */

test("guide : lien d'en-tête de la vitrine mène au guide", async ({ page }) => {
	const errors = watchErrors(page);
	await page.goto('./', { waitUntil: 'networkidle' });

	const link = page.locator('a.v-header-link[href="guide.html"]');
	await expect(link).toBeVisible();

	await link.click();
	await page.waitForLoadState('networkidle');

	await expect(page).toHaveURL(/guide\.html$/);
	await expect(page.locator('h1')).toBeVisible();

	expect(errors).toEqual([]);
});

test('guide : lien du pied de page de la vitrine mène au guide', async ({ page }) => {
	const errors = watchErrors(page);
	await page.goto('./', { waitUntil: 'networkidle' });

	const link = page.locator('.v-footer a[href="guide.html"]');
	await expect(link).toBeVisible();

	await link.click();
	await page.waitForLoadState('networkidle');

	await expect(page).toHaveURL(/guide\.html$/);
	await expect(page.locator('h1')).toBeVisible();

	expect(errors).toEqual([]);
});

/* ================================================================
   E. Décisions de fond (#562)
   ================================================================ */

test('guide : aucune section ni titre « pour les enseignants » (#562)', async ({ page }) => {
	const errors = watchErrors(page);
	await page.goto('./guide.html', { waitUntil: 'networkidle' });

	// Ne cible que les TITRES (h2 de section, h3 internes, dont la FAQ) : le mot
	// « classe » apparaît légitimement dans la prose et dans le titre de l'entrée
	// FAQ sur l'usage en classe, donc on cible « enseignant » et pas « classe ».
	const titles = await page.locator('main.v-main h2, main.v-main h3').allInnerTexts();
	expect(titles.length).toBeGreaterThan(0);
	for (const t of titles) {
		expect(t).not.toMatch(/enseignant/i);
	}

	// La FAQ contient bien l'entrée sur l'usage en classe (dans le corps, pas en titre dédié).
	const faqItem = page.locator('.v-faq-item', { hasText: /utilisation en classe/i });
	await expect(faqItem).toHaveCount(1);

	expect(errors).toEqual([]);
});

test("guide : légende des 4 états d'acquisition", async ({ page }) => {
	const errors = watchErrors(page);
	await page.goto('./guide.html', { waitUntil: 'networkidle' });

	const items = page.locator('ul.g-etats > li');
	await expect(items).toHaveCount(4);
	await expect(items.locator('.g-badge')).toHaveCount(4);

	expect(errors).toEqual([]);
});
