/*
 * Génère la bannière sociale (`og:image`) 1200×630 de Ludaskia → `public/og-image.png`.
 *
 * Pourquoi un générateur et pas un PNG dessiné à la main : la bannière reprend
 * EXACTEMENT le style de la toolbar (fond accent vert, pastille blanche ronde +
 * logo « arbre », « Ludaskia » + slogan en Nunito). On compose donc un petit
 * HTML avec les vraies couleurs/police du site (logo et fonte EMBARQUÉS en
 * base64 → rendu autonome, sans serveur), puis on le rasterise via Chromium
 * (Playwright, déjà présent pour l'e2e). Régénérer après un changement de logo,
 * de couleur d'accent ou de slogan : `npm run og:gen`.
 */
/* global process, console, document */ // Node en CLI ; `document` vit dans le callback page.evaluate (navigateur)
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import { chromium } from '@playwright/test';

const HERE = dirname(fileURLToPath(import.meta.url));
const REPO = resolve(HERE, '..', '..');
const OUT = process.argv[2] || resolve(REPO, 'public', 'og-image.png');

const logoB64 = readFileSync(resolve(REPO, 'public', 'logo.png')).toString('base64');
const fontB64 = readFileSync(resolve(REPO, 'src', 'fonts', 'nunito-variable.woff2')).toString(
	'base64',
);

// Couleurs reprises de src/styles/base.scss (--accent / --accent-dark / --paper).
const html = `<!doctype html><html><head><meta charset="utf-8"><style>
@font-face{font-family:'Nunito';font-style:normal;font-weight:200 1000;font-display:block;
  src:url(data:font/woff2;base64,${fontB64}) format('woff2');}
*{margin:0;padding:0;box-sizing:border-box;}
html,body{width:1200px;height:630px;}
.banner{width:1200px;height:630px;display:flex;align-items:center;justify-content:center;gap:64px;
  background:linear-gradient(160deg,#2f7d52 0%,#2a7048 100%);
  font-family:'Nunito',system-ui,sans-serif;color:#fff;}
.pastille{flex:none;width:400px;height:400px;border-radius:50%;background:#ffffff;
  display:flex;align-items:center;justify-content:center;box-shadow:0 10px 30px rgba(0,0,0,.22);}
.pastille img{height:300px;width:auto;display:block;}
.txt{display:flex;flex-direction:column;}
.name{font-weight:800;font-size:128px;line-height:1;letter-spacing:.5px;}
.tag{font-weight:600;font-size:46px;line-height:1.2;margin-top:14px;color:rgba(255,255,255,.92);}
</style></head><body>
<div class="banner">
  <div class="pastille"><img src="data:image/png;base64,${logoB64}" alt=""></div>
  <div class="txt">
    <div class="name">Ludaskia</div>
    <div class="tag">s'exercer en s'amusant</div>
  </div>
</div>
</body></html>`;

const browser = await chromium.launch();
try {
	const page = await browser.newPage({
		viewport: { width: 1200, height: 630 },
		deviceScaleFactor: 1,
	});
	await page.setContent(html, { waitUntil: 'load' });
	await page.evaluate(() => document.fonts.ready);
	await page.screenshot({ path: OUT, clip: { x: 0, y: 0, width: 1200, height: 630 } });
} finally {
	await browser.close(); // jamais de Chromium orphelin si le screenshot échoue
}
console.log('Bannière générée →', OUT);
