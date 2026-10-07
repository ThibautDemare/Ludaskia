/* ============================================================
   Politique de sécurité du contenu (#734, critère 42) : une CSP en balise
   <meta> dans `app.html` impose `script-src 'self'` sans `unsafe-inline`.
   C'est le FILET si un échappement saute : un `onerror=` ou un <script>
   injecté ne doit pas s'exécuter.

   La spec prouve que la politique MORD, pas seulement qu'elle est écrite :
   on simule l'échappement manquant (injection brute dans le DOM) et on exige
   que le code injecté ne tourne pas ET que le navigateur ait relevé une
   violation `script-src*`. Jouée sur le serveur de dev (Vite compris) ET sur
   le build de production (`PROD_URL`), pour prouver que la balise survit au
   build.
   ============================================================ */
import { test, expect } from '@playwright/test';
import type { Page } from '@playwright/test';
import { gotoHash, watchErrors } from './helpers';
import { PROD_URL } from '../playwright.config';

const CSP = 'meta[http-equiv="Content-Security-Policy"]';

/* Pose l'écouteur de violations, injecte `html` (ou un script dynamique) et
   rend les directives violées. Le drapeau `window.__xss` signale une exécution. */
async function injecter(page: Page, mode: 'onerror' | 'script'): Promise<string[]> {
	await page.evaluate((m) => {
		const w = window as unknown as { __violations: string[]; __xss?: number };
		w.__violations = [];
		document.addEventListener('securitypolicyviolation', (e) => {
			w.__violations.push(e.effectiveDirective);
		});
		if (m === 'onerror') {
			const div = document.createElement('div');
			div.innerHTML = '<img src="x" onerror="window.__xss = 1">';
			document.body.appendChild(div);
		} else {
			const s = document.createElement('script');
			s.textContent = 'window.__xss = 2';
			document.body.appendChild(s);
		}
	}, mode);

	await expect
		.poll(() =>
			page.evaluate(() => (window as unknown as { __violations: string[] }).__violations.length),
		)
		.toBeGreaterThan(0);
	return page.evaluate(() => (window as unknown as { __violations: string[] }).__violations);
}

const xss = (page: Page) => page.evaluate(() => (window as unknown as { __xss?: number }).__xss);

test('critère 42 : en dev, la CSP est posée et le chargement ne déclenche aucune violation', async ({
	page,
}) => {
	const errors = watchErrors(page);
	await gotoHash(page, '');

	await expect(page.locator(CSP)).toHaveAttribute('content', /script-src 'self'/);
	const content = (await page.locator(CSP).getAttribute('content')) ?? '';
	expect(content).not.toContain('unsafe-inline');
	expect(content).not.toContain('unsafe-eval');
	expect(errors).toEqual([]);
});

test('critère 42 : en dev, un onerror injecté ne s’exécute pas et une violation script-src est relevée', async ({
	page,
}) => {
	const pageErrors: string[] = [];
	page.on('pageerror', (e) => pageErrors.push(e.message));
	await gotoHash(page, '');

	const violations = await injecter(page, 'onerror');

	expect(await xss(page)).toBeUndefined();
	expect(violations.some((d) => d.startsWith('script-src'))).toBe(true);
	expect(pageErrors).toEqual([]);
});

test('critère 42 : en dev, un <script> injecté dynamiquement ne s’exécute pas non plus', async ({
	page,
}) => {
	await gotoHash(page, '');

	const violations = await injecter(page, 'script');

	expect(await xss(page)).toBeUndefined();
	expect(violations.some((d) => d.startsWith('script-src'))).toBe(true);
});

test('critère 42 : dans le build de production, la CSP est servie et bloque un onerror injecté', async ({
	page,
	request,
}) => {
	// La balise est dans le HTML servi : preuve qu'elle survit au build.
	const html = await (await request.get(`${PROD_URL}app.html`)).text();
	expect(html).toMatch(/http-equiv="Content-Security-Policy"[^>]*script-src 'self'/);

	const errors = watchErrors(page);
	await page.goto(`${PROD_URL}app.html`, { waitUntil: 'load' });
	await expect(page.locator(CSP)).toHaveAttribute('content', /script-src 'self'/);
	expect(errors).toEqual([]);

	const violations = await injecter(page, 'onerror');
	expect(await xss(page)).toBeUndefined();
	expect(violations.some((d) => d.startsWith('script-src'))).toBe(true);
});
