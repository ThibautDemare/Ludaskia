/* ============================================================
   Conversions de mesures à résultat DÉCIMAL au CM1 (#248) — smoke e2e.
   En profil CM1 : les conversions apparaissent dans « Grandeurs et mesures » et la
   leçon des longueurs se joue en fiche ; un item à résultat décimal se rend avec sa
   réponse en écriture à VIRGULE (jamais de point) et une saisie décimale est corrigée
   juste. Pattern maison : goto app.html#..., watchErrors + expect([]), sélecteurs
   stables (.lesson-item, .ans[data-answer], #btnVerify, .mark.correct).
   ============================================================ */
import { test, expect } from '@playwright/test';
import { watchErrors } from './helpers';

/* Profil CM1 : le catalogue est filtré sur CM1 → les conversions y sont surfacées et
   la génération est calibrée au CM1 (résultats décimaux). */
const SEED_CM1 = `localStorage.setItem('ludaskia_profiles', JSON.stringify({ list: [{ uuid: 'e2e', name: 'E2E', emoji: '\\uD83E\\uDD8A', updatedAt: 1, niveauReference: 'cm1' }], active: 'e2e' }));`;

test.beforeEach(async ({ page }) => {
	await page.addInitScript(SEED_CM1);
});

test('CM1 : les conversions apparaissent dans « Grandeurs et mesures »', async ({ page }) => {
	const errors = watchErrors(page);
	await page.goto('app.html#categorie-math-grandeurs-mesures', { waitUntil: 'networkidle' });
	await expect(page.locator('.lesson-item[data-id="mes-longueurs"]')).toBeVisible();
	await expect(page.locator('.lesson-item[data-id="mes-contenances"]')).toBeVisible();
	expect(errors).toEqual([]);
});

test('CM1 longueurs : un résultat décimal se rend en virgule et une saisie décimale est corrigée juste', async ({
	page,
}) => {
	const errors = watchErrors(page);
	// Le trou décimal varie (les paires ×10 décimales et m↔cm petite→grande) ; on recharge
	// jusqu'à obtenir un champ dont la réponse (data-answer) est en écriture à VIRGULE.
	// Probabilité PAR TIRAGE (fiche de 8 items, cf. data/maths/mesures.ts) : pour une paire
	// 'deux-sens' (cm↔mm, dm↔cm, m↔dm) comme pour m↔cm ('vers-grande'), seul le sens
	// petite→grande produit une réponse décimale — l'autre sens rend une CONSIGNE à virgule
	// mais une réponse entière. Sur 6 conversions CM1, P(item décimal) = 1/6 × 4 × 0,4 ≈
	// 26,7 %, donc P(aucun des 8 items décimal) = (1 − 0,267)^8 ≈ 8,4 % : pas un cas rare,
	// une seule fiche ne suffit donc pas à fiabiliser le test.
	// `page.goto` vers un hash IDENTIQUE au hash courant est un no-op côté Chromium (pas de
	// rechargement réel, cf. clic-verbe.spec.ts/gotoCM1 et intercaler-ce2.spec.ts) : sans
	// `.reload()` explicite, les « relances » ci-dessous revoyaient TOUTES la même fiche (celle
	// du tout premier chargement) — la boucle ne retirait donc jamais qu'UN seul tirage réel,
	// d'où l'échec intermittent observé (~8,4 % de chances, retrouvé en usage). Avec un vrai
	// rechargement à chaque tentative, 6 tentatives ramènent le résidu à 0,084^6 ≈ 3×10⁻⁷.
	const champDecimal = page.locator('.ans[data-answer*=","]').first();
	let trouve = false;
	for (let i = 0; i < 6 && !trouve; i++) {
		await page.goto('app.html#lecon-mes-longueurs', { waitUntil: 'networkidle' });
		await page.reload({ waitUntil: 'networkidle' });
		// Attendre que la fiche soit RENDUE (un champ présent) avant de chercher la variante
		// décimale : sinon, sous charge parallèle, `networkidle` peut précéder le rendu du SPA
		// et le comptage tomber sur 0 alors que la fiche existera un instant plus tard.
		await page.locator('.ans').first().waitFor({ state: 'visible' });
		trouve = (await page.locator('.ans[data-answer*=","]').count()) > 0;
	}
	expect(trouve).toBe(true);
	const rep = await champDecimal.getAttribute('data-answer');
	expect(rep).toMatch(/^\d+,\d+$/); // virgule française, jamais de point
	// Clavier adapté à la saisie décimale (virgule) plutôt que chiffres seuls.
	await expect(champDecimal).toHaveAttribute('inputmode', 'decimal');
	await champDecimal.fill(rep ?? '');
	await page.locator('#btnVerify').click();
	await expect(page.locator('.mark.correct').first()).toBeVisible();
	expect(errors).toEqual([]);
});
