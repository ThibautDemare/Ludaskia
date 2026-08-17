/* ============================================================
   Hors-ligne réel (#306) : le service worker (`src/sw.ts`) précache la
   coquille (les trois pages, le bundle, la CSS, la police, les images) à
   l'installation, puis le réchauffement de fond couvre le reste. Cette
   spec vérifie le comportement OFFLINE pour de vrai, pas une approximation.

   Cible le SERVEUR DE PRODUCTION (`vite preview`, `PROD_URL`), pas le serveur
   de dev habituel (`gotoHash`) : le service worker est volontairement
   désactivé sous le serveur de dev (cf. `vite.config.ts`, `pwaEnDev`), un SW
   enregistré y empoisonnerait toutes les autres specs en servant d'un test à
   l'autre les assets mis en cache par le précédent. Navigation ABSOLUE
   (`page.goto` avec l'URL complète), pas `gotoHash` qui vise le serveur de dev.

   Chaque test attend explicitement que le worker CONTRÔLE la page
   (`navigator.serviceWorker.controller`) avant de couper le réseau : c'est le
   signal que l'installation ET l'activation sont terminées, donc que la
   coquille est bel et bien en cache (jamais un `waitForTimeout`).
   ============================================================ */
import { test, expect } from '@playwright/test';
import { watchErrors } from './helpers';
import { PROD_URL } from '../playwright.config';

test('le service worker prend le contrôle de la page après le premier chargement', async ({
	page,
}) => {
	const errors = watchErrors(page);
	await page.goto(`${PROD_URL}app.html`, { waitUntil: 'load' });

	await page.waitForFunction(() => !!navigator.serviceWorker.controller);

	expect(errors).toEqual([]);
});

test("l'app se recharge et se rend hors ligne, une fois la coquille précachée", async ({
	page,
	context,
}) => {
	const errors = watchErrors(page);
	await page.goto(`${PROD_URL}app.html`, { waitUntil: 'load' });
	await page.waitForFunction(() => !!navigator.serviceWorker.controller);

	await context.setOffline(true);
	await page.reload({ waitUntil: 'load' });

	// L'accueil se rend malgré l'absence totale de réseau : bundle, CSS, police
	// et document viennent tous du cache posé par le service worker.
	await expect(page.locator('#home')).toBeVisible();
	await expect(page.locator('.cards')).toBeVisible();

	expect(errors).toEqual([]);
});

test('la vitrine et le guide répondent hors ligne sans avoir été visités (précache de la coquille)', async ({
	page,
	context,
}) => {
	const errors = watchErrors(page);
	// Un seul passage sur l'app suffit à installer + activer le worker, qui
	// précache TOUTE la coquille en une fois (pas seulement app.html) : c'est
	// justement ce que cette spec vérifie, en ne visitant les deux autres pages
	// qu'UNE FOIS le réseau coupé.
	await page.goto(`${PROD_URL}app.html`, { waitUntil: 'load' });
	await page.waitForFunction(() => !!navigator.serviceWorker.controller);

	await context.setOffline(true);

	await page.goto(PROD_URL, { waitUntil: 'load' }); // vitrine (index.html)
	await expect(page.locator('h1')).toBeVisible();

	await page.goto(`${PROD_URL}guide.html`, { waitUntil: 'load' });
	await expect(page.locator('h1')).toBeVisible();

	expect(errors).toEqual([]);
});
