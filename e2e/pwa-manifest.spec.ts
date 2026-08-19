/* ============================================================
   Contrat d'installabilité (manifeste + icônes PWA, #306).

   Régression réelle (fix/pwa-icone-firefox) : sur Firefox Android, un
   navigateur qui ne lit PAS le manifeste pour fabriquer un raccourci se rabat
   sur les `<link rel="icon">` de la page. Tant que ce slot n'offrait que du
   16/32 px, Firefox affichait l'icône générique du système au lieu du logo —
   rien ne le voyait avant l'utilisateur. Cette spec verrouille les invariants
   qui viennent d'être corrigés : icône de grande taille dans le slot
   standard, maskable déclarée aux deux tailles, chemins absolus cohérents.

   Cible le SERVEUR DE PRODUCTION (`vite preview`, `PROD_URL`), pas le serveur
   de dev habituel : `devOptions.enabled` de vite-plugin-pwa (donc le
   manifeste ET le <link rel="manifest">) n'est actif que si `LUDASKIA_PWA_DEV=1`
   (cf. `vite.config.ts`), ce qui n'est PAS le cas du serveur de dev démarré
   pour les autres specs — y naviguer donnerait un 404 (fallback SPA en HTML,
   pas de `.webmanifest`). En `vite build`, le plugin tourne toujours : c'est
   le seul serveur où le contrat complet est observable, comme pour
   `offline.spec.ts`. Les ICÔNES elles-mêmes (fichiers statiques de `public/`)
   sont servies sur les deux serveurs, mais on reste sur PROD_URL pour que
   toute la spec vise un seul contrat cohérent.
   ============================================================ */
import { test, expect } from '@playwright/test';
import { watchErrors } from './helpers';
import { PROD_URL } from '../playwright.config';

interface ManifestIcon {
	src: string;
	sizes: string;
	type?: string;
	purpose?: string;
}

interface Manifest {
	name: string;
	start_url: string;
	scope: string;
	icons: ManifestIcon[];
}

async function getManifest(request: {
	get: (url: string) => Promise<import('@playwright/test').APIResponse>;
}) {
	const res = await request.get(`${PROD_URL}manifest.webmanifest`);
	return { res, manifest: (await res.json()) as Manifest };
}

test('le manifeste est atteignable, avec le bon type MIME, et se parse', async ({ page }) => {
	const { res, manifest } = await getManifest(page.request);

	expect(res.status()).toBe(200);
	expect(res.headers()['content-type']).toContain('application/manifest+json');
	expect(manifest.name).toBeTruthy();

	// Chemins ABSOLUS et cohérents entre eux (régression du fix : le manifeste
	// mélangeait absolu/relatif). `start_url` doit rester DANS `scope`.
	expect(manifest.start_url.startsWith('/')).toBe(true);
	expect(manifest.scope.startsWith('/')).toBe(true);
	expect(manifest.start_url.startsWith(manifest.scope)).toBe(true);
});

test('le manifeste déclare des icônes any + maskable aux tailles 192 et 512', async ({ page }) => {
	const { manifest } = await getManifest(page.request);

	const a = (purpose: string, size: string) =>
		manifest.icons.some(
			(ic) => ic.purpose === purpose && ic.sizes === size && ic.type === 'image/png',
		);

	// `any` : ce qu'un lanceur standard affiche.
	expect(a('any', '192x192')).toBe(true);
	expect(a('any', '512x512')).toBe(true);
	// `maskable` aux DEUX tailles : c'est le point qui vient de casser (192
	// absente avant le fix) — une régression qui la supprime doit rougir ici.
	expect(a('maskable', '192x192')).toBe(true);
	expect(a('maskable', '512x512')).toBe(true);

	// Chaque `src` déclaré est un chemin absolu, aligné sur `scope`/`start_url`.
	for (const icon of manifest.icons) {
		expect(icon.src.startsWith('/')).toBe(true);
	}
});

test('chaque icône déclarée par le manifeste répond réellement avec une image', async ({
	page,
}) => {
	// Le test qui aurait attrapé une URL cassée par un changement de `base` :
	// un `src` mal résolu (relatif oublié, base désynchronisée) donne un 404
	// silencieux pour tout système qui ne fait QUE lire le manifeste sans
	// jamais essayer de charger l'icône avant l'installation.
	const { manifest } = await getManifest(page.request);
	expect(manifest.icons.length).toBeGreaterThan(0);

	for (const icon of manifest.icons) {
		// `src` est un chemin absolu (vérifié ci-dessus) : il se résout contre
		// l'ORIGINE, pas contre l'URL du manifeste — comme le ferait un navigateur.
		const url = new URL(icon.src, PROD_URL).toString();
		const res = await page.request.get(url);
		expect(res.status(), `icône ${icon.src}`).toBe(200);
		expect(res.headers()['content-type'], `icône ${icon.src}`).toContain('image/');
	}
});

const PAGES = [
	{ nom: 'vitrine (index.html)', url: PROD_URL },
	{ nom: 'app (app.html)', url: `${PROD_URL}app.html` },
	{ nom: 'guide (guide.html)', url: `${PROD_URL}guide.html` },
];

for (const { nom, url } of PAGES) {
	test(`${nom} déclare le manifeste et une icône de grande taille`, async ({ page }) => {
		const errors = watchErrors(page);
		await page.goto(url, { waitUntil: 'load' });

		// C'est CE point précis qui aurait attrapé la régression Firefox : un
		// navigateur qui ignore le manifeste pour fabriquer un raccourci se
		// rabat sur ce slot, et n'y trouvait avant le fix que du 16/32 px.
		await expect(page.locator('link[rel="icon"][sizes="192x192"]')).toHaveAttribute(
			'href',
			'/Ludaskia/pwa-192.png',
		);
		await expect(page.locator('link[rel="manifest"]')).toHaveAttribute(
			'href',
			'/Ludaskia/manifest.webmanifest',
		);

		expect(errors).toEqual([]);
	});
}
