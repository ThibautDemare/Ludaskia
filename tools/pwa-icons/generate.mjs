/*
 * Génère les icônes du manifeste PWA (#306) → `public/pwa-192.png`,
 * `public/pwa-512.png`, `public/pwa-maskable-512.png`.
 *
 * Même parti pris que la bannière sociale (tools/og-image/) : plutôt qu'un PNG
 * dessiné à la main et qui se désynchronise du site, on compose un petit HTML
 * avec les VRAIES couleurs de l'app (fond accent vert + pastille blanche + logo
 * « arbre », logo embarqué en base64 → rendu autonome), puis on le rasterise via
 * Chromium (Playwright, déjà présent pour l'e2e). Régénérer après un changement
 * de logo ou de couleur d'accent : `npm run pwa:icons`.
 *
 * Deux gabarits, parce qu'Android et iOS ne découpent pas pareil :
 * - `any` : l'icône est affichée telle quelle (le système arrondit lui-même) →
 *   on peut occuper presque toute la surface ;
 * - `maskable` : le système RECADRE selon sa propre forme (cercle, goutte,
 *   « squircle »…) et ne garantit que le disque central de 80 % du côté. Tout ce
 *   qui compte doit tenir dans cette zone sûre, le reste n'est que du fond qui
 *   peut être rogné. D'où une pastille plus petite sur ce gabarit.
 */
/* global process, console */
import { readFileSync, mkdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import { chromium } from '@playwright/test';

const HERE = dirname(fileURLToPath(import.meta.url));
const REPO = resolve(HERE, '..', '..');
const OUTDIR = process.argv[2] || resolve(REPO, 'public');

const logoB64 = readFileSync(resolve(REPO, 'public', 'logo.png')).toString('base64');

/* Proportions exprimées en % du côté, donc identiques à toutes les tailles.
   `pastille` = diamètre du disque blanc ; `logo` = hauteur du logo. En maskable,
   la pastille (72 %) reste sous les 80 % de la zone sûre. */
const GABARITS = [
	{ nom: 'pwa-192.png', taille: 192, pastille: 80, logo: 58 },
	{ nom: 'pwa-512.png', taille: 512, pastille: 80, logo: 58 },
	{ nom: 'pwa-maskable-512.png', taille: 512, pastille: 72, logo: 52 },
];

// Couleurs reprises de src/styles/base.scss (--accent / --accent-dark), comme og-image.
const html = (taille, pastille, logo) => `<!doctype html><html><head><meta charset="utf-8"><style>
*{margin:0;padding:0;box-sizing:border-box;}
html,body{width:${taille}px;height:${taille}px;}
.icone{width:${taille}px;height:${taille}px;display:flex;align-items:center;justify-content:center;
  background:linear-gradient(160deg,#2f7d52 0%,#2a7048 100%);}
.pastille{width:${pastille}%;height:${pastille}%;border-radius:50%;background:#ffffff;
  display:flex;align-items:center;justify-content:center;}
.pastille img{height:${(logo / pastille) * 100}%;width:auto;display:block;}
</style></head><body>
<div class="icone"><div class="pastille"><img src="data:image/png;base64,${logoB64}" alt=""></div></div>
</body></html>`;

mkdirSync(OUTDIR, { recursive: true });
const browser = await chromium.launch();
try {
	for (const g of GABARITS) {
		const page = await browser.newPage({
			viewport: { width: g.taille, height: g.taille },
			deviceScaleFactor: 1,
		});
		await page.setContent(html(g.taille, g.pastille, g.logo), { waitUntil: 'load' });
		const out = resolve(OUTDIR, g.nom);
		await page.screenshot({
			path: out,
			clip: { x: 0, y: 0, width: g.taille, height: g.taille },
		});
		await page.close();
		console.log('Icône générée →', out);
	}
} finally {
	await browser.close(); // jamais de Chromium orphelin si un screenshot échoue
}
