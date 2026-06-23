/* ============================================================
   Balises de partage (Open Graph / Twitter Card) — index.html + app.html.
   Ce que WhatsApp/Messenger/Facebook/X/Slack lisent pour l'aperçu d'un lien
   partagé : on vérifie que les deux pages portent bien un `og:image` (la
   bannière 1200×630), en URL ABSOLUE (les crawlers ne résolvent pas le
   relatif), et que cette image est réellement servie. Pas de `gotoHash` :
   on charge directement chaque page contre la baseURL (…/Ludaskia/).
   ============================================================ */
import { test, expect } from '@playwright/test';

const OG_IMAGE = 'https://thibautdemare.github.io/Ludaskia/og-image.png';

// Chaque page porteuse et son `og:url` propre (absolue, pour le partage).
const PAGES = [
	{ nom: 'vitrine', path: './', url: 'https://thibautdemare.github.io/Ludaskia/' },
	{ nom: 'app', path: 'app.html', url: 'https://thibautdemare.github.io/Ludaskia/app.html' },
];

for (const { nom, path, url } of PAGES) {
	test(`${nom} : balises Open Graph / Twitter présentes et absolues`, async ({ page }) => {
		await page.goto(path, { waitUntil: 'domcontentloaded' });
		const content = (sel: string) => page.locator(sel).getAttribute('content');

		// Image de partage : la bannière, en URL absolue + dimensions annoncées.
		expect(await content('meta[property="og:image"]')).toBe(OG_IMAGE);
		expect(await content('meta[property="og:image:width"]')).toBe('1200');
		expect(await content('meta[property="og:image:height"]')).toBe('630');

		// Titre non vide + url propre à la page.
		expect(await content('meta[property="og:title"]')).toBeTruthy();
		expect(await content('meta[property="og:url"]')).toBe(url);

		// Grande carte côté X/Twitter (sinon simple vignette).
		expect(await content('meta[name="twitter:card"]')).toBe('summary_large_image');
		expect(await content('meta[name="twitter:image"]')).toBe(OG_IMAGE);
	});
}

test('og:image est bien servie (200, image/png)', async ({ page }) => {
	// Résolu contre la baseURL locale (…/Ludaskia/) : confirme que le PNG est livré
	// par le serveur (donc présent dans public/ et copié au build).
	const res = await page.request.get('og-image.png');
	expect(res.status()).toBe(200);
	expect(res.headers()['content-type']).toContain('image/png');
});
